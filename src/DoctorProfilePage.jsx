import { useMemo, useState } from "react";
import { LogOut, MapPin, Database } from "lucide-react";
import { GlobalStyle } from "./styles.jsx";
import { updateProfile } from "./api.js";
import { resolveReferralHub } from "./albertaReferralRouting.js";
import TableEditor from "./TableEditor.jsx";

export default function DoctorProfilePage({ user, onLogout, onBack, onUserUpdate }) {
  const [tab, setTab] = useState("profile"); // profile | tables
  const [clinicTown, setClinicTown] = useState(user?.clinic_town || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const routing = useMemo(() => resolveReferralHub(clinicTown), [clinicTown]);
  const dirty = clinicTown !== (user?.clinic_town || "");

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

  return (
    <div className="mf-app">
      <GlobalStyle />
      <style>{`
        .dp-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--paper-raised); }
        .dp-topbar-left { display: flex; align-items: center; gap: 10px; }
        .dp-wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 64px; }
        .dp-wrap.wide { max-width: 1080px; }
        .dp-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
        .dp-tab { padding: 10px 4px; margin-right: 20px; background: none; border: none; border-bottom: 2px solid transparent;
          font-size: 13.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .dp-tab.active { color: var(--blue); border-bottom-color: var(--blue); }
        .dp-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md);
          padding: 20px 22px; box-shadow: var(--shadow-sm); margin-bottom: 20px; }
        .dp-readonly-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 4px; }
        .dp-readonly-grid > div { font-size: 13.5px; }
        .dp-readonly-grid .mf-label { margin-bottom: 2px; }
        .dp-readonly-value { color: var(--ink-soft); }
        .dp-routing { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
        .dp-routing-head { display: flex; gap: 8px; align-items: center; color: var(--blue); margin-bottom: 6px; font-weight: 600; font-size: 14px; }
        .dp-routing-rule { font-size: 13px; color: var(--ink-soft); margin: 0 0 10px; }
        .dp-chip { display: inline-block; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px;
          padding: 3px 9px; border-radius: 999px; margin: 0 6px 6px 0; }
        .dp-alt { font-size: 12.5px; color: var(--amber); margin-top: 4px; }
        .dp-empty { font-size: 13px; color: var(--ink-soft); }
        .dp-save-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
        .dp-saved { color: var(--sage); font-size: 13px; }
        .dp-error { color: var(--clay); font-size: 13px; }
      `}</style>

      <div className="dp-topbar">
        <div className="dp-topbar-left">
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

      <div className={`dp-wrap${tab === "tables" ? " wide" : ""}`}>
        <div className="mf-page-head">
          <h1 className="mf-page-title">Dashboard</h1>
        </div>
        <p className="mf-page-subhead">
          Your profile and referral routing, plus direct access to the organization's underlying data.
        </p>

        <div className="dp-tabs">
          <button className={`dp-tab${tab === "profile" ? " active" : ""}`} onClick={() => setTab("profile")}>
            <MapPin size={14} /> Profile & routing
          </button>
          <button className={`dp-tab${tab === "tables" ? " active" : ""}`} onClick={() => setTab("tables")}>
            <Database size={14} /> Case types & workflows
          </button>
        </div>

        {tab === "tables" ? (
          <TableEditor />
        ) : (
          <>
        <div className="dp-card">
          <div className="dp-readonly-grid">
            <div><div className="mf-label">Name</div><div className="dp-readonly-value">{user?.name}</div></div>
            <div><div className="mf-label">Email</div><div className="dp-readonly-value">{user?.email}</div></div>
            <div><div className="mf-label">Role</div><div className="dp-readonly-value">{user?.role}</div></div>
            <div><div className="mf-label">Organization</div><div className="dp-readonly-value">{user?.organization?.name || "—"}</div></div>
          </div>
        </div>

        <div className="dp-card">
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

          <div className="dp-routing">
            <div className="dp-routing-head"><MapPin size={15} /> Your referral routing</div>
            {!clinicTown.trim() && <div className="dp-empty">Enter your clinic's town to see your AHS zone and specialty intake.</div>}
            {clinicTown.trim() && !routing && (
              <div className="dp-empty">No match for “{clinicTown}” in the Foundation Edition v1.0 map (MSK/Ortho/Spine only).</div>
            )}
            {routing && (
              <>
                <p className="dp-routing-rule">
                  Routes to <b>{routing.hub}</b> — {routing.zone}. {routing.rule}
                </p>
                <div>{routing.specialties.map((s) => <span className="dp-chip" key={s}>{s}</span>)}</div>
                {routing.alternates.map((a) => (
                  <div className="dp-alt" key={a.hub}>Alternate: <b>{a.hub}</b> ({a.zone}) — {a.condition}</div>
                ))}
              </>
            )}
          </div>

          <div className="dp-save-row">
            <button className="mf-primary-btn" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="dp-saved">Saved</span>}
            {saveError && <span className="dp-error">{saveError}</span>}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
