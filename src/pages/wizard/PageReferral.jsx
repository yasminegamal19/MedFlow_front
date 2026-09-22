import { useState } from "react";
import { Pencil, RefreshCw, Info, Paperclip } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { MetaPill } from "../../components/MetaPill.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { ORG, REFERRAL_DRAFT } from "../../data/mockData.js";

/* ── Stage 4: Referral draft ───────────────────────────────────────────── */

export function PageReferral({ signal, letterBody, setLetterBody, onNext, onBack }) {
  const [editing, setEditing] = useState(false);
  return (
    <PageShell title="Referral draft"
      subhead="The Document Generation Engine renders the approved extraction into the pathway template — a deterministic Jinja2 render, no free-form AI writing. Nothing here is a clinical decision."
      headerRight={
        <button className="mf-toggle-link" onClick={() => setEditing((v) => !v)}>
          <Pencil size={14} /> {editing ? "Preview" : "Edit draft"}
        </button>
      }>
      <div className="mf-meta-row">
        <MetaPill k="Template" v="Knee — orthopaedic referral" />
        <MetaPill k="Urgency" v={signal.urgency} />
        <MetaPill k="Status" v="For review" />
      </div>

      <div className="mf-toolbar">
        <button className="mf-tool-btn" onClick={() => setLetterBody(REFERRAL_DRAFT)}><RefreshCw size={13} /> Regenerate from approved data</button>
      </div>

      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <div className="mf-letter-date">10 September 2026</div>
        {editing
          ? <textarea className="mf-edit-textarea" value={letterBody} onChange={(e) => setLetterBody(e.target.value)} />
          : <pre className="mf-letter-body" style={{ whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{letterBody}</pre>}
        <div className="mf-letter-attach"><Paperclip size={13} /> Knee_XRay_WeightBearing_Report.pdf</div>
      </div>

      <div className="mf-info-strip">
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The <b>PATHWAY CHECK</b> block is the rules‑engine output embedded verbatim — the specialist sees exactly which
        criteria were met and which (if any) are missing.
      </div>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Send to physician review" />
    </PageShell>
  );
}
