import { useEffect, useMemo, useState } from "react";
import { Search, Filter, ChevronDown, AlertTriangle } from "lucide-react";
import { getReferralRoutingCatalog } from "./api.js";

// Same free-text destination heuristic used by the referral wizard
// (MedFlowApp.jsx's destinationTone) — kept local since it's a light,
// display-only classifier over the catalog's zone_process strings.
function destinationTone(text) {
  if (!text) return "neutral";
  if (/neurosurg|oncology|—$/i.test(text)) return "clay";
  if (/zone fast team/i.test(text)) return "sage";
  return "amber";
}

function pathwayLabel(pathway) {
  if (pathway === "ortho") return "Orthopedic & Spine";
  if (pathway === "plastic") return "Plastic Surgery";
  if (pathway === "both") return "Both";
  return pathway || "—";
}

function Pill({ children, tone = "blue" }) {
  if (children == null || children === "") return <span className="db-ptable-code">—</span>;
  return <span className={`db-status db-status-${tone}`}>{children}</span>;
}

function CompactTable({ columns, rows, empty }) {
  if (!rows || rows.length === 0) return <p className="mf-tiny-note">{empty}</p>;
  return (
    <div className="db-ptable-card compact">
      <div className="db-ptable-scroll">
        <table className="db-ptable compact wrap">
          <thead>
            <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReasonDestination({ reason }) {
  if (reason.is_bypass) {
    return <span className="db-ptable-rule">{reason.bypass_note || "Bypass — no Zone FAST"}</span>;
  }
  if (reason.is_urgent) {
    return (
      <span className="db-ptable-rule">
        Urgent phone triage{reason.acute_weeks ? ` — within ${reason.acute_weeks} wk` : ""}
      </span>
    );
  }
  const entries = Object.entries(reason.zone_process || {}).filter(([, dest]) => dest);
  if (entries.length === 0) return <span className="db-ptable-code">—</span>;

  // Most reasons route every zone to the same destination — collapse that
  // case to one line instead of repeating identical text five times.
  const uniqueDest = [...new Set(entries.map(([, dest]) => dest))];
  if (uniqueDest.length === 1) {
    return (
      <div className="db-ptable-destination-row">
        <span className={`db-status db-status-${destinationTone(uniqueDest[0])}`}>All zones</span>
        <span className="db-ptable-destination-text">{uniqueDest[0]}</span>
      </div>
    );
  }

  return (
    <div className="db-ptable-destination-list">
      {entries.map(([zone, dest]) => (
        <div key={zone} className="db-ptable-destination-row">
          <span className={`db-status db-status-${destinationTone(dest)}`}>{zone}</span>
          <span className="db-ptable-destination-text">{dest}</span>
        </div>
      ))}
    </div>
  );
}

const PATHWAY_FILTERS = [
  { key: "all", label: "All pathways" },
  { key: "ortho", label: "Orthopedic & Spine" },
  { key: "plastic", label: "Plastic Surgery" },
];

export default function ReferralRoutingBrowser() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [pathwayFilter, setPathwayFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    getReferralRoutingCatalog()
      .then(setCatalog)
      .catch((err) => setError(err.message || "Could not load the referral routing catalog."));
  }, []);

  const reasons = catalog?.reasons || [];

  const filteredReasons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reasons.filter((r) => {
      if (pathwayFilter !== "all" && r.pathway !== pathwayFilter && r.pathway !== "both") return false;
      if (!q) return true;
      return [r.code, r.label, r.group_name].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [reasons, search, pathwayFilter]);

  if (error) {
    return <div className="db-empty"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>;
  }
  if (!catalog) {
    return <p className="mf-tiny-note">Loading referral routing catalog…</p>;
  }

  const programContacts = Object.entries(catalog.program_contacts || {}).map(([zone, c]) => ({ zone, ...c }));
  const clinicalPathways = (catalog.clinical_pathways || []).map((name, i) => ({ id: i, name }));
  const urgentIndications = Object.entries(catalog.urgent_indications || {}).flatMap(([pathway, doors]) =>
    Object.entries(doors).map(([doorCode, row]) => ({ ...row, pathway, door_code: doorCode, id: `${pathway}-${doorCode}` })),
  );

  return (
    <div>
      <div className="db-ptable-section">Entry doors</div>
      <CompactTable
        empty="No entry doors configured."
        rows={catalog.entry_doors}
        columns={[
          { key: "code", label: "Code", render: (r) => <span className="db-ptable-strong">{r.code}</span> },
          { key: "label", label: "Label" },
          { key: "description", label: "Description", render: (r) => r.description || "—" },
        ]}
      />

      <div className="db-ptable-section">Program contacts by zone</div>
      <CompactTable
        empty="No program contacts configured."
        rows={programContacts}
        columns={[
          { key: "zone", label: "Zone", render: (r) => <span className="db-ptable-strong">{r.zone}</span> },
          { key: "raapid", label: "RAAPID" },
          { key: "fast", label: "Zone FAST Team" },
          { key: "non_urgent_advice", label: "Non-urgent advice", render: (r) => r.non_urgent_advice || "—" },
        ]}
      />

      <div className="db-ptable-section">Clinical pathways</div>
      <CompactTable empty="No named clinical pathways." rows={clinicalPathways} columns={[{ key: "name", label: "Name" }]} />

      <div className="db-ptable-section">Urgent & emergency indications</div>
      <CompactTable
        empty="No urgent indications configured."
        rows={urgentIndications}
        columns={[
          { key: "pathway", label: "Pathway", render: (r) => <Pill>{pathwayLabel(r.pathway)}</Pill> },
          { key: "door_code", label: "Door", render: (r) => <Pill tone={r.door_code === "emergency" ? "clay" : "amber"}>{r.door_code}</Pill> },
          { key: "window", label: "Window", render: (r) => (r.weeks ? `${r.weeks} wk acute window` : r.action_text ? "Call now" : "—") },
          {
            key: "examples", label: "Examples", render: (r) => (
              <div className="db-ptable-chip-list">
                {(r.examples || []).slice(0, 6).map((ex) => <span className="db-chip" key={ex}>{ex}</span>)}
              </div>
            ),
          },
        ]}
      />

      <div className="db-ptable-section">Reasons for referral</div>
      <div className="db-ptable-card">
        <div className="db-ptable-toolbar">
          <div className="db-ptable-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search reason, code or group…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="db-ptable-filters">
            <div className="db-ptable-filter-wrap">
              <button className="db-ptable-btn" onClick={() => setFilterOpen((o) => !o)}>
                <Filter size={13} /> {PATHWAY_FILTERS.find((p) => p.key === pathwayFilter)?.label}
                <ChevronDown size={13} />
              </button>
              {filterOpen && (
                <div className="db-ptable-menu" onMouseLeave={() => setFilterOpen(false)}>
                  {PATHWAY_FILTERS.map((p) => (
                    <button
                      key={p.key}
                      className={`db-ptable-option${p.key === pathwayFilter ? " active" : ""}`}
                      onClick={() => { setPathwayFilter(p.key); setFilterOpen(false); }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {filteredReasons.length === 0 ? (
          <div className="db-ptable-empty">
            {reasons.length === 0 ? "No reasons configured." : "No reasons match your search or filter."}
          </div>
        ) : (
          <div className="db-ptable-scroll">
            <table className="db-ptable wrap">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Pathway</th>
                  <th>Group</th>
                  <th>Reason</th>
                  <th>Flags</th>
                  <th>Destination</th>
                </tr>
              </thead>
              <tbody>
                {filteredReasons.map((r) => (
                  <tr key={r.id}>
                    <td><span className="db-ptable-strong">{r.code}</span></td>
                    <td><Pill>{pathwayLabel(r.pathway)}</Pill></td>
                    <td>{r.group_name}</td>
                    <td>{r.label}</td>
                    <td>
                      <div className="db-ptable-chip-list">
                        {r.wcb_required && <Pill tone="sage">WCB</Pill>}
                        {r.is_bypass && <Pill tone="clay">Bypass</Pill>}
                        {r.is_urgent && <Pill tone="amber">Urgent</Pill>}
                        {!r.wcb_required && !r.is_bypass && !r.is_urgent && <span className="db-ptable-code">—</span>}
                      </div>
                    </td>
                    <td><ReasonDestination reason={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="db-ptable-footer">
          <span className="db-ptable-footer-info">Showing {filteredReasons.length} of {reasons.length} reasons</span>
        </div>
      </div>
    </div>
  );
}
