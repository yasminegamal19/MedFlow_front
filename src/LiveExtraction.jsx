/* Live AI extraction — the real frontend -> backend -> ai-service round trip.
 *
 * Self-contained: its own note input, submit, polling status, and result view.
 * Rendered in dedicated nav tabs so the mocked wizard pages stay static.
 *
 * The extraction record + polling live in <MedFlowApp> (so both tabs share it);
 * this file is just the UI.
 */

import { useEffect, useState } from "react";
import {
  Sparkles, Loader2, ArrowRight, ArrowLeft, AlertTriangle, Info, Eye, EyeOff, RefreshCw,
} from "lucide-react";
import { syntaxHighlight, flattenSchema } from "./format";

const EXAMPLE_NOTE = `Patient is a 58-year-old male presenting with substernal chest pain radiating to the left arm for the past 2 hours. History of hypertension and type 2 diabetes mellitus. Current medications: metformin 1000 mg BID, lisinopril 20 mg daily. BP 158/94, HR 102, afebrile. Troponin pending. ECG shows ST-segment depression in leads V4-V6.`;

const isEmpty = (v) =>
  v == null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) ||
  (typeof v === "string" && v.trim() === "");

const fmtList = (v) => (Array.isArray(v) && v.length ? v.join(", ") : null);
const fmtVitals = (v) => {
  if (!v || Array.isArray(v) || typeof v !== "object") return null;
  const entries = Object.entries(v);
  return entries.length ? entries.map(([k, val]) => `${k}: ${val}`).join(" · ") : null;
};

function useElapsed(active, since) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const start = since ? new Date(since).getTime() : now;
  const secs = Math.max(0, Math.round((now - start) / 1000));
  const m = Math.floor(secs / 60);
  return m > 0 ? `${m}m ${secs % 60}s` : `${secs}s`;
}

function Shell({ title, subhead, headerRight, children }) {
  return (
    <div className="mf-page">
      <div className="mf-page-head">
        <h1 className="mf-page-title">{title}</h1>
        {headerRight}
      </div>
      {subhead && <p className="mf-page-subhead">{subhead}</p>}
      {children}
    </div>
  );
}

function Field({ label, value }) {
  const missing = isEmpty(value);
  return (
    <div className={`mf-field-card${missing ? " null" : ""}`}>
      <p className="mf-field-key">{label}</p>
      {missing ? <span className="mf-null">Not stated in note</span> : <p className="mf-field-value">{value}</p>}
    </div>
  );
}

/* ── Tab 1: submit a note + watch the job ─────────────────────────────── */

