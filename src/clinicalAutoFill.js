/* Heuristic, frontend-only suggestion engine for the backend-driven Clinical
 * Assessment form. Single inference pass over the AI extraction's free-text
 * sections — no model call, plain negation-aware keyword matching (see
 * textMatch.js). Every value returned is a suggestion the physician must
 * confirm or change; nothing here is authoritative.
 *
 * Dispatches on each field's `ai_mapping.config.strategy` (seeded by
 * database/seeders/PathwayFieldDefinitionSeeder.php — the strategy names here
 * must match the ones documented there) rather than hardcoding which field
 * codes exist per pathway, so this needs no changes when a pathway's fields
 * change on the backend.
 *
 * Deliberately NOT covered here (no ai_mapping is seeded for these, so they
 * never reach this function): the eligibility gate, red-flag screening (this
 * codebase already hit a false positive here once — "no history of trauma" —
 * so red flags are manual only, everywhere), the anatomical/differential
 * branch, and injection considerations — none of those are "what does the
 * note already say happened", they're clinical judgment calls or a forward
 * plan.
 *
 * Returns a flat map keyed by field `code` (e.g. "ONSET", "SYMPTOM_1",
 * "GEN_ROM") -> the suggested value (option `value` for selects, text for
 * text fields, and for checkboxes either `true` — the note supports it — or
 * `false` — the note explicitly denies it, e.g. "denies numbness". A
 * checkbox this heuristic never addressed at all is simply absent from the
 * map, same as before; only an unambiguous denial gets an explicit `false`).
 */

import {
  findPositive, findNegated, textBlob, COMORBIDITY_KEYWORDS, matchedKeywords,
  bagPositive, bagNegated, pickMentionedOption,
} from "./textMatch.js";

const MEDICATION_KEYWORDS = [
  "paracetamol", "acetaminophen", "naproxen", "ibuprofen", "nsaid",
  "prednisone", "gabapentin", "tramadol", "opioid", "cortisone injection",
  "corticosteroid",
];

// Specific imaging modality/qualifier words only — deliberately NOT a bag of
// every word in the option label (a "No imaging" option contains the word
// "imaging" too, which would wrongly self-match once imaging is mentioned
// anywhere; "trauma" is excluded because "Trauma: none reported" is a
// negation shape findPositive already handles, but a bare word match here
// would still be too easy to get wrong for something this consequential).
const IMAGING_MODALITY_KEYWORDS = [
  "weightbearing", "mri", "ultrasound", "radiograph", "xray", "ctscan",
  "lauenstein", "axial", "oblique",
];

