import { useState, useEffect } from "react";
import { Info, AlertTriangle } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { Field } from "../../components/Field.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { getPathwayDefinition } from "../../lib/api.js";
import { CONDITION_GROUPS } from "../../lib/mskTriage.js";
import { DynamicClinicalAssessmentForm } from "./DynamicClinicalAssessmentForm.jsx";

/* ── Stage 3: Clinical assessment — condition-specific pathway walkthrough
   feeding a live, deterministic triage result (static logic, no model) ──── */

export function PageClinicalAssessment({ conditionGroup, pathways, onChangeConditionGroup, sections, aiFieldValues, formFillStatus, prefetchedDefinition, onNext, onBack }) {
  const pathwayMeta = pathways.find((p) => p.conditionGroup === conditionGroup);

  // The form itself comes from the backend (GET /pathways/{id}) rather than
  // a hardcoded per-condition-group config — refetched whenever the tab
  // (i.e. the DB pathway id behind it) changes. `prefetchedDefinition` is
  // whatever handleCreateCase already fetched for the pathway selected at
  // intake — reused as-is when the tab still matches it, so arriving here
  // right after case creation doesn't re-request a definition already in
  // hand. Switching to a different pathway tab still fetches fresh.
  const [definition, setDefinition] = useState(
    prefetchedDefinition?.pathway?.id === pathwayMeta?.id ? prefetchedDefinition : null
  );
  const [defError, setDefError] = useState(null);
  useEffect(() => {
    if (prefetchedDefinition?.pathway?.id === pathwayMeta?.id) {
      setDefinition(prefetchedDefinition);
      setDefError(null);
      return;
    }
    setDefinition(null);
    setDefError(null);
    if (!pathwayMeta) return;
    getPathwayDefinition(pathwayMeta.id)
      .then(setDefinition)
      .catch((err) => setDefError(err.message || "Could not load this pathway's clinical assessment form."));
  }, [pathwayMeta?.id, prefetchedDefinition]);

  return (
    <PageShell title="Clinical assessment"
      subhead={definition
        ? `${definition.pathway.name} — pre-filled from the AI extraction where the note already says so; every value stays editable. One pathway walkthrough feeds the deterministic triage result below — nothing is asked twice.`
        : "A structured walk-through of the written primary-care pathway for the condition, feeding a deterministic triage result."}>

      <Field label="Pathway">
        <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
          {CONDITION_GROUPS.map((c) => (
            <button type="button" key={c.id} className={`mf-channel-btn${conditionGroup === c.id ? " active" : ""}`}
              onClick={() => onChangeConditionGroup?.(c.id)} style={{ flex: "1 1 150px" }}>
              {c.label}
              {!pathways.some((p) => p.conditionGroup === c.id) && <span style={{ opacity: 0.6 }}> (soon)</span>}
            </button>
          ))}
        </div>
      </Field>

      {!pathwayMeta ? (
        <>
          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            No written pathway yet for {CONDITION_GROUPS.find((c) => c.id === conditionGroup)?.label || conditionGroup} —
            pick another tab above, or continue; the generic rules still apply.
          </div>
          <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to validation & rules" />
        </>
      ) : defError ? (
        <>
          <div className="mf-info-strip">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {defError}
          </div>
          <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to validation & rules" />
        </>
      ) : !definition ? (
        <p className="mf-tiny-note">Loading clinical assessment form…</p>
      ) : (
        <DynamicClinicalAssessmentForm key={definition.pathway.id} conditionGroup={conditionGroup}
          definition={definition} sections={sections}
          aiFieldValues={aiFieldValues} formFillStatus={formFillStatus}
          onNext={onNext} onBack={onBack} />
      )}
    </PageShell>
  );
}
