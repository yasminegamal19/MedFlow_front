import { useEffect, useMemo, useState } from "react";
import {
  LogOut, MapPin, Database, LayoutDashboard, PlusCircle, ClipboardList,
  Clock3, CheckCircle2, AlertTriangle, ArrowUpRight, FileStack, GitBranch,
  Search, Filter, ChevronDown, ChevronLeft, ChevronRight, Download, Route,
  Sparkles,
} from "lucide-react";
import { GlobalStyle } from "./styles.jsx";
import { updateProfile, listCases } from "./api.js";
import { resolveReferralHub } from "./albertaReferralRouting.js";
import TableEditor from "./TableEditor.jsx";
import ClinicalPathwaysBrowser from "./ClinicalPathwaysBrowser.jsx";
import ReferralRoutingBrowser from "./ReferralRoutingBrowser.jsx";
import AiRequestsBrowser from "./AiRequestsBrowser.jsx";

const STATUS_META = {
  created: { label: "Created", tone: "neutral" },
  extracting: { label: "Extracting", tone: "blue" },
  validating: { label: "Validating", tone: "blue" },
  draft_ready: { label: "Draft ready", tone: "amber" },
  pending_review: { label: "Pending review", tone: "amber" },
  approved: { label: "Approved", tone: "sage" },
  sent: { label: "Sent", tone: "sage" },
  completed: { label: "Completed", tone: "sage" },
  rejected: { label: "Rejected", tone: "clay" },
};

const IN_PROGRESS = ["created", "extracting", "validating"];
const NEEDS_ATTENTION = ["draft_ready", "pending_review"];
const DONE = ["approved", "sent", "completed"];

const STATUS_GROUPS = [
  { key: "all", label: "All statuses", statuses: null },
  { key: "progress", label: "In progress", statuses: IN_PROGRESS },
  { key: "attention", label: "Needs review", statuses: NEEDS_ATTENTION },
  { key: "done", label: "Completed", statuses: DONE },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];

