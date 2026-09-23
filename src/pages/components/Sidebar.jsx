import { Check } from "lucide-react";
import { CASE_ID } from "../data/mockData.js";

function initials(p) {
  return ((p.firstName?.trim()[0] || "") + (p.lastName?.trim()[0] || "")).toUpperCase() || "—";
}

export function Sidebar({ nav, page, visited, maxReachableIndex, goTo, open, patient, pathway, urgency }) {
  const currentIdx = nav.findIndex((x) => x.id === page);
  const doneCount = nav.filter((n, i) => visited[n.id] && i < currentIdx).length;
  const nameValid = patient.firstName?.trim() && patient.lastName?.trim();
  return (
    <>
      <aside className={`mf-sidebar${open ? " open" : ""}`}>
        <div className="mf-sidebar-case">
          <div className="mf-sidebar-case-head">
            <span className="mf-avatar">{initials(patient)}</span>
            <div>
              <p className="mf-sidebar-case-name">{nameValid ? `${patient.firstName} ${patient.lastName}` : "New patient"}</p>
              <p className="mf-sidebar-case-id">{CASE_ID}</p>
            </div>
          </div>
          <p className="mf-sidebar-case-meta">
            {pathway[0].toUpperCase() + pathway.slice(1)} pathway ·{" "}
            <span className={`mf-urgency mf-urgency-${urgency}`} style={{ fontSize: 10, padding: "2px 7px" }}>{urgency}</span>
          </p>
        </div>
        <div className="mf-nav-progress"><span>Workflow</span><span>{doneCount}/{nav.length}</span></div>
        <nav className="mf-nav">
          {nav.map((n, i) => {
            const Icon = n.icon;
            const isCurrent = n.id === page;
            const isDone = visited[n.id] && i < currentIdx;
            const reachable = i <= maxReachableIndex;
            const state = isCurrent ? "current" : isDone ? "done" : reachable ? "upcoming" : "locked";
            return (
              <button key={n.id} className={`mf-nav-item is-${state}`} onClick={() => reachable && goTo(n.id)}
                disabled={!reachable} aria-current={isCurrent ? "step" : undefined}>
                <span className="mf-nav-marker">
                  {isDone ? <Check size={13} strokeWidth={3} /> : isCurrent ? <Icon size={14} /> : <span className="mf-nav-num">{i + 1}</span>}
                </span>
                <span className="mf-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      {open && <div className="mf-sidebar-overlay" onClick={() => goTo(page)} />}
    </>
  );
}
