import { useMemo, useState } from "react";
import { LogOut, MapPin, Search } from "lucide-react";
import { ALBERTA_REFERRAL_HUBS, resolveReferralHub } from "../lib/albertaReferralRouting.js";

const AUTOMATION_STEPS = [
  { title: "Physician enters clinic address", detail: "Clarity extracts town, city, postal code, PCN and region." },
  { title: "Town → nearest referral hub", detail: "Based on geographic proximity, AHS specialty availability, historical referral patterns and pathway rules." },
  { title: "Referral hub → AHS zone", detail: "Invisible to the user." },
  { title: "Correct pathway rules applied", detail: "Selects the specialty clinic, triage intake, fax number, urgency rules and missing-info requirements." },
  { title: "Referral generated", detail: "Fully formatted, triaged, and fax-ready." },
];

function townChip(entry) {
  const name = typeof entry === "string" ? entry : entry.name;
  const note = typeof entry === "string" ? null : entry.note;
  return (
    <span className="ab-chip" key={name} title={note || undefined}>
      {name}
      {note && <span className="ab-chip-note"> · {note}</span>}
    </span>
  );
}

function ResolvedHubCard({ result, query }) {
  if (!query.trim()) return null;

  if (!result) {
    return (
      <div className="ab-result ab-result-empty">
        No match for “{query}” in the Foundation Edition v1.0 map (MSK/Ortho/Spine only).
      </div>
    );
  }

  return (
    <div className="ab-result">
      <div className="ab-result-head">
        <MapPin size={16} />
        <div>
          <div className="ab-result-town">{result.town}</div>
          <div className="ab-result-hub">routes to <b>{result.hub}</b> — {result.zone}</div>
        </div>
      </div>
      <p className="ab-result-rule">{result.rule}</p>
      <div className="ab-result-specialties">
        {result.specialties.map((s) => <span className="ab-chip" key={s}>{s}</span>)}
      </div>
      {result.alternates.length > 0 && (
        <div className="ab-result-alt">
          {result.alternates.map((a) => (
            <div key={a.hub}>Alternate: <b>{a.hub}</b> ({a.zone}) — {a.condition}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlbertaRoutingPage({ user, onLogout, onBack }) {
  const [query, setQuery] = useState("");
  const result = useMemo(() => resolveReferralHub(query), [query]);

  return (
    <div className="mf-app">
      <style>{`
        .ab-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--paper-raised); }
        .ab-topbar-left { display: flex; align-items: center; gap: 10px; }
        .ab-wrap { max-width: 980px; margin: 0 auto; padding: 32px 24px 64px; }
        .ab-steps { list-style: none; margin: 0 0 28px; padding: 0; display: grid; gap: 10px; }
        .ab-steps li { display: flex; gap: 12px; align-items: baseline; }
        .ab-steps b { color: var(--blue); font-family: 'IBM Plex Mono', monospace; font-size: 12px; min-width: 18px; }
        .ab-steps .ab-step-detail { color: var(--ink-soft); font-size: 13.5px; }
        .ab-lookup { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md);
          padding: 18px 20px; box-shadow: var(--shadow-sm); margin-bottom: 28px; }
        .ab-lookup-input-wrap { position: relative; max-width: 380px; }
        .ab-lookup-input-wrap svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--ink-soft); }
        .ab-lookup-input-wrap input { width: 100%; padding: 9px 12px 9px 34px; border: 1px solid var(--line);
          border-radius: var(--r-sm); font-size: 14px; box-sizing: border-box; }
        .ab-lookup-input-wrap input:focus { outline: none; border-color: var(--blue); box-shadow: var(--ring); }
        .ab-result { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
        .ab-result-empty { color: var(--ink-soft); font-size: 14px; }
        .ab-result-head { display: flex; gap: 10px; align-items: flex-start; color: var(--blue); margin-bottom: 8px; }
        .ab-result-town { font-weight: 600; font-size: 15px; color: var(--ink); }
        .ab-result-hub { font-size: 13.5px; color: var(--ink-soft); }
        .ab-result-rule { font-size: 13px; color: var(--ink-soft); margin: 0 0 10px; }
        .ab-result-specialties { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .ab-result-alt { font-size: 12.5px; color: var(--amber); }
        .ab-chip { display: inline-block; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px;
          padding: 3px 9px; border-radius: 999px; }
        .ab-chip-note { color: var(--ink-soft); }

        /* Premium table card — same language as the dashboard's Recent cases table */
        .db-ptable-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-lg);
          box-shadow: var(--shadow-sm); overflow: hidden; }
        .db-ptable-head { padding: 18px 20px 14px; border-bottom: 1px solid var(--line); }
        .db-ptable-scroll { overflow-x: auto; }
        .db-ptable { width: 100%; border-collapse: collapse; font-size: 13px; }
        .db-ptable th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
          font-weight: 700; color: var(--ink-soft); background: var(--paper); padding: 11px 20px;
          border-bottom: 1px solid var(--line); }
        .db-ptable td { padding: 13px 20px; border-bottom: 1px solid var(--line-soft); color: var(--ink); vertical-align: top; }
        .db-ptable tbody tr { transition: background-color .14s var(--ease); }
        .db-ptable tbody tr:hover { background: var(--blue-soft); }
        .db-ptable tbody tr:last-child td { border-bottom: none; }
        .db-ptable.wrap th, .db-ptable.wrap td { white-space: normal; }
        .db-ptable-strong { font-weight: 700; color: var(--ink); font-family: 'Space Grotesk', sans-serif; font-size: 13.5px; }
        .db-ptable-rule { font-size: 12.5px; color: var(--ink-soft); max-width: 260px; }
        .db-ptable-chip-list { display: flex; flex-wrap: wrap; gap: 5px; max-width: 360px; }
      `}</style>

      <div className="ab-topbar">
        <div className="ab-topbar-left">
          <span className="mf-wordmark">MedFlow</span>
          <span className="mf-crumb">/ Alberta referral routing</span>
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

      <div className="ab-wrap">
        <div className="mf-page-head">
          <h1 className="mf-page-title">Alberta referral routing</h1>
        </div>
        <p className="mf-page-subhead">
          Every Alberta town routes to its nearest referral city, which determines the correct AHS zone
          and specialty intake — Clarity automates this entirely. Foundation Edition v1.0 covers
          MSK / Ortho / Spine.{user?.name ? ` Signed in as ${user.name}.` : ""}
        </p>

        <ol className="ab-steps">
          {AUTOMATION_STEPS.map((s, i) => (
            <li key={s.title}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>
                <div>{s.title}</div>
                <div className="ab-step-detail">{s.detail}</div>
              </span>
            </li>
          ))}
        </ol>

        <div className="ab-lookup">
          <div className="mf-page-title" style={{ fontSize: 16, marginBottom: 10 }}>Look up a town</div>
          <div className="ab-lookup-input-wrap">
            <Search size={15} />
            <input
              type="text"
              placeholder="e.g. Camrose, Drumheller, Fort McMurray…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ResolvedHubCard result={result} query={query} />
        </div>

        <div className="db-ptable-card">
          <div className="db-ptable-head">
            <div className="mf-page-title" style={{ fontSize: 16, margin: 0 }}>Referral hub directory</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
              Every hub's AHS zone, specialty intake and the towns routed to it.
            </p>
          </div>
          <div className="db-ptable-scroll">
            <table className="db-ptable wrap">
              <thead>
                <tr>
                  <th>Hub</th>
                  <th>Zone</th>
                  <th>Corridor</th>
                  <th>Routing rule</th>
                  <th>Specialties</th>
                  <th>Towns routed here</th>
                </tr>
              </thead>
              <tbody>
                {ALBERTA_REFERRAL_HUBS.map((hub) => (
                  <tr key={hub.id}>
                    <td><span className="db-ptable-strong">{hub.name}</span></td>
                    <td>{hub.zone}</td>
                    <td>{hub.corridor}</td>
                    <td className="db-ptable-rule">{hub.rule}</td>
                    <td>
                      <div className="db-ptable-chip-list">
                        {hub.specialties.map((s) => <span className="ab-chip" key={s}>{s}</span>)}
                      </div>
                    </td>
                    <td>
                      <div className="db-ptable-chip-list">{hub.towns.map(townChip)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