// "Weight-bearing" in the note vs "Weightbearing series" as an option label —
// strip everything but letters/digits so hyphenation/spacing differences
// don't hide an otherwise-exact modality match.
function normalizeModality(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// field.options here is [{value, label}], unlike pickMentionedOption's
// string[] shape (built for pathwayForms.js's plain option lists) — resolve
// through the label, then hand back the option's value.
function pickMentionedOptionValue(lower, options) {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const hit = pickMentionedOption(lower, options.map((o) => o.label));
  return options.find((o) => o.label === hit)?.value;
}

function inferImagingChoiceValue(lower, options) {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const normalizedBlob = normalizeModality(lower);
  for (const kw of IMAGING_MODALITY_KEYWORDS) {
    if (!findPositive(normalizedBlob, [kw])) continue;
    const match = options.find((o) => normalizeModality(o.label).includes(kw));
    if (match) return match.value;
  }
  return undefined;
}

export function inferClinicalFieldsFromSections(definition, sections) {
  if (!definition || !Array.isArray(sections) || sections.length === 0) return {};
  const blob = textBlob(sections);
  const lower = blob.toLowerCase();
  const out = {};

  // ── Pathway-specific fields — dispatched by ai_mapping.config.strategy.
  // GEN_* fields are skipped here: they're shared across every pathway and
  // handled by the hand-tuned logic below instead of a generic strategy
  // lookup, since e.g. "duration" needs actual date-range parsing, not a
  // keyword bag on an option label.
  const allFields = definition.sections.flatMap((s) => s.fields);
  for (const field of allFields) {
    if (field.code.startsWith("GEN_")) continue;
    const strategy = field.ai_mapping?.config?.strategy;
    if (!strategy) continue;

    if (strategy === "option_match") {
      const hit = pickMentionedOptionValue(lower, field.options);
      if (hit !== undefined) out[field.code] = hit;
    } else if (strategy === "keyword_bag") {
      // keyword_bag is only ever seeded on checkbox fields (see
      // PathwayFieldDefinitionSeeder), so an explicit denial ("denies
      // locking") is a real false suggestion, not just silence — surfaced
      // the same way as a positive hit, just unchecked.
      if (bagPositive(lower, field.name) || findPositive(lower, [field.name.toLowerCase()])) {
        out[field.code] = true;
      } else if (bagNegated(lower, field.name) || findNegated(lower, [field.name.toLowerCase()])) {
        out[field.code] = false;
      }
    } else if (strategy === "comorbidity_keywords") {
      const hits = matchedKeywords(lower, COMORBIDITY_KEYWORDS);
      if (hits.length > 0) out[field.code] = hits.join(", ");
    } else if (strategy === "imaging_modality_match") {
      const hit = inferImagingChoiceValue(lower, field.options);
      if (hit) out[field.code] = hit;
    }
  }

  // ── Shared triage-relevant fields (GEN_* field codes) ────────────────
  // Duration — prefer an explicit "for N weeks/months/years" over a bare
  // acute/chronic mention.
  const durationMatch = lower.match(/for\s+(\d+)\s*(day|week|month|year)s?\b/) ||
    lower.match(/(\d+)\s*(day|week|month|year)s?\s*(history|duration)\b/);
  if (durationMatch) {
    const n = Number(durationMatch[1]);
    const unit = durationMatch[2];
    const weeks = unit.startsWith("day") ? n / 7 : unit.startsWith("week") ? n : unit.startsWith("month") ? n * 4.345 : n * 52;
    out["GEN_DURATION"] = weeks < 6 ? "acute" : weeks <= 12 ? "subacute" : "chronic";
  } else if (findPositive(lower, ["chronic"])) out["GEN_DURATION"] = "chronic";
  else if (findPositive(lower, ["subacute"])) out["GEN_DURATION"] = "subacute";
  else if (findPositive(lower, ["acute onset", "sudden onset"])) out["GEN_DURATION"] = "acute";

  if (findPositive(lower, ["constant pain", "unremitting pain", "constant, "])) out["GEN_PAIN_PATTERN"] = "constant";
  else if (findPositive(lower, ["daily pain", "frequent pain", "worse when", "worse with"])) out["GEN_PAIN_PATTERN"] = "daily_frequent";
  else if (findPositive(lower, ["intermittent", "occasional pain", "comes and goes"])) out["GEN_PAIN_PATTERN"] = "intermittent";

  const NUMBNESS_PHRASES = ["numbness", "tingling", "pins and needles", "paresthesia"];
  if (findPositive(lower, NUMBNESS_PHRASES)) out["GEN_NUMBNESS_TINGLING"] = true;
  else if (findNegated(lower, NUMBNESS_PHRASES)) out["GEN_NUMBNESS_TINGLING"] = false;

  const MECHANICAL_PHRASES = ["locking", "catching", "giving way", "clicking"];
  if (findPositive(lower, MECHANICAL_PHRASES)) out["GEN_MECHANICAL_SYMPTOMS"] = true;
  else if (findNegated(lower, MECHANICAL_PHRASES)) out["GEN_MECHANICAL_SYMPTOMS"] = false;

  if (findPositive(lower, ["wakes at night", "night pain", "disturbed sleep", "difficulty sleeping"])) out["GEN_SLEEP_DISRUPTION"] = "present";

  if (findPositive(lower, ["unable to work", "cannot work", "unable to walk", "difficulty walking", "affecting work"])) {
    out["GEN_FUNCTIONAL_IMPACT"] = "major";
  } else if (findPositive(lower, ["climbing stairs", "prolonged standing", "limiting", "difficulty with"])) {
    out["GEN_FUNCTIONAL_IMPACT"] = "clear";
  }

  if (findPositive(lower, ["unable to bend", "fixed flexion", "locked joint"])) out["GEN_ROM"] = "major_loss";
  else if (findPositive(lower, ["reduced range of motion", "reduced rom", "limited range of motion", "stiffness"])) out["GEN_ROM"] = "reduced";
  else if (findPositive(lower, ["full range of movement", "full rom", "normal range of motion"])) out["GEN_ROM"] = "normal";

  if (findPositive(lower, ["marked weakness", "significant weakness", "severe weakness"])) out["GEN_STRENGTH_DEFICIT"] = "severe";
  else if (findPositive(lower, ["mild weakness"])) out["GEN_STRENGTH_DEFICIT"] = "mild";
  else if (findPositive(lower, ["strength intact", "full strength"])) out["GEN_STRENGTH_DEFICIT"] = "none";
  else if (findPositive(lower, ["weakness"])) out["GEN_STRENGTH_DEFICIT"] = "moderate";

  const DEFORMITY_PHRASES = ["deformity", "atrophy", "wasting"];
  if (findPositive(lower, DEFORMITY_PHRASES)) out["GEN_DEFORMITY_ATROPHY"] = true;
  else if (findNegated(lower, DEFORMITY_PHRASES)) out["GEN_DEFORMITY_ATROPHY"] = false;

  if (findPositive(lower, ["blood test showed", "labs showed", "bloodwork showed", "crp elevated", "esr elevated"])) {
    out["GEN_LABS_STATUS"] = "done";
  } else if (findPositive(lower, ["labs ordered", "blood test ordered", "awaiting labs"])) {
    out["GEN_LABS_STATUS"] = "pending";
  }

  if (findPositive(lower, ["no treatment", "treatment naive", "has not tried", "hasn't tried"])) {
    out["GEN_MANAGEMENT_TRIED"] = "no";
  } else if (findPositive(lower, [...MEDICATION_KEYWORDS, "physiotherapy", "splint", "injection", "trial of"])) {
    out["GEN_MANAGEMENT_TRIED"] = "yes";
  }
  const weeksMatch = lower.match(/(\d+)[\s-]?week/);
  if (out["GEN_MANAGEMENT_TRIED"] === "yes" && weeksMatch) out["GEN_MANAGEMENT_WEEKS"] = weeksMatch[1];

  if (findPositive(lower, ["significant improvement", "resolved", "much better", "good response"])) out["GEN_MANAGEMENT_RESPONSE"] = "good";
  else if (findPositive(lower, ["limited improvement", "partial relief", "some improvement", "partially improved"])) out["GEN_MANAGEMENT_RESPONSE"] = "partial";
  else if (findPositive(lower, ["no improvement", "did not help", "no relief", "no benefit"])) out["GEN_MANAGEMENT_RESPONSE"] = "none";

  // COMORBIDITIES itself is handled by the per-field loop above (strategy
  // "comorbidity_keywords") since it's a pathway-specific (non-GEN_) field.

  const medications = matchedKeywords(lower, MEDICATION_KEYWORDS);
  if (medications.length > 0) out["GEN_MEDICATIONS"] = medications.join(", ");

  return out;
}
