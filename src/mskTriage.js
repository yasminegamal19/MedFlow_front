/* ────────────────────────────────────────────────────────────────────────
   MSK Triage Logic Specification — deterministic, static (no model, no
   backend). Implements the flowchart: condition group → red-flag check →
   severity classification → urgency → referral appropriateness → missing
   info → next steps, for CTS, Knee OA, Shoulder MSK, and Lumbar
   Radiculopathy.
──────────────────────────────────────────────────────────────────────── */

export const CONDITION_GROUPS = [
  { id: "cts", label: "Carpal Tunnel Syndrome" },
  { id: "knee", label: "Knee OA / Knee MSK" },
  { id: "shoulder", label: "Shoulder MSK" },
  { id: "lumbar", label: "Lumbar Radiculopathy / Spine MSK" },
  { id: "hip_oa", label: "Hip Osteoarthritis" },
  { id: "msk_oncology", label: "MSK Oncology" },
  { id: "hand_wrist_oa", label: "Hand & Wrist Osteoarthritis" },
  { id: "hand_wrist_mass", label: "Hand & Wrist Soft Tissue Mass" },
  { id: "trigger_finger", label: "Trigger Finger" },
  { id: "dupuytrens", label: "Dupuytren's Contracture" },
  { id: "acute_hand_injury", label: "Acute Hand / Wrist Injury" },
  { id: "skin_lesion", label: "Suspected Skin / Soft Tissue Lesion" },
];

// Weeks of conservative management expected before referral is "Appropriate"
// on symptoms alone (CTS spec explicitly calls out 8–12 weeks; others just
// say "conservative management tried" — 6 weeks is the shared default floor;
// 0 for the urgency-first/no-conservative-trial pathways such as oncology,
// acute injury, and suspected malignant skin lesion).
const CONSERVATIVE_TRIAL_WEEKS = {
  cts: 8,
  knee: 6,
  shoulder: 6,
  lumbar: 6,
  hip_oa: 6,
  msk_oncology: 0,
  hand_wrist_oa: 6,
  hand_wrist_mass: 6,
  trigger_finger: 6,
  dupuytrens: 6,
  acute_hand_injury: 0,
  skin_lesion: 0,
};

export function emptyMskInput(conditionGroup = "cts") {
  return {
    conditionGroup,
    duration: "", // acute | subacute | chronic
    symptoms: {
      painPattern: "", // intermittent | daily_frequent | constant
      numbnessTingling: false,
      mechanicalSymptoms: false,
      sleepDisruption: "", // none | occasional | present | major
      functionalImpact: "", // minimal | clear | major
    },
    redFlags: {
      infection: false,
      trauma: false,
      neuroDeficit: false,
      systemic: false,
    },
    exam: {
      rom: "", // normal | reduced | major_loss
      strengthDeficit: "", // none | mild | moderate | severe
      deformityAtrophy: false,
      // condition-specific overlay flags
      thenarAtrophy: false,
      thumbWeakness: false,
      frozenShoulder: false,
      motorDeficit: false,
    },
    investigations: { imaging: "", labs: "" }, // "" | done | pending | not_done
    management: { tried: "", weeks: "", response: "" }, // tried: "" | yes | no
    comorbidities: "",
    medications: "",
    atypical: { present: false, suggestion: "" },
  };
}

const RED_FLAG_LABELS = {
  infection: "infection (fever, warmth, redness, severe pain)",
  trauma: "trauma with suspected fracture/dislocation",
  neuroDeficit: "major neurological deficit (foot drop, saddle anesthesia, cauda equina, sudden weakness)",
  systemic: "systemic disease signs (RA, malignancy suspicion, unexplained weight loss)",
};

function classifySeverityShared(symptoms, exam) {
  const severe =
    symptoms.painPattern === "constant" ||
    symptoms.functionalImpact === "major" ||
    exam.strengthDeficit === "severe" ||
    exam.deformityAtrophy ||
    exam.rom === "major_loss" ||
    symptoms.sleepDisruption === "major";
  if (severe) return "Severe";

  const moderate =
    symptoms.painPattern === "daily_frequent" ||
    symptoms.functionalImpact === "clear" ||
    exam.strengthDeficit === "mild" ||
    exam.strengthDeficit === "moderate" ||
    exam.rom === "reduced" ||
    symptoms.sleepDisruption === "present";
  if (moderate) return "Moderate";

  return "Mild";
}

/** Condition-specific overlays can only upgrade severity to Severe. */
function applyConditionOverlay(conditionGroup, exam, severity) {
  if (conditionGroup === "cts" && exam.thenarAtrophy && exam.thumbWeakness) return "Severe";
  if (conditionGroup === "knee" && exam.deformityAtrophy && exam.rom === "major_loss") return "Severe";
  if (conditionGroup === "shoulder" && (exam.strengthDeficit === "severe" || exam.frozenShoulder)) return "Severe";
  if (conditionGroup === "lumbar" && exam.motorDeficit) return "Severe";
  return severity;
}

