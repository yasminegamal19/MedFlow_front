import { Menu, LayoutDashboard, LogOut } from "lucide-react";
import { CASE_ID, ORG } from "../data/mockData.js";

export function TopBar({ statusLabel, stepIndex, stepTotal, stage, onMenuClick, user, onLogout, onOpenDashboard }) {
  const pct = Math.round(((stepIndex + 1) / stepTotal) * 100);
  return (
    <div className="mf-topbar">
      <div className="mf-topbar-inner">
        <div className="mf-topbar-left">
          <button className="mf-menu-btn" onClick={onMenuClick} aria-label="Toggle navigation"><Menu size={18} /></button>
          <span className="mf-wordmark">MedFlow</span>
          <span className="mf-crumb">/ {CASE_ID}</span>
        </div>
        <div className="mf-topbar-right">
          <span className="mf-step-count">Stage {stage?.[0]} <span className="mf-step-count-of">of 7</span></span>
          <span className={`mf-status-pill mf-status-${statusLabel.replace(/\s/g, "-").toLowerCase()}`}>{statusLabel}</span>
          <span className="mf-org-badge">{user?.name || ORG}</span>
          {onOpenDashboard && (
            <button className="mf-mini-btn ghost" onClick={onOpenDashboard} aria-label="Dashboard" title="Dashboard">
              <LayoutDashboard size={13} /> Dashboard
            </button>
          )}
          {onLogout && (
            <button className="mf-mini-btn ghost" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
      </div>
      <div className="mf-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="mf-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
