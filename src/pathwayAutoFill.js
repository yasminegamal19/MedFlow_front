/* Heuristic, frontend-only suggestion engine for the Clinical Pathway form
 * (pathwayForms.js / ClinicalPathwayForm) — same idea and same caution as
 * mskAutoFill.js: plain, negation-aware keyword matching over the AI
 * extraction's free-text sections, no model call, nothing authoritative.
 *
 * Deliberately NOT covered here (left for the physician to decide): the
 * eligibility gate, red-flag screening, the anatomical/differential branch,
 * and injection considerations — none of those are "what does the note
 * already say happened", they're clinical judgment calls or a forward plan.
 *
 * Returns a flat map keyed as:
 *   "selectValues::<key>"       -> option string
 *   "radioValue"                -> option string
 *   "symptomsChecked::<symptom>" -> true
 *   "comorbidities"             -> string
 *   "imagingChoice"             -> option label
 *   "managementChecked::<item>" -> true
 */

import { findPositive, textBlob, COMORBIDITY_KEYWORDS, matchedKeywords, bagPositive, pickMentionedOption } from "./textMatch.js";

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

function inferImagingChoice(lower, options) {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const normalizedBlob = normalizeModality(lower);
  for (const kw of IMAGING_MODALITY_KEYWORDS) {
    if (!findPositive(normalizedBlob, [kw])) continue;
    const match = options.find((o) => normalizeModality(o.label).includes(kw));
    if (match) return match.label;
  }
  return undefined;
}

export function inferPathwayFieldsFromSections(form, sections) {
  if (!form || !Array.isArray(sections) || sections.length === 0) return {};
  const blob = textBlob(sections);
  const lower = blob.toLowerCase();
  const out = {};

  for (const s of form.history.selects || []) {
    const hit = pickMentionedOption(lower, s.options);
    if (hit) out[`selectValues::${s.key}`] = hit;
  }

  if (form.history.radio) {
    const hit = pickMentionedOption(lower, form.history.radio.options);
    if (hit) out["radioValue"] = hit;
  }

  for (const symptom of form.history.symptoms || []) {
    if (bagPositive(lower, symptom) || findPositive(lower, [symptom.toLowerCase()])) {
      out[`symptomsChecked::${symptom}`] = true;
    }
  }

  const comorbidities = matchedKeywords(lower, COMORBIDITY_KEYWORDS);
  if (comorbidities.length > 0) out["comorbidities"] = comorbidities.join(", ");

  const imagingChoice = inferImagingChoice(lower, form.imaging?.options);
  if (imagingChoice) out["imagingChoice"] = imagingChoice;

  for (const item of form.management?.items || []) {
    if (bagPositive(lower, item)) out[`managementChecked::${item}`] = true;
  }

  return out;
}