function computeMissingInfo(input) {
  const missing = [];
  if (!input.duration) missing.push("Symptom duration");
  if (!input.symptoms.functionalImpact) missing.push("Functional impact");
  if (!input.exam.rom && !input.exam.strengthDeficit) missing.push("Physical exam (ROM / strength)");
  if (!input.investigations.imaging && !input.investigations.labs) missing.push("Imaging / labs");
  if (!input.management.tried) missing.push("Management attempted");
  if (!input.comorbidities.trim()) missing.push("Comorbidities");
  if (!input.medications.trim()) missing.push("Medications");
  return missing;
}

// null means imaging/labs are not routinely needed for this pathway — the
// "consider ordering ___" next step is skipped entirely (see runMskTriage).
function investigationSuggestion(conditionGroup) {
  return {
    cts: "nerve conduction studies (if available)",
    knee: "weight-bearing X-ray of the knee",
    shoulder: "shoulder X-ray / ultrasound",
    lumbar: "lumbar spine X-ray or MRI",
    hip_oa: "weight-bearing pelvis / hip X-ray",
    msk_oncology: "urgent MRI and plain radiographs of the affected region",
    hand_wrist_oa: "hand / wrist X-ray",
    hand_wrist_mass: "ultrasound to differentiate cystic vs solid",
    trigger_finger: null,
    dupuytrens: null,
    acute_hand_injury: "X-ray of the injured region",
    skin_lesion: "biopsy or dermoscopic assessment",
  }[conditionGroup];
}

/**
 * Run the MSK triage logic tree over a filled-in {@link emptyMskInput} shape.
 * Pure and deterministic — no model call, no network request.
 *
 * @returns {{conditionGroup: string, severity: string, urgency: string,
 *   referralAppropriateness: string, missingInfo: string[], nextSteps: string[]}}
 */
export function runMskTriage(input) {
  const { conditionGroup, redFlags, symptoms, exam, management, investigations, atypical } = input;
  const missingInfo = computeMissingInfo(input);

  // Step 3 — red flags short-circuit everything.
  const activeRedFlags = Object.entries(redFlags).filter(([, on]) => on).map(([k]) => RED_FLAG_LABELS[k]);
  if (activeRedFlags.length > 0) {
    return {
      conditionGroup,
      severity: "Red Flag",
      urgency: "Urgent",
      referralAppropriateness: "Urgent referral required",
      missingInfo,
      nextSteps: [`Urgent ED / same-day specialist referral — red flag(s): ${activeRedFlags.join("; ")}.`],
    };
  }

  // Step 8 — atypical pattern (no red flags, but doesn't fit the primary MSK diagnosis).
  if (atypical.present) {
    const severity = applyConditionOverlay(conditionGroup, exam, classifySeverityShared(symptoms, exam));
    return {
      conditionGroup,
      severity,
      urgency: "Routine",
      referralAppropriateness: "Consider alternative diagnosis",
      missingInfo,
      nextSteps: [`Consider ${atypical.suggestion || "neurology / rheumatology / spine / hip"} assessment.`],
    };
  }

  // Step 4 — severity (shared rules + condition-specific overlay).
  const severity = applyConditionOverlay(conditionGroup, exam, classifySeverityShared(symptoms, exam));

  // Step 5 — urgency.
  const urgency = severity === "Severe" ? "Priority" : "Routine";

  // Step 6 — conservative management trial.
  const trialWeeksNeeded = CONSERVATIVE_TRIAL_WEEKS[conditionGroup];
  const weeksTried = Number(management.weeks) || 0;
  const conservativeManagementTried = management.tried === "yes" && weeksTried >= trialWeeksNeeded;

  // Step 6/7 — referral appropriateness.
  let referralAppropriateness;
  if (severity === "Mild" && !conservativeManagementTried) {
    referralAppropriateness = "Not appropriate yet";
  } else {
    referralAppropriateness = "Appropriate";
  }

  // Step 9 — next steps.
  const nextSteps = [];
  if (referralAppropriateness === "Not appropriate yet") {
    nextSteps.push(
      `Trial conservative management (physio, NSAIDs, activity modification${conditionGroup === "cts" ? ", splinting" : ""}) for at least ${trialWeeksNeeded} weeks before referral.`,
    );
  }
  const investigationsDone = investigations.imaging === "done" || investigations.labs === "done";
  const investigationsOrdered = investigations.imaging === "pending" || investigations.labs === "pending";
  const suggestion = investigationSuggestion(conditionGroup);
  if (referralAppropriateness === "Appropriate" && !investigationsDone && !investigationsOrdered && suggestion) {
    nextSteps.push(`Consider ordering ${suggestion} before referral.`);
  }
  if (severity === "Severe") {
    nextSteps.push("Expedite specialist assessment given severity.");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Proceed with referral as documented.");
  }

  return { conditionGroup, severity, urgency, referralAppropriateness, missingInfo, nextSteps };
}
