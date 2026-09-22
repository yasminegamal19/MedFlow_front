import { useState, useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, Info, ScrollText, Sparkles } from "lucide-react";
import { Card } from "../../components/Card.jsx";
import { Field } from "../../components/Field.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { CheckField } from "../../components/CheckField.jsx";
import { PillGroup } from "../../components/PillGroup.jsx";
import { AiBadge } from "../../components/AiBadge.jsx";
import { AlertBanner } from "../../components/AlertBanner.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { TriageResultRows, TriageResultPanel } from "../../components/TriageResultPanel.jsx";
import { isTerminal } from "../../lib/api.js";
import { runMskTriage } from "../../lib/mskTriage.js";
import { inferClinicalFieldsFromSections } from "../../lib/clinicalAutoFill.js";

// Maps a backend field `code` to the dot-path `runMskTriage()` expects.
// Fixed and pathway-independent: the GEN_* prefix marks exactly the fields
// every pathway seeds identically for the shared triage engine (see
// database/seeders/PathwayFieldDefinitionSeeder.php's GENERIC_* constants).
// IMAGING_CHOICE is handled separately (a presence check, not a passthrough).
const TRIAGE_FIELD_MAP = {
  GEN_DURATION: "duration",
  GEN_PAIN_PATTERN: "symptoms.painPattern",
  GEN_NUMBNESS_TINGLING: "symptoms.numbnessTingling",
  GEN_MECHANICAL_SYMPTOMS: "symptoms.mechanicalSymptoms",
  GEN_SLEEP_DISRUPTION: "symptoms.sleepDisruption",
  GEN_FUNCTIONAL_IMPACT: "symptoms.functionalImpact",
  GEN_ROM: "exam.rom",
  GEN_STRENGTH_DEFICIT: "exam.strengthDeficit",
  GEN_DEFORMITY_ATROPHY: "exam.deformityAtrophy",
  GEN_THENAR_ATROPHY: "exam.thenarAtrophy",
  GEN_THUMB_WEAKNESS: "exam.thumbWeakness",
  GEN_FROZEN_SHOULDER: "exam.frozenShoulder",
  GEN_MOTOR_DEFICIT: "exam.motorDeficit",
  GEN_LABS_STATUS: "investigations.labs",
  GEN_MANAGEMENT_TRIED: "management.tried",
  GEN_MANAGEMENT_WEEKS: "management.weeks",
  GEN_MANAGEMENT_RESPONSE: "management.response",
  GEN_MEDICATIONS: "medications",
  COMORBIDITIES: "comorbidities",
  ATYPICAL_PRESENT: "atypical.present",
  ATYPICAL_SUGGESTION: "atypical.suggestion",
};

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function buildTriageInput(conditionGroup, values, triggeredRedFlags) {
  const input = {
    conditionGroup,
    duration: "",
    symptoms: { painPattern: "", numbnessTingling: false, mechanicalSymptoms: false, sleepDisruption: "", functionalImpact: "" },
    redFlagActive: triggeredRedFlags.length > 0,
    redFlagLabels: triggeredRedFlags.map((f) => f.red_flag_category?.name || f.name),
    exam: { rom: "", strengthDeficit: "", deformityAtrophy: false, thenarAtrophy: false, thumbWeakness: false, frozenShoulder: false, motorDeficit: false },
    investigations: { imaging: values.IMAGING_CHOICE ? "done" : "", labs: "" },
    management: { tried: "", weeks: "", response: "" },
    comorbidities: "", medications: "",
    atypical: { present: false, suggestion: "" },
  };
  for (const [code, path] of Object.entries(TRIAGE_FIELD_MAP)) {
    if (values[code] !== undefined) setPath(input, path, values[code]);
  }
  return input;
}

function toneForSeverity(severity) {
  return severity === "moderate" ? "amber" : "clay";
}

