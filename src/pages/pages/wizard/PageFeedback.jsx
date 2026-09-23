import { GitBranch } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { Card } from "../../components/Card.jsx";
import { SummaryRow } from "../../components/SummaryCard.jsx";
import { StatusPillSmall } from "../../components/StatusPillSmall.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { CASE_ID, FEEDBACK_RECORD, MODULES, PATHWAY_SIGNAL } from "../../data/mockData.js";

/* ── Stage 7: Feedback & audit ─────────────────────────────────────────── */

export function PageFeedback({ decision, channel, specialist, onBack }) {
  const fb = { ...FEEDBACK_RECORD, decision: decision || "approved" };
  return (
    <PageShell title="Feedback & audit trail"
      subhead="The case is closed. The physician's decision is now a de-identified training example, and every step is on the immutable audit log.">
      <SectionLabel>Continuous-learning record</SectionLabel>
      <Card>
        <SummaryRow k="Decision" v={<StatusPillSmall color={fb.decision === "rejected" ? "amber" : "sage"}>{fb.decision}</StatusPillSmall>} />
        <SummaryRow k="Model" v={fb.model_id} />
        <SummaryRow k="Prompt version" v={fb.prompt_version} />
        <SummaryRow k="Reviewer" v={fb.reviewer} />
        <SummaryRow k="Note" v={<span className="mf-grounded-phrase">hash {fb.note_hash.slice(0, 16)}… (raw note not stored)</span>} />
        {fb.decision === "edited" && <SummaryRow k="Comment" v={fb.comment} />}
      </Card>

      {fb.decision === "edited" && (
        <>
          <SectionLabel>What the physician changed</SectionLabel>
          <div className="mf-feedback-diff">
            Aggravating Factors:{"\n"}
            <span className="del">  Climbing stairs, prolonged standing</span>{"\n"}
            <span className="add">  Climbing stairs; prolonged standing at work</span>
          </div>
        </>
      )}

      <div className="mf-info-strip">
        <GitBranch size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Edits feed the pipeline <b>physician edits → anonymisation → dataset → evaluation → fine-tuning</b>. No automatic
        retraining — the dataset is built for human-reviewed evaluation first.
      </div>

      <SectionLabel>Case audit log</SectionLabel>
      <Card>
        {[
          ["15:19", "Case created", `${CASE_ID} · knee pathway`],
          ["15:20", "AI extraction queued", "POST /api/v1/ai/extractions → 202"],
          ["15:20", "Extraction completed", "8 sections, all grounded · medgemma-1.5-4b"],
          ["15:21", "Rules evaluated", `pathway=knee urgency=${PATHWAY_SIGNAL.urgency}`],
          ["15:21", "Draft generated", "Knee referral template"],
          ["15:24", `Physician ${fb.decision}`, `${fb.reviewer}`],
          ["15:25", "Referral sent", `${channel} → ${specialist?.name ?? "specialist"}`],
        ].map(([t, ev, d], i) => (
          <div className="mf-summary-row" key={i}>
            <span className="mf-summary-key">{t} · {ev}</span>
            <span className="mf-summary-val" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>{d}</span>
          </div>
        ))}
      </Card>

      <SectionLabel>Where this sits in the platform</SectionLabel>
      <Card>
        {MODULES.map((m) => (
          <div className="mf-summary-row" key={m.n}>
            <span className="mf-summary-key">{m.here ? "▸ " : ""}Module {m.n} — {m.name}</span>
            <span className="mf-summary-val" style={{ color: m.here ? "var(--blue)" : "var(--ink-soft)", fontSize: 12 }}>
              {m.here ? "shown in this demo" : m.role}
            </span>
          </div>
        ))}
      </Card>

      <PageNav onBack={onBack} />
    </PageShell>
  );
}
