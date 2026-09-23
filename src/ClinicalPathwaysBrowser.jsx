import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { listClinicalPathways, getPathwayAiSettings, updatePathwayAiSettings } from "./api.js";

const SECTION_LABELS = {
  eligibility: "Eligibility",
  history: "History & details",
  red_flags: "Red flags",
  anatomical: "Anatomical / differential",
  examination: "Examination",
  investigations: "Investigations",
  management: "Management",
  final_assessment: "Final assessment",
};

function jsonPreview(value) {
  if (value == null) return "—";
  return JSON.stringify(value);
}

function semanticTone(raw) {
  const v = String(raw ?? "").toLowerCase();
  if (!v) return "neutral";
  if (["critical", "severe", "high", "emergent", "urgent", "stat"].some((k) => v.includes(k))) return "clay";
  if (["moderate", "medium", "elevated"].some((k) => v.includes(k))) return "amber";
  if (["low", "mild", "routine", "standard", "yes", "true", "required"].some((k) => v.includes(k))) return "sage";
  if (["no", "false", "optional", "none"].some((k) => v.includes(k))) return "neutral";
  return "blue";
}

function Pill({ children, tone = "blue" }) {
  if (children == null || children === "") return <span className="db-ptable-code">—</span>;
  return <span className={`db-status db-status-${tone}`}>{children}</span>;
}

function Table({ columns, rows, empty }) {
  if (rows.length === 0) return <p className="mf-tiny-note">{empty}</p>;
  return (
    <div className="db-ptable-card compact">
      <div className="db-ptable-scroll">
        <table className="db-ptable compact">
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id || i}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Per-pathway, per-section control over which parts of the Clinical
 * Assessment form the AI (both the ai-service model and the client-side
 * keyword heuristic) is allowed to attempt. Disabling a section makes every
 * consumer treat its fields exactly as if they had no ai_mapping at all —
 * see PathwayService::disabledSections(). */
function AiFillSettingsPanel({ pathwayId }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [savingCode, setSavingCode] = useState(null);

  useEffect(() => {
    setSettings(null);
    setError(null);
    getPathwayAiSettings(pathwayId)
      .then(setSettings)
      .catch((err) => setError(err.message || "Could not load AI-fill settings."));
  }, [pathwayId]);

  const toggle = (code) => {
    if (!settings || savingCode) return;
    setSavingCode(code);
    updatePathwayAiSettings(pathwayId, code, !settings[code])
      .then(setSettings)
      .catch((err) => setError(err.message || "Could not update AI-fill setting."))
      .finally(() => setSavingCode(null));
  };

  return (
    <div className="db-ptable-card compact" style={{ padding: 12, marginBottom: 16 }}>
      <div className="db-ptable-section" style={{ marginTop: 0 }}>AI auto-fill by section</div>
      <p className="mf-tiny-note" style={{ margin: "0 0 10px" }}>
        Which sections of this pathway's Clinical Assessment form the AI may suggest answers for. Turning a section
        off makes the AI treat every field in it as unmapped — it's never asked about it, on either the model or the
        client-side heuristic.
      </p>
      {error && <div className="db-empty"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>}
      {!error && !settings && <p className="mf-tiny-note">Loading…</p>}
      {settings && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(SECTION_LABELS).map((code) => (
            <button type="button" key={code}
              className={`mf-mini-btn${settings[code] ? "" : " ghost"}`}
              disabled={savingCode === code}
              onClick={() => toggle(code)}>
              {SECTION_LABELS[code]} · {settings[code] ? "on" : "off"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PathwayDetail({ pathway }) {
  return (
    <div>
      <AiFillSettingsPanel pathwayId={pathway.id} />

      <div className="db-ptable-section">Conditions</div>
      <Table
        empty="No conditions attached."
        rows={pathway.conditions}
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="db-ptable-strong">{r.code}</span> },
          { key: "name", label: "Name" },
          { key: "body_region", label: "Body region" },
          { key: "role", label: "Role", render: (r) => <Pill>{r.pivot?.role}</Pill> },
        ]}
      />

      <div className="db-ptable-section">Criteria</div>
      <Table
        empty="No criteria defined."
        rows={pathway.criteria}
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="db-ptable-strong">{r.code}</span> },
          { key: "name", label: "Name" },
          { key: "criterion_type", label: "Type", render: (r) => <Pill>{r.criterion_type}</Pill> },
          { key: "required", label: "Required", render: (r) => <Pill tone={r.required ? "sage" : "neutral"}>{r.required ? "Yes" : "No"}</Pill> },
          { key: "detail", label: "Detail", render: (r) => r.config?.detail || "—" },
        ]}
      />

      <div className="db-ptable-section">Red Flags</div>
      <Table
        empty="No red flags attached."
        rows={pathway.red_flags}
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="db-ptable-strong">{r.code}</span> },
          { key: "name", label: "Name" },
          { key: "severity", label: "Severity", render: (r) => <Pill tone={semanticTone(r.severity)}>{r.severity}</Pill> },
          { key: "urgency", label: "Urgency", render: (r) => <Pill tone={semanticTone(r.pivot?.urgency)}>{r.pivot?.urgency}</Pill> },
          { key: "priority", label: "Priority", render: (r) => <span className="db-ptable-strong">{r.pivot?.priority ?? "—"}</span> },
          { key: "action", label: "Action", render: (r) => r.pivot?.action || "—" },
        ]}
      />

      <div className="db-ptable-section">Imaging Requirements</div>
      <Table
        empty="No imaging requirements."
        rows={pathway.imaging_requirements}
        columns={[
          { key: "modality", label: "Modality", render: (r) => <span className="db-ptable-strong">{r.modality}</span> },
          { key: "body_region", label: "Body region" },
          { key: "indication", label: "Indication" },
          { key: "required", label: "Required", render: (r) => <Pill tone={r.required ? "sage" : "neutral"}>{r.required ? "Yes" : "No"}</Pill> },
        ]}
      />

      <div className="db-ptable-section">Actions</div>
      <Table
        empty="No actions defined."
        rows={pathway.actions}
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="db-ptable-strong">{r.code}</span> },
          { key: "name", label: "Name" },
          { key: "action_type", label: "Type", render: (r) => <Pill>{r.action_type}</Pill> },
          { key: "urgency", label: "Urgency", render: (r) => <Pill tone={semanticTone(r.urgency)}>{r.urgency}</Pill> },
        ]}
      />

      <div className="db-ptable-section">Rules</div>
      <Table
        empty="No rules defined."
        rows={pathway.rules}
        columns={[
          { key: "name", label: "Name" },
          { key: "priority", label: "Priority", render: (r) => <span className="db-ptable-strong">{r.priority ?? "—"}</span> },
          { key: "condition", label: "Condition", render: (r) => <span className="db-ptable-code">{jsonPreview(r.condition)}</span> },
          { key: "action", label: "Action", render: (r) => <span className="db-ptable-code">{jsonPreview(r.action)}</span> },
        ]}
      />
    </div>
  );
}

