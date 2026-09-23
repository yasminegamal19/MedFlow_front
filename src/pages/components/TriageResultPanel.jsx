import { useState } from "react";
import { CONDITION_GROUPS } from "../lib/mskTriage.js";
import { SummaryCard, SummaryRow } from "./SummaryCard.jsx";
import { StatusPillSmall } from "./StatusPillSmall.jsx";

const MSK_RESULT_TONE = {
  Mild: "sage", Moderate: "amber", Severe: "clay", "Red Flag": "clay", Atypical: "amber",
  Routine: "sage", Priority: "amber", Urgent: "clay",
};

// The rows a "Triage result" readout is made of — rendered twice: inside the
// sticky panel that updates live throughout, and again, plain, as the
// assessment's final step. Both read the same `result`; there is no second
// computation and no second data-entry surface.
export function TriageResultRows({ result }) {
  return (
    <>
      <SummaryRow k="Condition" v={CONDITION_GROUPS.find((c) => c.id === result.conditionGroup)?.label} />
      <SummaryRow k="Severity" v={<StatusPillSmall color={MSK_RESULT_TONE[result.severity]}>{result.severity}</StatusPillSmall>} />
      <SummaryRow k="Urgency" v={<StatusPillSmall color={MSK_RESULT_TONE[result.urgency]}>{result.urgency}</StatusPillSmall>} />
      <SummaryRow k="Referral" v={result.referralAppropriateness} />
      {result.missingInfo.length > 0 && (
        <>
          <p className="mf-summary-title" style={{ marginTop: 14 }}>Missing information</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.6, color: "var(--amber)", textAlign: "left" }}>
            {result.missingInfo.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </>
      )}
      <p className="mf-summary-title" style={{ marginTop: 14 }}>Suggested next steps</p>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-soft)", textAlign: "left" }}>
        {result.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </>
  );
}

// Sticky "Triage result" panel — a live readout of the deterministic engine
// (mskTriage.js's runMskTriage), derived entirely from the Clinical
// Assessment answers to its left. Visible from step 1 so severity/urgency
// update live as sections are filled in.
export function TriageResultPanel({ result }) {
  const [showLegend, setShowLegend] = useState(false);
  return (
    <SummaryCard title={
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        Triage result
        <button type="button" className="mf-toggle-link" style={{ fontSize: 11, fontWeight: 500 }}
          onClick={() => setShowLegend((v) => !v)}>
          {showLegend ? "Hide legend" : "What do these mean?"}
        </button>
      </span>
    }>
      {showLegend && (
        <div style={{ textAlign: "left", fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "0 0 14px" }}>
          <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Urgency</p>
          <p style={{ margin: "0 0 8px" }}>
            <b>Routine</b> — mild/moderate, no red flags · <b>Priority</b> — severe, major functional impairment · <b>Urgent</b> — a red flag (infection, trauma, neuro deficit) is present.
          </p>
          <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Missing information</p>
          <p style={{ margin: "0 0 8px" }}>
            What this checks for: symptom duration, severity, functional impact, red flags, physical exam, investigations, management attempted, comorbidities, medications. A flag means that item hasn't been filled in yet.
          </p>
          <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Referral appropriateness</p>
          <p style={{ margin: 0 }}>
            <b>Appropriate</b> — meets pathway criteria · <b>Not appropriate yet</b> — conservative management not yet tried · <b>Urgent referral required</b> — a red flag · <b>Consider alternative diagnosis</b> — pattern is atypical.
          </p>
        </div>
      )}
      <TriageResultRows result={result} />
    </SummaryCard>
  );
}