const TABLE_PAGE_SIZE = 8;

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, tone: "neutral" };
  return <span className={`db-status db-status-${meta.tone}`}>{meta.label}</span>;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function exportCasesCsv(cases) {
  const header = ["Reference", "Case type", "Status", "Created"];
  const rows = cases.map((c) => [
    c.patient?.mrn_token || c.id,
    c.case_type?.name || "",
    (STATUS_META[c.status] || { label: c.status }).label,
    formatDate(c.created_at),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "medflow-cases.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage({ user, onLogout, onBack, onUserUpdate }) {
  // Reads ?tab= once on mount so a page that links back here (e.g.
  // AiRequestDetailPage's "Back to AI requests") can reopen the right tab
  // instead of always landing on "overview".
  const [tab, setTab] = useState(
    () => new URLSearchParams(window.location.search).get("tab") || "overview",
  ); // overview | profile | tables | pathways | referrals | ai-requests
  const [clinicTown, setClinicTown] = useState(user?.clinic_town || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [cases, setCases] = useState(null);
  const [casesError, setCasesError] = useState(null);
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilterKey, setStatusFilterKey] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [tablePage, setTablePage] = useState(1);

  const routing = useMemo(() => resolveReferralHub(clinicTown), [clinicTown]);
  const dirty = clinicTown !== (user?.clinic_town || "");
  const orgId = user?.organization?.id;

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setCasesError(null);
    listCases({ organizationId: orgId })
      .then((data) => { if (!cancelled) setCases(data); })
      .catch((err) => { if (!cancelled) setCasesError(err.message || "Could not load cases."); });
    return () => { cancelled = true; };
  }, [orgId]);

  const stats = useMemo(() => {
    if (!cases) return null;
    const count = (statuses) => cases.filter((c) => statuses.includes(c.status)).length;
    return {
      total: cases.length,
      inProgress: count(IN_PROGRESS),
      needsAttention: count(NEEDS_ATTENTION),
      done: count(DONE),
    };
  }, [cases]);

  const sortedCases = useMemo(() => {
    if (!cases) return [];
    return [...cases].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [cases]);

  const filteredCases = useMemo(() => {
    const group = STATUS_GROUPS.find((g) => g.key === statusFilterKey);
    const q = tableSearch.trim().toLowerCase();
    return sortedCases.filter((c) => {
      if (group?.statuses && !group.statuses.includes(c.status)) return false;
      if (!q) return true;
      const ref = (c.patient?.mrn_token || c.id || "").toLowerCase();
      const type = (c.case_type?.name || "").toLowerCase();
      return ref.includes(q) || type.includes(q);
    });
  }, [sortedCases, statusFilterKey, tableSearch]);

  const totalTablePages = Math.max(1, Math.ceil(filteredCases.length / TABLE_PAGE_SIZE));
  const clampedTablePage = Math.min(tablePage, totalTablePages);
  const pagedCases = useMemo(() => {
    const start = (clampedTablePage - 1) * TABLE_PAGE_SIZE;
    return filteredCases.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredCases, clampedTablePage]);

  useEffect(() => { setTablePage(1); }, [tableSearch, statusFilterKey]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateProfile({ clinic_town: clinicTown || null });
      onUserUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setSaveError(err.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <div className="mf-app">
      <GlobalStyle />
      <style>{`
        .db-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--paper-raised); }
        .db-topbar-left { display: flex; align-items: center; gap: 10px; }
        .db-wrap { max-width: 720px; margin: 0 auto; padding: 32px 24px 64px; }
        .db-wrap.wide { max-width: 1080px; }
        .db-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          flex-wrap: wrap; margin-bottom: 22px; }
        .db-hero-sub { color: var(--ink-soft); font-size: 13.5px; margin-top: 4px; }
        .db-new-case { display: inline-flex; align-items: center; gap: 6px; }
        .db-tabs { display: flex; gap: 8px; margin-bottom: 22px; border-bottom: 1px solid var(--line); }
        .db-tab { padding: 10px 4px; margin-right: 22px; background: none; border: none; border-bottom: 2px solid transparent;
          font-size: 13.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .db-tab.active { color: var(--blue); border-bottom-color: var(--blue); }

        .db-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        @media (max-width: 720px) { .db-stat-grid { grid-template-columns: repeat(2, 1fr); } }
        .db-stat-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md);
          padding: 16px 18px; box-shadow: var(--shadow-sm); transition: box-shadow .16s var(--ease), border-color .16s var(--ease), transform .16s var(--ease); }
        .db-stat-card:hover { box-shadow: var(--shadow-md); border-color: #C7CFD4; transform: translateY(-1px); }
        .db-stat-icon { width: 30px; height: 30px; border-radius: var(--r-sm); display: flex; align-items: center;
          justify-content: center; margin-bottom: 10px; }
        .db-stat-icon.blue { background: var(--blue-soft); color: var(--blue-dark); }
        .db-stat-icon.amber { background: var(--amber-soft); color: var(--amber); }
        .db-stat-icon.sage { background: var(--sage-soft); color: var(--sage); }
        .db-stat-icon.clay { background: var(--clay-soft); color: var(--clay); }
        .db-stat-value { font-size: 26px; font-weight: 700; color: var(--ink); line-height: 1.1; }
        .db-stat-label { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; }

        .db-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md);
          padding: 20px 22px; box-shadow: var(--shadow-sm); margin-bottom: 20px; }
        .db-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .db-card-title { font-size: 14.5px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px; }

        .db-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .db-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em;
          color: var(--ink-soft); padding: 0 10px 8px; border-bottom: 1px solid var(--line); }
        .db-table td { padding: 10px; border-bottom: 1px solid var(--line-soft); color: var(--ink); }
        .db-table tr:last-child td { border-bottom: none; }
        .db-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ink-soft); }

        .db-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
        .db-status::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: currentColor; flex-shrink: 0; }
        .db-status-neutral { background: var(--line-soft); color: var(--ink-soft); }
        .db-status-blue { background: var(--blue-soft); color: var(--blue-dark); }
        .db-status-amber { background: var(--amber-soft); color: var(--amber); }
        .db-status-sage { background: var(--sage-soft); color: var(--sage); }
        .db-status-clay { background: var(--clay-soft); color: var(--clay); }

        /* Premium table card — inspired by the Spark Admin "Basic Tables" component */
        .db-ptable-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-lg);
          box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 20px; }
        .db-ptable-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 18px 20px 0; }
        .db-ptable-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 12px; padding: 14px 20px; }
        .db-ptable-search { position: relative; flex: 1 1 240px; max-width: 320px; }
        .db-ptable-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-soft); pointer-events: none; }
        .db-ptable-search input { width: 100%; font-family: inherit; font-size: 13px; padding: 8px 12px 8px 32px;
          border-radius: 999px; border: 1px solid var(--line); background: var(--paper); color: var(--ink);
          transition: border-color .16s var(--ease), box-shadow .16s var(--ease), background .16s var(--ease); }
        .db-ptable-search input:hover { border-color: #C3CBD0; }
        .db-ptable-search input:focus { outline: none; border-color: var(--blue); box-shadow: var(--ring); background: var(--paper-raised); }
        .db-ptable-filters { display: flex; align-items: center; gap: 8px; }
        .db-ptable-filter-wrap { position: relative; }
        .db-ptable-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 12.5px;
          font-weight: 600; padding: 8px 13px; border-radius: 999px; border: 1px solid var(--line);
          background: var(--paper-raised); color: var(--ink); cursor: pointer; white-space: nowrap;
          transition: border-color .16s var(--ease), background .16s var(--ease), color .16s var(--ease); }
        .db-ptable-btn:hover:not(:disabled) { border-color: var(--blue); background: var(--blue-soft); color: var(--blue-dark); }
        .db-ptable-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .db-ptable-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 8; min-width: 176px;
          background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-sm);
          box-shadow: var(--shadow-md); overflow: hidden; padding: 5px; }
        .db-ptable-option { width: 100%; text-align: left; font-family: inherit; font-size: 12.5px; font-weight: 500;
          padding: 8px 10px; border-radius: var(--r-xs); border: none; background: none; color: var(--ink); cursor: pointer; }
        .db-ptable-option:hover { background: var(--blue-soft); color: var(--blue-dark); }
        .db-ptable-option.active { background: var(--blue); color: #fff; }

        .db-ptable-scroll { overflow-x: auto; }
        .db-ptable { width: 100%; border-collapse: collapse; font-size: 13px; }
        .db-ptable th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
          font-weight: 700; color: var(--ink-soft); background: var(--paper); padding: 11px 20px;
          border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); white-space: nowrap; }
        .db-ptable td { padding: 13px 20px; border-bottom: 1px solid var(--line-soft); color: var(--ink); white-space: nowrap; }
        .db-ptable tbody tr { transition: background-color .14s var(--ease); }
        .db-ptable tbody tr:hover { background: var(--blue-soft); }
        .db-ptable tbody tr:last-child td { border-bottom: none; }
        .db-ptable-case-cell { display: flex; align-items: center; gap: 11px; }
        .db-ptable-avatar { width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--r-sm); background: var(--blue-soft);
          color: var(--blue-dark); display: flex; align-items: center; justify-content: center; }
        .db-ptable-ref { font-weight: 700; color: var(--ink); font-size: 13px; }
        .db-ptable-sub { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); margin-top: 1px; }

        .db-ptable-empty { padding: 28px 20px; text-align: center; font-size: 13px; color: var(--ink-soft); }

        .db-ptable-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
          gap: 10px; padding: 14px 20px; border-top: 1px solid var(--line); }
        .db-ptable-footer-info { font-size: 12.5px; color: var(--ink-soft); }
        .db-pagination { display: flex; align-items: center; gap: 4px; }
        .db-page-btn { display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px;
          padding: 0 8px; font-family: inherit; font-size: 12.5px; font-weight: 600; border-radius: var(--r-sm);
          border: 1px solid transparent; background: none; color: var(--ink-soft); cursor: pointer;
          transition: background .14s var(--ease), color .14s var(--ease), border-color .14s var(--ease); }
        .db-page-btn:hover:not(:disabled) { background: var(--line-soft); color: var(--ink); }
        .db-page-btn.active { background: var(--blue); color: #fff; }
        .db-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .db-page-current { font-size: 12.5px; color: var(--ink-soft); padding: 0 6px; }

        /* Compact premium table variant — used for the clinical pathway reference tables */
        .db-ptable-card.compact { margin-bottom: 0; box-shadow: var(--shadow-xs); }
        .db-ptable.compact th { padding: 8px 14px; font-size: 10px; }
        .db-ptable.compact td { padding: 8px 14px; font-size: 12.5px; }
        .db-ptable-strong { font-weight: 700; color: var(--ink); }
        .db-ptable-code { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--ink-soft); }
        .db-ptable-section { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700;
          letter-spacing: 0.03em; text-transform: uppercase; color: var(--ink-soft); margin: 20px 0 8px; }
        .db-ptable-section:first-child { margin-top: 0; }

        /* Row-level edit/action controls for editable premium tables (Case types & workflows) */
        .db-ptable-actions-head { text-align: right; }
        .db-ptable-actions-cell { display: flex; gap: 6px; justify-content: flex-end; }
        .db-ptable-icon-btn { width: 30px; height: 30px; flex-shrink: 0; border-radius: var(--r-sm); border: 1px solid var(--line);
          background: var(--paper-raised); color: var(--ink-soft); display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background .16s var(--ease), color .16s var(--ease), border-color .16s var(--ease); }
        .db-ptable-icon-btn:hover { background: var(--blue); color: #fff; border-color: var(--blue); }
        .db-ptable-icon-btn.delete:hover { background: var(--clay); border-color: var(--clay); }
        .db-ptable-text-btn { font-family: inherit; font-size: 12px; font-weight: 600; padding: 6px 10px; white-space: nowrap;
          border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink); cursor: pointer; }
        .db-ptable-text-btn:hover:not(:disabled) { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); }
        .db-ptable-text-btn.danger { color: var(--clay); border-color: rgba(168,67,59,.3); }
        .db-ptable-text-btn.danger:hover:not(:disabled) { background: var(--clay-soft); border-color: var(--clay); }
        .db-ptable-edit-cell { padding: 18px 20px; background: var(--paper); white-space: normal; }

        /* Wrapping variant + chip cells — used by the Referral routing table */
        .db-ptable.wrap th, .db-ptable.wrap td { white-space: normal; }
        .db-ptable-rule { font-size: 12.5px; color: var(--ink-soft); max-width: 260px; }
        .db-ptable-chip-list { display: flex; flex-wrap: wrap; gap: 5px; max-width: 360px; }
        .db-chip-note { color: var(--ink-soft); }

        /* Full-text zone → destination breakdown (Reasons for referral) */
        .db-ptable-destination-list { display: flex; flex-direction: column; gap: 5px; max-width: 320px; }
        .db-ptable-destination-row { display: flex; align-items: baseline; gap: 8px; }
        .db-ptable-destination-row .db-status { flex-shrink: 0; }
        .db-ptable-destination-text { font-size: 12.5px; color: var(--ink); line-height: 1.45; }

        .db-empty { font-size: 13px; color: var(--ink-soft); padding: 12px 0; }
        .db-quick-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .db-quick-action { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--r-md);
          border: 1px solid var(--line); background: var(--paper); font-size: 13px; font-weight: 600; color: var(--ink);
          cursor: pointer; transition: border-color 0.15s var(--ease), background 0.15s var(--ease); }
        .db-quick-action:hover { border-color: var(--blue); background: var(--blue-soft); }

        .db-readonly-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 4px; }
        .db-readonly-grid > div { font-size: 13.5px; }
        .db-readonly-grid .mf-label { margin-bottom: 2px; }
        .db-readonly-value { color: var(--ink-soft); }
        .db-routing { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
        .db-routing-head { display: flex; gap: 8px; align-items: center; color: var(--blue); margin-bottom: 6px; font-weight: 600; font-size: 14px; }
        .db-routing-rule { font-size: 13px; color: var(--ink-soft); margin: 0 0 10px; }
        .db-chip { display: inline-block; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px;
          padding: 3px 9px; border-radius: 999px; margin: 0 6px 6px 0; }
        .db-alt { font-size: 12.5px; color: var(--amber); margin-top: 4px; }
        .db-save-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
        .db-saved { color: var(--sage); font-size: 13px; }
        .db-error { color: var(--clay); font-size: 13px; }
      `}</style>

      <div className="db-topbar">
        <div className="db-topbar-left">
          <span className="mf-wordmark">MedFlow</span>
          <span className="mf-crumb">/ Dashboard</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button className="mf-mini-btn ghost" onClick={onBack}>‹ Back to workflow</button>}
          {onLogout && (
            <button className="mf-mini-btn ghost" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
      </div>

      <div className={`db-wrap${tab === "tables" || tab === "pathways" || tab === "referrals" || tab === "ai-requests" ? " wide" : ""}`}>
        <div className="db-hero">
          <div>
            <h1 className="mf-page-title">{firstName ? `Welcome back, Dr. ${firstName}` : "Dashboard"}</h1>
            <p className="db-hero-sub">
              {user?.organization?.name || "Your organization"}{clinicTown ? ` · ${clinicTown}` : ""}
            </p>
          </div>
          {onBack && (
            <button className="mf-primary-btn db-new-case" onClick={onBack}>
              <PlusCircle size={15} /> New case
            </button>
          )}
        </div>

        <div className="db-tabs">
          <button className={`db-tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>
            <LayoutDashboard size={14} /> Overview
          </button>
          <button className={`db-tab${tab === "profile" ? " active" : ""}`} onClick={() => setTab("profile")}>
            <MapPin size={14} /> Profile & routing
          </button>
          <button className={`db-tab${tab === "tables" ? " active" : ""}`} onClick={() => setTab("tables")}>
            <Database size={14} /> Case types & workflows
          </button>
          <button className={`db-tab${tab === "pathways" ? " active" : ""}`} onClick={() => setTab("pathways")}>
            <GitBranch size={14} /> Clinical pathways
          </button>
          <button className={`db-tab${tab === "referrals" ? " active" : ""}`} onClick={() => setTab("referrals")}>
            <Route size={14} /> Referral routing
          </button>
          <button className={`db-tab${tab === "ai-requests" ? " active" : ""}`} onClick={() => setTab("ai-requests")}>
            <Sparkles size={14} /> AI requests
          </button>
        </div>

        {tab === "tables" && <TableEditor />}
        {tab === "pathways" && <ClinicalPathwaysBrowser />}
        {tab === "referrals" && <ReferralRoutingBrowser />}
        {tab === "ai-requests" && <AiRequestsBrowser />}

        {tab === "overview" && (
          <>
            <div className="db-stat-grid">
              <div className="db-stat-card">
                <div className="db-stat-icon blue"><FileStack size={16} /></div>
                <div className="db-stat-value">{stats ? stats.total : "—"}</div>
                <div className="db-stat-label">Total cases</div>
              </div>
              <div className="db-stat-card">
                <div className="db-stat-icon blue"><Clock3 size={16} /></div>
                <div className="db-stat-value">{stats ? stats.inProgress : "—"}</div>
                <div className="db-stat-label">In progress</div>
              </div>
              <div className="db-stat-card">
                <div className="db-stat-icon amber"><AlertTriangle size={16} /></div>
                <div className="db-stat-value">{stats ? stats.needsAttention : "—"}</div>
                <div className="db-stat-label">Needs review</div>
              </div>
              <div className="db-stat-card">
                <div className="db-stat-icon sage"><CheckCircle2 size={16} /></div>
                <div className="db-stat-value">{stats ? stats.done : "—"}</div>
                <div className="db-stat-label">Completed</div>
              </div>
            </div>

            <div className="db-card">
              <div className="db-card-title" style={{ marginBottom: 12 }}>Quick actions</div>
              <div className="db-quick-actions">
                {onBack && (
                  <button className="db-quick-action" onClick={onBack}>
                    <PlusCircle size={15} /> Start a new case
                  </button>
                )}
                <button className="db-quick-action" onClick={() => setTab("profile")}>
                  <MapPin size={15} /> Update clinic & routing
                </button>
                <button className="db-quick-action" onClick={() => { window.location.search = "?page=alberta-routing"; }}>
                  <ArrowUpRight size={15} /> Alberta referral routing tool
                </button>
                <button className="db-quick-action" onClick={() => setTab("tables")}>
                  <ClipboardList size={15} /> Manage case types & workflows
                </button>
              </div>
            </div>

            <div className="db-ptable-card">
              <div className="db-ptable-head">
                <div className="db-card-title"><FileStack size={16} /> Recent cases</div>
              </div>

              <div className="db-ptable-toolbar">
                <div className="db-ptable-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search reference or case type…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                  />
                </div>
                <div className="db-ptable-filters">
                  <div className="db-ptable-filter-wrap">
                    <button className="db-ptable-btn" onClick={() => setFilterOpen((o) => !o)}>
                      <Filter size={13} /> {STATUS_GROUPS.find((g) => g.key === statusFilterKey)?.label}
                      <ChevronDown size={13} />
                    </button>
                    {filterOpen && (
                      <div className="db-ptable-menu" onMouseLeave={() => setFilterOpen(false)}>
                        {STATUS_GROUPS.map((g) => (
                          <button
                            key={g.key}
                            className={`db-ptable-option${g.key === statusFilterKey ? " active" : ""}`}
                            onClick={() => { setStatusFilterKey(g.key); setFilterOpen(false); }}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="db-ptable-btn"
                    onClick={() => exportCasesCsv(filteredCases)}
                    disabled={filteredCases.length === 0}
                  >
                    <Download size={13} /> Export
                  </button>
                </div>
              </div>

              {casesError && <div className="db-ptable-empty">{casesError}</div>}
              {!casesError && cases === null && <div className="db-ptable-empty">Loading recent cases…</div>}
              {!casesError && cases !== null && filteredCases.length === 0 && (
                <div className="db-ptable-empty">
                  {cases.length === 0 ? "No cases yet — start one to see it here." : "No cases match your search or filter."}
                </div>
              )}
              {!casesError && pagedCases.length > 0 && (
                <div className="db-ptable-scroll">
                  <table className="db-ptable">
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Case type</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCases.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="db-ptable-case-cell">
                              <div className="db-ptable-avatar"><FileStack size={14} /></div>
                              <div>
                                <div className="db-ptable-ref">{c.patient?.mrn_token || c.id.slice(0, 8)}</div>
                                <div className="db-ptable-sub">{c.id.slice(0, 8)}</div>
                              </div>
                            </div>
                          </td>
                          <td>{c.case_type?.name || "—"}</td>
                          <td><StatusBadge status={c.status} /></td>
                          <td>{formatDate(c.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!casesError && filteredCases.length > 0 && (
                <div className="db-ptable-footer">
                  <span className="db-ptable-footer-info">
                    Showing {(clampedTablePage - 1) * TABLE_PAGE_SIZE + 1}–
                    {Math.min(clampedTablePage * TABLE_PAGE_SIZE, filteredCases.length)} of {filteredCases.length}{" "}
                    {filteredCases.length === 1 ? "entry" : "entries"}
                  </span>
                  <div className="db-pagination">
                    <button
                      className="db-page-btn"
                      onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                      disabled={clampedTablePage === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {totalTablePages <= 7 ? (
                      Array.from({ length: totalTablePages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          className={`db-page-btn${p === clampedTablePage ? " active" : ""}`}
                          onClick={() => setTablePage(p)}
                        >
                          {p}
                        </button>
                      ))
                    ) : (
                      <span className="db-page-current">Page {clampedTablePage} of {totalTablePages}</span>
                    )}
                    <button
                      className="db-page-btn"
                      onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                      disabled={clampedTablePage === totalTablePages}
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "profile" && (
          <>
            <div className="db-card">
              <div className="db-readonly-grid">
                <div><div className="mf-label">Name</div><div className="db-readonly-value">{user?.name}</div></div>
                <div><div className="mf-label">Email</div><div className="db-readonly-value">{user?.email}</div></div>
                <div><div className="mf-label">Role</div><div className="db-readonly-value">{user?.role}</div></div>
                <div><div className="mf-label">Organization</div><div className="db-readonly-value">{user?.organization?.name || "—"}</div></div>
              </div>
            </div>

            <div className="db-card">
              <div className="mf-field" style={{ marginBottom: 0 }}>
                <label className="mf-label" htmlFor="clinic-town">Clinic town / city</label>
                <input
                  id="clinic-town"
                  type="text"
                  className="mf-input"
                  style={{ width: "100%", maxWidth: 340, boxSizing: "border-box" }}
                  placeholder="e.g. Camrose"
                  value={clinicTown}
                  onChange={(e) => { setClinicTown(e.target.value); setSaved(false); }}
                />
              </div>

              <div className="db-routing">
                <div className="db-routing-head"><MapPin size={15} /> Your referral routing</div>
                {!clinicTown.trim() && <div className="db-empty">Enter your clinic's town to see your AHS zone and specialty intake.</div>}
                {clinicTown.trim() && !routing && (
                  <div className="db-empty">No match for “{clinicTown}” in the Foundation Edition v1.0 map (MSK/Ortho/Spine only).</div>
                )}
                {routing && (
                  <>
                    <p className="db-routing-rule">
                      Routes to <b>{routing.hub}</b> — {routing.zone}. {routing.rule}
                    </p>
                    <div>{routing.specialties.map((s) => <span className="db-chip" key={s}>{s}</span>)}</div>
                    {routing.alternates.map((a) => (
                      <div className="db-alt" key={a.hub}>Alternate: <b>{a.hub}</b> ({a.zone}) — {a.condition}</div>
                    ))}
                  </>
                )}
              </div>

              <div className="db-save-row">
                <button className="mf-primary-btn" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? "Saving…" : "Save"}
                </button>
                {saved && <span className="db-saved">Saved</span>}
                {saveError && <span className="db-error">{saveError}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