export default function ClinicalPathwaysBrowser() {
  const [specializations, setSpecializations] = useState(null);
  const [error, setError] = useState(null);
  const [activeSpecId, setActiveSpecId] = useState(null);
  const [activePathwayId, setActivePathwayId] = useState(null);

  useEffect(() => {
    listClinicalPathways()
      .then((data) => {
        setSpecializations(data);
        setActiveSpecId(data[0]?.id ?? null);
        setActivePathwayId(data[0]?.pathways?.[0]?.id ?? null);
      })
      .catch((err) => setError(err.message || "Could not load clinical pathways."));
  }, []);

  const activeSpec = useMemo(
    () => specializations?.find((s) => s.id === activeSpecId) || null,
    [specializations, activeSpecId],
  );
  const activePathway = useMemo(
    () => activeSpec?.pathways.find((p) => p.id === activePathwayId) || null,
    [activeSpec, activePathwayId],
  );

  if (error) {
    return <div className="db-empty"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>;
  }
  if (!specializations) {
    return <p className="mf-tiny-note">Loading clinical pathways…</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {specializations.map((s) => (
          <button type="button" key={s.id}
            className={`mf-mini-btn${activeSpecId === s.id ? "" : " ghost"}`}
            onClick={() => { setActiveSpecId(s.id); setActivePathwayId(s.pathways[0]?.id ?? null); }}>
            {s.name} <span style={{ opacity: 0.7 }}>({s.pathways.length})</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div className="db-card-title" style={{ marginBottom: 8 }}>Pathways</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeSpec?.pathways.map((p) => (
              <button type="button" key={p.id}
                onClick={() => setActivePathwayId(p.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                  textAlign: "left", padding: "8px 10px", borderRadius: "var(--r-sm)",
                  border: `1px solid ${activePathwayId === p.id ? "var(--blue)" : "var(--line)"}`,
                  background: activePathwayId === p.id ? "var(--blue-soft)" : "var(--paper)",
                  cursor: "pointer", fontSize: 13,
                }}>
                <span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--ink-soft)" }}>{p.code} · v{p.version}</span>
                </span>
                <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: "2 1 480px", minWidth: 320 }}>
          {activePathway ? <PathwayDetail pathway={activePathway} /> : <p className="mf-tiny-note">Select a pathway.</p>}
        </div>
      </div>
    </div>
  );
}
