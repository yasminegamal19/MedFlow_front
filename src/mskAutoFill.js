/* Heuristic, frontend-only suggestion engine: reads the free-text sections
 * already produced by the AI extraction step and guesses values for the MSK
 * Triage form fields (duration, symptoms, exam, investigations, management).
 * No model call — plain keyword matching with a negation check, same
 * "no history of trauma" pitfall this codebase already hit once with
 * red-flag auto-checking. That's why red flags are deliberately NOT covered
 * here — every value returned is a suggestion the physician must confirm or
 * change; nothing is authoritative.
 *
 * Returns a flat map of dot-path -> value, matching the paths PageMskTriage's
 * own `set(path, value)` already uses (e.g. "symptoms.painPattern").
 */

import { findPositive, textBlob, COMORBIDITY_KEYWORDS, matchedKeywords } from "./textMatch.js";

const MEDICATION_KEYWORDS = [
  "paracetamol", "acetaminophen", "naproxen", "ibuprofen", "nsaid",
  "prednisone", "gabapentin", "tramadol", "opioid", "cortisone injection",
  "corticosteroid",
];

export function inferMskFieldsFromSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return {};
  const blob = textBlob(sections);
  const lower = blob.toLowerCase();
  const out = {};

  // Duration — prefer an explicit "for N weeks/months/years" over a bare
  // acute/chronic mention.
  const durationMatch = lower.match(/for\s+(\d+)\s*(day|week|month|year)s?\b/) ||
    lower.match(/(\d+)\s*(day|week|month|year)s?\s*(history|duration)\b/);
  if (durationMatch) {
    const n = Number(durationMatch[1]);
    const unit = durationMatch[2];
    const weeks = unit.startsWith("day") ? n / 7 : unit.startsWith("week") ? n : unit.startsWith("month") ? n * 4.345 : n * 52;
    out["duration"] = weeks < 6 ? "acute" : weeks <= 12 ? "subacute" : "chronic";
  } else if (findPositive(lower, ["chronic"])) out["duration"] = "chronic";
  else if (findPositive(lower, ["subacute"])) out["duration"] = "subacute";
  else if (findPositive(lower, ["acute onset", "sudden onset"])) out["duration"] = "acute";

  // Pain pattern
  if (findPositive(lower, ["constant pain", "unremitting pain", "constant, "])) out["symptoms.painPattern"] = "constant";
  else if (findPositive(lower, ["daily pain", "frequent pain", "worse when", "worse with"])) out["symptoms.painPattern"] = "daily_frequent";
  else if (findPositive(lower, ["intermittent", "occasional pain", "comes and goes"])) out["symptoms.painPattern"] = "intermittent";

  if (findPositive(lower, ["numbness", "tingling", "pins and needles", "paresthesia"])) out["symptoms.numbnessTingling"] = true;
  if (findPositive(lower, ["locking", "catching", "giving way", "clicking"])) out["symptoms.mechanicalSymptoms"] = true;
  if (findPositive(lower, ["wakes at night", "night pain", "disturbed sleep", "difficulty sleeping"])) out["symptoms.sleepDisruption"] = "present";

  if (findPositive(lower, ["unable to work", "cannot work", "unable to walk", "difficulty walking", "affecting work"])) {
    out["symptoms.functionalImpact"] = "major";
  } else if (findPositive(lower, ["climbing stairs", "prolonged standing", "limiting", "difficulty with"])) {
    out["symptoms.functionalImpact"] = "clear";
  }

  // Exam
  if (findPositive(lower, ["unable to bend", "fixed flexion", "locked joint"])) out["exam.rom"] = "major_loss";
  else if (findPositive(lower, ["reduced range of motion", "reduced rom", "limited range of motion", "stiffness"])) out["exam.rom"] = "reduced";
  else if (findPositive(lower, ["full range of movement", "full rom", "normal range of motion"])) out["exam.rom"] = "normal";

  if (findPositive(lower, ["marked weakness", "significant weakness", "severe weakness"])) out["exam.strengthDeficit"] = "severe";
  else if (findPositive(lower, ["mild weakness"])) out["exam.strengthDeficit"] = "mild";
  else if (findPositive(lower, ["strength intact", "full strength"])) out["exam.strengthDeficit"] = "none";
  else if (findPositive(lower, ["weakness"])) out["exam.strengthDeficit"] = "moderate";

  if (findPositive(lower, ["deformity", "atrophy", "wasting"])) out["exam.deformityAtrophy"] = true;

  // Investigations
  if (findPositive(lower, ["x-ray shows", "x-ray reveals", "mri shows", "ultrasound shows", "imaging shows", "radiograph shows"])) {
    out["investigations.imaging"] = "done";
  } else if (findPositive(lower, ["x-ray ordered", "mri ordered", "imaging pending", "awaiting mri", "awaiting x-ray"])) {
    out["investigations.imaging"] = "pending";
  }
  if (findPositive(lower, ["blood test showed", "labs showed", "bloodwork showed", "crp elevated", "esr elevated"])) {
    out["investigations.labs"] = "done";
  } else if (findPositive(lower, ["labs ordered", "blood test ordered", "awaiting labs"])) {
    out["investigations.labs"] = "pending";
  }

  // Management
  if (findPositive(lower, ["no treatment", "treatment naive", "has not tried", "hasn't tried"])) {
    out["management.tried"] = "no";
  } else if (findPositive(lower, [...MEDICATION_KEYWORDS, "physiotherapy", "splint", "injection", "trial of"])) {
    out["management.tried"] = "yes";
  }
  const weeksMatch = lower.match(/(\d+)[\s-]?week/);
  if (out["management.tried"] === "yes" && weeksMatch) out["management.weeks"] = weeksMatch[1];

  if (findPositive(lower, ["significant improvement", "resolved", "much better", "good response"])) out["management.response"] = "good";
  else if (findPositive(lower, ["limited improvement", "partial relief", "some improvement", "partially improved"])) out["management.response"] = "partial";
  else if (findPositive(lower, ["no improvement", "did not help", "no relief", "no benefit"])) out["management.response"] = "none";

  const comorbidities = matchedKeywords(lower, COMORBIDITY_KEYWORDS);
  if (comorbidities.length > 0) out["comorbidities"] = comorbidities.join(", ");

  const medications = matchedKeywords(lower, MEDICATION_KEYWORDS);
  if (medications.length > 0) out["medications"] = medications.join(", ");

  return out;
}
