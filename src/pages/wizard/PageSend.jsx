import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Info, MapPin, RefreshCw, Send } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { resolveReferralHub, ALL_ALBERTA_TOWNS, ALBERTA_REFERRAL_HUBS } from "../../lib/albertaReferralRouting.js";
import { ORG, CASE_ID } from "../../data/mockData.js";

/* ── Stage 6: Route & send ─────────────────────────────────────────────── */

export function PageSend({ letterBody, specialist, setSpecialist, channel, setChannel, attested, setAttested, sendState, setSendState, specialistOptions, routing, clinicTown, isTownOverridden, onChangeTown, onSent, onBack }) {
  const [open, setOpen] = useState(false);
  const [editingTown, setEditingTown] = useState(false);
  const selected = specialistOptions.find((s) => s.id === specialist);
  const canSend = attested && !!specialist && sendState === "idle";

  const applyTownChange = (value) => {
    onChangeTown(value || null);
    setSpecialist(""); // the hub may have changed — don't leave a stale clinic selected
    setEditingTown(false);
  };
  const resetTown = () => {
    onChangeTown(null);
    setSpecialist("");
    setEditingTown(false);
  };
  const send = () => {
    if (!canSend) return;
    setSendState("sending");
    window.setTimeout(() => { setSendState("sent"); onSent(); }, 1100);
  };

  if (sendState === "sent") {
    return (
      <PageShell title="Referral sent and logged" subhead="">
        <div className="mf-sent-card">
          <div className="mf-sent-icon"><Check size={18} /></div>
          <h3 className="mf-sent-title">Sent to {selected?.name}</h3>
          <p className="mf-sent-body">{selected?.practice}. The full pipeline trace — extraction, rules, draft, and your
            authorisation — is attached to the case's immutable audit log.</p>
          <div className="mf-sent-meta">
            <div><span>Case</span><span>{CASE_ID}</span></div>
            <div><span>Channel</span><span>{channel === "fax" ? "Secure e-fax" : channel === "message" ? "Encrypted message" : "REST API"}</span></div>
            {selected?.fax && <div><span>Fax</span><span>{selected.fax}</span></div>}
            <div><span>Status</span><span>Awaiting delivery confirmation</span></div>
          </div>
        </div>
        <PageNav onBack={onBack} onNext={onSent} nextLabel="View feedback & audit" />
      </PageShell>
    );
  }

  return (
    <PageShell title="Route & send" subhead="Pick the specialist and channel. The Communication Engine transmits the approved package — the referral is not editable past this point.">
      <SectionLabel>Draft (approved)</SectionLabel>
      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <pre className="mf-letter-body" style={{ whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{letterBody}</pre>
      </div>

      <SectionLabel>Specialist</SectionLabel>
      <div className="mf-info-strip" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {routing ? <MapPin size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>
            {routing
              ? <>{isTownOverridden ? "Routed for this referral from" : "Auto-routed from your clinic in"} <b>{clinicTown}</b> → <b>{routing.hub}</b> ({routing.zone}).</>
              : "Set a clinic town to auto-route to the correct AHS referral hub — showing a generic directory for now."}
            {" "}
            <button type="button" className="mf-toggle-link" style={{ display: "inline", padding: 0 }}
              onClick={() => setEditingTown((v) => !v)}>
              {editingTown ? "Cancel" : routing ? "Change" : "Set a town"}
            </button>
            {isTownOverridden && !editingTown && (
              <> · <button type="button" className="mf-toggle-link" style={{ display: "inline", padding: 0 }} onClick={resetTown}>Use my profile town</button></>
            )}
          </span>
        </div>
        {editingTown && (
          <div className="mf-select-wrap" style={{ maxWidth: 360 }}>
            <select className="mf-select" value={ALL_ALBERTA_TOWNS.includes(clinicTown) ? clinicTown : ""}
              onChange={(e) => applyTownChange(e.target.value)} autoFocus>
              <option value="" disabled>Select a town — grouped by AHS referral hub</option>
              {ALBERTA_REFERRAL_HUBS.map((hub) => (
                <optgroup key={hub.id} label={`${hub.name} — ${hub.zone}`}>
                  {hub.towns.map((entry) => {
                    const name = typeof entry === "string" ? entry : entry.name;
                    const rawNote = typeof entry === "string" ? null : entry.note;
                    const resolved = resolveReferralHub(name);
                    // A town split across hubs (e.g. Camrose) is listed once,
                    // under its actual primary hub — not duplicated with a
                    // different label under the alternate hub too.
                    if (resolved.hub !== hub.name) return null;
                    const hint = rawNote || resolved.alternates[0]?.condition;
                    return <option key={name} value={name}>{hint ? `${name} — ${hint}` : name}</option>;
                  })}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={16} className="mf-select-icon" />
          </div>
        )}
      </div>
      <div className="mf-specialist-wrap">
        <button className={`mf-specialist-trigger${!selected ? " placeholder" : ""}`} onClick={() => setOpen((v) => !v)}>
          {selected ? `${selected.name} — ${selected.practice}` : "Select a specialist"} <ChevronDown size={15} />
        </button>
        {open && (
          <div className="mf-specialist-menu">
            {specialistOptions.map((s) => (
              <button key={s.id} className="mf-specialist-option" onClick={() => { setSpecialist(s.id); setOpen(false); }}>
                <div>{s.name} <span className="mf-match-chip">{s.match}</span></div>
                <div className="mf-specialist-meta">{s.practice} · {s.fax ? `fax ${s.fax}` : `accepts ${s.accepts}`}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionLabel>Channel</SectionLabel>
      <div className="mf-channel-row">
        {["fax", "message", "api"].map((c) => (
          <button key={c} className={`mf-channel-btn${channel === c ? " active" : ""}`} onClick={() => setChannel(c)}>
            {c === "fax" ? "Secure e-fax" : c === "message" ? "Encrypted message" : "REST API"}
          </button>
        ))}
      </div>

      <div className="mf-attest-box">
        <label className="mf-attest-row">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          I have reviewed this referral against the original note and authorise it to be sent.
        </label>
      </div>

      <div className="mf-page-nav">
        <button className="mf-ghost-btn" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <button className="mf-primary-btn" disabled={!canSend} onClick={send}>
          {sendState === "sending" ? <><RefreshCw size={14} className="mf-spin" /> Sending…</> : <>Send referral <Send size={15} /></>}
        </button>
      </div>
    </PageShell>
  );
}