export function DynamicClinicalAssessmentForm({ conditionGroup, definition, sections, aiFieldValues, formFillStatus, onNext, onBack }) {
  const sectionByCode = Object.fromEntries(definition.sections.map((s) => [s.code, s]));

  // Computed once per mount — this component is remounted (via `key`, the
  // pathway's DB id) every time the pathway tab changes, so there's no
  // stale-suggestion risk. This client-side heuristic (clinicalAutoFill.js)
  // is the immediate suggestion; the backend's LLM-driven pathway-form
  // extraction (below) supersedes it field-by-field once it arrives.
  const [aiFilled, setAiFilled] = useState(() => inferClinicalFieldsFromSections(definition, sections));
  const [values, setValues] = useState(() => ({ ...aiFilled }));
  // Fields the physician has edited by hand — the backend AI result must
  // never overwrite these once they arrive, even if it answers the same code.
  const touchedCodes = useRef(new Set());
  const setValue = (code, v) => {
    touchedCodes.current.add(code);
    setValues((prev) => ({ ...prev, [code]: v }));
    setAiFilled((prev) => {
      if (!(code in prev)) return prev;
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };
  const clearAllAiSuggestions = () => {
    Object.keys(aiFilled).forEach((code) => touchedCodes.current.add(code));
    setValues({});
    setAiFilled({});
  };
  const aiCount = Object.keys(aiFilled).length;
  // True once the AI has had its pass at a field (client heuristic and/or
  // the backend pathway-form job) and came back with nothing — distinct
  // from a field that was never AI-fillable at all (no ai_mapping) or one
  // the physician has since answered directly.
  const notAiAddressed = (field) =>
    Boolean(field.ai_mapping) && !(field.code in aiFilled) && !touchedCodes.current.has(field.code);
  const NotAddressedHint = ({ field }) =>
    notAiAddressed(field)
      ? <span className="mf-tiny-note" style={{ marginLeft: 8, fontStyle: "italic" }}>not addressed in note</span>
      : null;

  // The backend's pathway-form-extraction job answers form fields directly
  // (validated server-side against each field's own type/options), a more
  // reliable signal than the client-side keyword heuristic above. Merge it
  // in additively as it arrives — it overwrites the heuristic's guess for
  // the same field, but never a value the physician already edited, and
  // never flips an explicit client-side denial (e.g. "no locking, no
  // giving way" -> false) to true: a checkbox `true` from the backend
  // carries no source_phrase grounding check (only text/number fields get
  // one — see ExtractionService.extract_pathway_form), so it's weaker
  // evidence than a textually-grounded negation match. The physician can
  // still check it themselves.
  useEffect(() => {
    if (!aiFieldValues) return;
    const untouched = Object.entries(aiFieldValues).filter(([code, incoming]) => {
      if (touchedCodes.current.has(code)) return false;
      if (aiFilled[code] === false && incoming === true) return false;
      return true;
    });
    if (untouched.length === 0) return;
    setValues((prev) => ({ ...prev, ...Object.fromEntries(untouched) }));
    setAiFilled((prev) => ({ ...prev, ...Object.fromEntries(untouched) }));
  }, [aiFieldValues]);

  // Step 1 — Eligibility: defaults to true (assumed eligible unless told
  // otherwise) same as before this was ever AI-fillable — keyword_bag can
  // only ever assert `true`, never contradict it, so wiring this to
  // values/aiFilled mainly adds the AI badge when the note does support it.
  const eligibilityField = sectionByCode.eligibility?.fields[0];
  const eligible = eligibilityField ? (values[eligibilityField.code] ?? true) : true;

  // Step 2 — History & details: pathway-specific fields plus the shared
  // triage-relevant (GEN_*) fields that used to be asked a second time on
  // the old MSK Triage page. Grouping is by field-code convention, not a
  // per-pathway config, so it needs no changes when a pathway's fields do.
  const [historyDone, setHistoryDone] = useState(false);
  const historyFields = sectionByCode.history?.fields || [];
  const pathwaySelects = historyFields.filter((f) => f.field_type === "select" && !f.code.startsWith("GEN_"));
  const symptomFields = historyFields.filter((f) => f.code.startsWith("SYMPTOM_"));
  const comorbField = historyFields.find((f) => f.code === "COMORBIDITIES");
  const genSelects = historyFields.filter((f) => f.code.startsWith("GEN_") && f.field_type === "select");
  const genChecks = historyFields.filter((f) => f.code.startsWith("GEN_") && f.field_type === "checkbox");

  // Step 3 — Red-flag screening: the AI may now suggest a red flag too
  // (subject to this pathway's "red_flags" AI-fill toggle — see the
  // dashboard's Clinical pathways tab), but only ever a confirmed `true`
  // or an explicit denial-derived `false`, never a guess — the physician
  // still confirms every one before continuing. Checking any item here
  // both shows that flag's own recommended action and is what makes the
  // deterministic engine's urgency "Urgent".
  const [redFlagsDone, setRedFlagsDone] = useState(false);
  const redFlagFields = sectionByCode.red_flags?.fields || [];
  const triggeredFlags = redFlagFields.filter((f) => values[f.code]);

  // Step 4 — Anatomical / differential (pathway-specific, optional)
  const anatomicalSection = sectionByCode.anatomical;
  const anatomicalField = anatomicalSection?.fields[0];
  const anatomicalValue = anatomicalField && values[anatomicalField.code];
  const anatomicalDetail = anatomicalValue && anatomicalField.display_config?.options_detail?.[anatomicalValue];
  // Same gate the pathway walkthrough always used to reveal imaging +
  // management together — now reveals every remaining section (Examination
  // onward) as one continuous block.
  const restRevealed = anatomicalField ? Boolean(anatomicalValue) : redFlagsDone;

  let stepNum = 4;
  const anatomicalStepNum = anatomicalField ? stepNum++ : null;
  const examStepNum = stepNum++;
  const investigationsStepNum = stepNum++;
  const managementStepNum = stepNum++;
  const finalStepNum = stepNum++;

  // Step 5 — Examination: every field (shared ROM/strength/deformity plus
  // any pathway-specific overlay checkboxes, e.g. GEN_THENAR_ATROPHY for
  // CTS) renders generically by field_type — no per-condition-group branch.
  const examFields = sectionByCode.examination?.fields || [];

  // Step 6 — Investigations
  const investigationFields = sectionByCode.investigations?.fields || [];

  // Step 7 — Management: injection-type fields (code prefix "INJECTION_")
  // get their own sub-heading and a conditional warning banner (sourced from
  // PathwayService's display_config.warning enrichment); everything else is
  // a generic checklist item or a shared GEN_* trial field.
  const managementFields = sectionByCode.management?.fields || [];
  const injectionFields = managementFields.filter((f) => f.code.startsWith("INJECTION_"));
  const checklistFields = managementFields.filter((f) => f.field_type === "checkbox" && !f.code.startsWith("INJECTION_"));
  const managementSelects = managementFields.filter((f) => f.field_type === "select");
  const managementNumbers = managementFields.filter((f) => f.field_type === "number");
  const managementTexts = managementFields.filter((f) => f.field_type === "text");

  // Step 8 — Final assessment
  const finalFields = sectionByCode.final_assessment?.fields || [];
  const atypicalCheckbox = finalFields.find((f) => f.field_type === "checkbox");
  const atypicalText = finalFields.find((f) => f.field_type === "text");

  const result = runMskTriage(buildTriageInput(conditionGroup, values, triggeredFlags));

  return (
    <div className="mf-two-col">
      <div>
        {formFillStatus && !isTerminal(formFillStatus) && (
          <p className="mf-tiny-note">AI is reading the note for this pathway's fields — suggestions below will update as they arrive…</p>
        )}
        {aiCount > 0 && (
          <div className="mf-ai-banner">
            <span><Sparkles size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              {aiCount} field{aiCount === 1 ? "" : "s"} pre-filled from the AI extraction — review each before continuing.</span>
            <button type="button" className="mf-mini-btn ghost" onClick={clearAllAiSuggestions}>Clear AI suggestions</button>
          </div>
        )}

        <SectionLabel>1. Initial eligibility</SectionLabel>
        <Card>
          {eligibilityField && (
            <>
              <CheckField label={eligibilityField.name} checked={eligible} ai={eligibilityField.code in aiFilled}
                onChange={(v) => setValue(eligibilityField.code, v)} />
              {!eligible && eligibilityField.display_config?.warning && (
                <div className="mf-info-strip" style={{ marginTop: 10 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {eligibilityField.display_config.warning}
                </div>
              )}
            </>
          )}
        </Card>

        {eligible && (
          <>
            <SectionLabel>2. History & details</SectionLabel>
            <Card>
              <div className="mf-field-grid">
                {pathwaySelects.map((f) => (
                  <PillGroup key={f.code} label={f.name} value={values[f.code]} aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)} options={f.options} />
                ))}
              </div>
              {symptomFields.length > 0 && (
                <Field label="Symptoms — check all that apply">
                  {symptomFields.map((f) => (
                    <CheckField key={f.code} label={f.name}
                      checked={Boolean(values[f.code])} ai={f.code in aiFilled} after={<NotAddressedHint field={f} />}
                      onChange={(v) => setValue(f.code, v)} />
                  ))}
                </Field>
              )}

              <div className="mf-field-grid" style={{ marginTop: 12 }}>
                {genSelects.map((f) => (
                  <PillGroup key={f.code} label={f.name} value={values[f.code]} aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)} options={f.options} />
                ))}
              </div>
              {genChecks.map((f) => (
                <CheckField key={f.code} label={f.name} checked={Boolean(values[f.code])} ai={f.code in aiFilled}
                  after={<NotAddressedHint field={f} />} onChange={(v) => setValue(f.code, v)} />
              ))}

              {comorbField && (
                <Field label={<>{comorbField.name} {aiFilled[comorbField.code] !== undefined && <AiBadge />}</>}>
                  <input type="text" className="mf-input" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box" }}
                    placeholder={comorbField.display_config?.placeholder} value={values[comorbField.code] || ""}
                    onChange={(e) => setValue(comorbField.code, e.target.value)} />
                </Field>
              )}
              {!historyDone && (
                <button className="mf-primary-btn" onClick={() => setHistoryDone(true)} style={{ marginTop: 4 }}>
                  Continue to red-flag screening <ArrowRight size={15} />
                </button>
              )}
            </Card>
          </>
        )}

        {historyDone && (
          <>
            <SectionLabel>3. Red-flag screening</SectionLabel>
            <Card style={{ borderColor: "#E3B8B4" }}>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px" }}>
                Check any that apply based on history and exam. Any selection drives the triage result to Urgent.
              </p>
              <div className="mf-info-strip" style={{ margin: "0 0 12px", background: "transparent", border: "1px dashed #E3B8B4", color: "var(--clay)" }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                A checked box marked "AI" is only ever a confirmed match or an explicit denial in the note — never a
                guess. Confirm every one against your own reading of the note and exam before continuing.
              </div>
              <div className="mf-field-grid">
                {redFlagFields.map((f) => (
                  <div key={f.code} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
                    <CheckField label={f.name} danger hint={f.red_flag_category?.description}
                      checked={Boolean(values[f.code])} ai={f.code in aiFilled} after={<NotAddressedHint field={f} />}
                      onChange={(v) => setValue(f.code, v)} />
                  </div>
                ))}
              </div>
              {triggeredFlags.map((f) => (
                <AlertBanner key={f.code} tone={toneForSeverity(f.red_flag_category?.severity)}
                  title={`${f.red_flag_category?.name || f.name} — action required`}>
                  {f.red_flag_category?.action || "Escalate per this pathway's guidance."}
                </AlertBanner>
              ))}
              {!redFlagsDone && (
                <button className="mf-primary-btn" onClick={() => setRedFlagsDone(true)} style={{ marginTop: 12 }}>
                  {triggeredFlags.length > 0 ? "Acknowledged — continue anyway" : "No red flags — continue"} <ArrowRight size={15} />
                </button>
              )}
            </Card>
          </>
        )}

        {redFlagsDone && anatomicalField && (
          <>
            <SectionLabel>{anatomicalStepNum}. {anatomicalSection.name}</SectionLabel>
            <Card>
              <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
                {anatomicalField.options.map((o) => (
                  <button type="button" key={o.value} className={`mf-channel-btn${anatomicalValue === o.value ? " active" : ""}`}
                    onClick={() => setValue(anatomicalField.code, o.value)} style={{ flex: "1 1 140px" }}>
                    {o.label}
                    {aiFilled[anatomicalField.code] === o.value && <AiBadge />}
                  </button>
                ))}
              </div>
              <NotAddressedHint field={anatomicalField} />
              {anatomicalDetail && (
                <div style={{ marginTop: 14 }}>
                  <p className="mf-section-title">
                    Differential diagnoses — {anatomicalField.options.find((o) => o.value === anatomicalValue)?.label}
                  </p>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    {(anatomicalDetail.differentials || []).map((d) => <li key={d}>{d}</li>)}
                  </ul>
                  {anatomicalDetail.warning && (
                    <div className="mf-info-strip" style={{ marginTop: 10 }}>
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      {anatomicalDetail.warning}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {restRevealed && (
          <>
            <SectionLabel>{examStepNum}. Examination</SectionLabel>
            <Card>
              <div className="mf-field-grid">
                {examFields.filter((f) => f.field_type === "select").map((f) => (
                  <PillGroup key={f.code} label={f.name} value={values[f.code]} aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)} options={f.options} />
                ))}
              </div>
              {examFields.filter((f) => f.field_type === "checkbox").map((f) => (
                <CheckField key={f.code} label={f.name} checked={Boolean(values[f.code])} ai={f.code in aiFilled}
                  after={<NotAddressedHint field={f} />} onChange={(v) => setValue(f.code, v)} />
              ))}
            </Card>

            <SectionLabel>{investigationsStepNum}. Investigations</SectionLabel>
            <Card>
              {investigationFields.filter((f) => f.field_type === "select").map((f) => (
                <PillGroup key={f.code} label={f.name} value={values[f.code]} aiValue={aiFilled[f.code]}
                  onChange={(v) => setValue(f.code, v)} options={f.options} />
              ))}
            </Card>

            <SectionLabel>{managementStepNum}. Management</SectionLabel>
            <Card>
              <p className="mf-section-title">Conservative / non-operative plan</p>
              <div className="mf-field-grid">
                {checklistFields.map((f) => (
                  <CheckField key={f.code} label={f.name} checked={Boolean(values[f.code])} ai={f.code in aiFilled}
                    after={<NotAddressedHint field={f} />} onChange={(v) => setValue(f.code, v)} />
                ))}
              </div>

              {injectionFields.length > 0 && (
                <>
                  <p className="mf-section-title" style={{ marginTop: 14 }}>Injection considerations</p>
                  {injectionFields.map((f) => (
                    <div key={f.code}>
                      <CheckField label={f.name} checked={Boolean(values[f.code])} ai={f.code in aiFilled}
                        after={<NotAddressedHint field={f} />} onChange={(v) => setValue(f.code, v)} />
                      {f.display_config?.warning && values[f.code] && (
                        <div className="mf-verdict mf-verdict-gap" style={{ background: "var(--clay-soft)", color: "var(--clay)", marginTop: 4, marginBottom: 8 }}>
                          <AlertTriangle size={14} /> {f.display_config.warning}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              <p className="mf-section-title" style={{ marginTop: 14 }}>Conservative management trial</p>
              <div className="mf-field-grid">
                {managementSelects.map((f) => (
                  <PillGroup key={f.code} label={f.name} value={values[f.code]} aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)} options={f.options} />
                ))}
                {managementNumbers.map((f) => (
                  <Field key={f.code} label={<>{f.name} {aiFilled[f.code] !== undefined && <AiBadge />}</>}>
                    <input type="number" min="0" className="mf-input" style={{ width: 120 }}
                      value={values[f.code] || ""} onChange={(e) => setValue(f.code, e.target.value)} />
                  </Field>
                ))}
              </div>
              {managementTexts.map((f) => (
                <Field key={f.code} label={<>{f.name} {aiFilled[f.code] !== undefined && <AiBadge />}</>}>
                  <textarea className="mf-textarea" style={{ minHeight: 56 }} value={values[f.code] || ""}
                    onChange={(e) => setValue(f.code, e.target.value)} />
                </Field>
              ))}

              {definition.follow_up && (
                <div className="mf-info-strip" style={{ marginTop: 16 }}>
                  <ScrollText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {definition.follow_up}
                </div>
              )}
              <button className="mf-ghost-btn" onClick={() => window.print()} style={{ marginTop: 12 }}>
                Print summary
              </button>
            </Card>

            <SectionLabel>{finalStepNum}. Final assessment</SectionLabel>
            <Card>
              {atypicalCheckbox && (
                <CheckField label={atypicalCheckbox.name}
                  hint="Overlaps with neuropathy, cervical radiculopathy, RA, hip OA, piriformis, etc."
                  checked={Boolean(values[atypicalCheckbox.code])} ai={atypicalCheckbox.code in aiFilled}
                  after={<NotAddressedHint field={atypicalCheckbox} />}
                  onChange={(v) => setValue(atypicalCheckbox.code, v)} />
              )}
              {atypicalCheckbox && values[atypicalCheckbox.code] && atypicalText && (
                <Field label={atypicalText.name}>
                  <input type="text" className="mf-input" style={{ maxWidth: 320 }}
                    placeholder="e.g. neurology, rheumatology, spine, hip"
                    value={values[atypicalText.code] || ""} onChange={(e) => setValue(atypicalText.code, e.target.value)} />
                </Field>
              )}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <p className="mf-summary-title" style={{ marginBottom: 8 }}>Triage result</p>
                <TriageResultRows result={result} />
              </div>
            </Card>
          </>
        )}

        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Deterministic decision support only — not a diagnosis. A physician must review every field and finding before proceeding.
        </div>

        <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to validation & rules" />
      </div>

      <TriageResultPanel result={result} />
    </div>
  );
}
