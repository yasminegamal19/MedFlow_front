import { useState } from "react";
import { Eye, EyeOff, ScrollText } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { Accordion } from "../../components/Accordion.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { AI_REQUEST, SAMPLE_NOTE } from "../../data/mockData.js";

/* ── Stage 5: Physician review & authorisation ─────────────────────────── */

export function PageReview({ signal, letterBody, sections, decision, setDecision, onNext, onBack }) {
  const [showNote, setShowNote] = useState(false);
  const original = sections || AI_REQUEST.result.sections;

  return (
    <PageShell title="Physician review & authorisation"
      subhead="Everything below is a proposal from the pipeline. The physician confirms it against the source note, then approves, edits, or rejects — and that decision seeds the feedback dataset."
      headerRight={
        <button className="mf-toggle-link" onClick={() => setShowNote((v) => !v)}>
          {showNote ? <EyeOff size={15} /> : <Eye size={15} />} {showNote ? "Hide" : "View"} original note
        </button>
      }>
      {showNote && (
        <div className="mf-note-box"><p className="mf-note-box-title">Original visit note</p><pre className="mf-mono-block">{SAMPLE_NOTE}</pre></div>
      )}

      <Accordion title="AI extraction" badge={`${original.length} sections · all grounded`} tone="sage">
        <ul>{original.map((s, i) => <li key={i}><b>{s.title}:</b> {s.content}</li>)}</ul>
      </Accordion>
      <Accordion title="Pathway check" badge={`${signal.urgency} · ${signal.complete ? "complete" : "gap"}`}
        tone={signal.urgency === "routine" ? "sage" : "amber"}>
        <ul>
          {signal.criteria.map((c) => <li key={c.id}>{c.met ? "✓" : "✗"} {c.label}{c.required ? "" : " (optional)"}</li>)}
          <li>Red flags: {signal.red_flags.length ? signal.red_flags.join("; ") : "none"}</li>
        </ul>
      </Accordion>
      <Accordion title="Referral draft" badge="deterministic template" tone="sage">
        <pre className="mf-mono-block" style={{ maxHeight: 200, overflow: "auto" }}>{letterBody}</pre>
      </Accordion>

      <SectionLabel>Your decision</SectionLabel>
      <div className="mf-choice-row">
        {[
          ["approved", "Approve", "Extraction and draft are accurate — proceed to routing."],
          ["edited", "Approve with edits", "You corrected the extraction — the edits are recorded."],
          ["rejected", "Reject", "Send back for re-extraction or manual handling."],
        ].map(([k, t, s]) => (
          <button key={k} className={`mf-choice${decision === k ? " active" : ""}`} onClick={() => setDecision(k)}>
            <div className="mf-choice-title">{t}</div>
            <div className="mf-choice-sub">{s}</div>
          </button>
        ))}
      </div>

      <div className="mf-info-strip">
        <ScrollText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The decision is posted to <code>/v1/feedback</code> with the model + prompt version. The raw note is never stored —
        only a hash — so the dataset is de‑identified from the start.
      </div>

      <PageNav onBack={onBack} onNext={decision ? onNext : undefined}
        nextLabel={decision === "rejected" ? "Return case" : "Continue to routing"} />
      {!decision && <p className="mf-tiny-note" style={{ textAlign: "right" }}>Choose a decision to continue.</p>}
    </PageShell>
  );
}