export function LiveExtract({ live, submitLive, resetLive, goData }) {
  const [note, setNote] = useState(EXAMPLE_NOTE);
  const [pathway, setPathway] = useState("knee");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showNote, setShowNote] = useState(false);

  const status = live?.status ?? null;
  const running = status === "queued" || status === "running";
  const elapsed = useElapsed(running, live?.created_at);
  const data = live?.result?.data ?? null;
  const reasoning = live?.result?.reasoning;

  const run = async () => {
    if (note.trim().length < 10 || busy) {
      setErr(note.trim().length < 10 ? "Paste a note of at least 10 characters." : null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await submitLive(note, pathway);
    } catch (e) {
      setErr(e?.message || "Could not reach the backend on port 8010.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="AI extraction — live"
      subhead="Sends the note to the Laravel backend, which queues a job on the MedGemma ai-service and gets the result back by webhook. CPU inference takes ~10–30 minutes."
      headerRight={
        status ? (
          <button className="mf-toggle-link" onClick={resetLive}><RefreshCw size={14} /> New note</button>
        ) : null
      }
    >
      {!status && (
        <>
          <div className="mf-field">
            <label className="mf-label">Referral pathway</label>
            <div className="mf-select-wrap">
              <select className="mf-select" value={pathway} onChange={(e) => setPathway(e.target.value)}>
                <option value="knee">Orthopedic — Knee</option>
                <option value="hip">Orthopedic — Hip</option>
                <option value="shoulder">Orthopedic — Shoulder</option>
                <option value="spine">Orthopedic — Spine</option>
              </select>
            </div>
          </div>
          <div className="mf-field">
            <label className="mf-label">Clinical note</label>
            <textarea className="mf-textarea" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Paste the visit note here…" />
          </div>
          {err && <p className="mf-error">{err}</p>}
          <div className="mf-actions">
            <button className="mf-primary-btn" onClick={run} disabled={busy}>
              {busy ? <><Loader2 size={15} className="mf-spin" /> Submitting…</> : <><Sparkles size={15} /> Run extraction</>}
            </button>
          </div>
        </>
      )}

      {status && (
        <div className="mf-meta-row" style={{ marginBottom: 16 }}>
          <span className="mf-meta-pill">Job <b>{live.id?.slice(0, 8)}</b></span>
          <span className="mf-meta-pill">Status <b>{status}</b></span>
          {live.pathway && <span className="mf-meta-pill">Pathway <b>{live.pathway}</b></span>}
          <button className="mf-toggle-link" onClick={() => setShowNote((v) => !v)}>
            {showNote ? <EyeOff size={14} /> : <Eye size={14} />} note
          </button>
        </div>
      )}

      {showNote && (
        <div className="mf-note-box">
          <p className="mf-note-box-title">Submitted note</p>
          <pre className="mf-mono-block">{note}</pre>
        </div>
      )}

      {running && (
        <div className="mf-note-box" style={{ textAlign: "center", padding: "40px 24px" }}>
          <Loader2 size={26} className="mf-spin" />
          <p className="mf-note-box-title" style={{ marginTop: 12 }}>MedGemma is reading the note…</p>
          <p className="mf-tiny-note">Polling the backend every 5s — you can leave this tab. Elapsed: {elapsed}</p>
        </div>
      )}

      {status === "failed" && (
        <>
          <div className="mf-verdict mf-verdict-gap">
            <AlertTriangle size={16} />
            Extraction failed: {live?.error?.message || "unknown error"}
            {live?.error?.code ? ` (${live.error.code})` : ""}
          </div>
          <div className="mf-actions">
            <button className="mf-primary-btn" onClick={resetLive}><RefreshCw size={15} /> Try another note</button>
          </div>
        </>
      )}

      {status === "succeeded" && data && (
        <>
          <div className="mf-field-grid">
            <Field label="Age" value={data.age != null ? `${data.age}` : null} />
            <Field label="Sex" value={data.sex} />
            <Field label="Chief complaint" value={data.chief_complaint} />
            <Field label="Past medical history" value={fmtList(data.past_medical_history)} />
            <Field label="Medications" value={fmtList(data.medications)} />
            <Field label="Relevant findings" value={fmtList(data.relevant_findings)} />
            <Field label="Vital signs" value={fmtVitals(data.vital_signs)} />
          </div>

          {reasoning && (
            <details className="mf-accordion" style={{ padding: "10px 14px" }}>
              <summary className="mf-accordion-title" style={{ cursor: "pointer" }}>Model reasoning</summary>
              <pre className="mf-mono-block" style={{ marginTop: 10 }}>{reasoning}</pre>
            </details>
          )}

          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Only what the note explicitly states. Missing fields stay null — a clinician decides what they mean.
          </div>

          <div className="mf-actions">
            <button className="mf-primary-btn" onClick={goData}>View structured JSON <ArrowRight size={15} /></button>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ── Tab 2: the raw structured result ────────────────────────────────── */

export function LiveData({ live, goExtract }) {
  const [tab, setTab] = useState("json");
  const data = live?.status === "succeeded" ? live?.result?.data : null;

  if (!data) {
    return (
      <Shell title="Structured JSON — live" subhead="The MedGemma contract for the live extraction.">
        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          No result yet. Run an extraction on the “AI extraction — live” tab first.
        </div>
        <div className="mf-page-nav">
          <button className="mf-ghost-btn" onClick={goExtract}><ArrowLeft size={15} /> Back</button>
        </div>
      </Shell>
    );
  }

  const rows = flattenSchema(data);

  return (
    <Shell
      title="Structured JSON — live"
      subhead="The exact JSON the ai-service returned for the live extraction."
      headerRight={
        <span className="mf-tiny-note">
          {live.token_count ? `${live.token_count} tokens` : null}
          {live.duration_seconds ? ` · ${Math.round(live.duration_seconds)}s` : null}
        </span>
      }
    >
      <div className="mf-tabs">
        <button className={`mf-tab${tab === "json" ? " active" : ""}`} onClick={() => setTab("json")}>Raw JSON</button>
        <button className={`mf-tab${tab === "schema" ? " active" : ""}`} onClick={() => setTab("schema")}>Schema table</button>
      </div>

      {tab === "json" && (
        <div className="mf-code-panel">
          <pre dangerouslySetInnerHTML={{ __html: syntaxHighlight(JSON.stringify(data, null, 2)) }} />
        </div>
      )}

      {tab === "schema" && (
        <div className="mf-table-wrap">
          <table className="mf-table">
            <thead><tr><th>Field</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const muted = r.type === "null" || r.type === "array";
                const color = { string: "blue", number: "amber", boolean: "sage", null: "muted", array: "muted" }[r.type];
                return (
                  <tr key={r.path} className={muted ? "muted-row" : ""}>
                    <td className="mf-path">{r.path}</td>
                    <td><span className={`mf-type-badge mf-type-${color}`}>{r.type}</span></td>
                    <td className="mf-value">{r.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mf-page-nav">
        <button className="mf-ghost-btn" onClick={goExtract}><ArrowLeft size={15} /> Back to extraction</button>
      </div>
    </Shell>
  );
}
