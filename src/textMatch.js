/* Shared negation-aware keyword matching used by the frontend-only AI
 * auto-fill heuristics (mskAutoFill.js, pathwayAutoFill.js). No model call —
 * plain text search over the AI extraction's {title, content} sections.
 */

const NEGATION_BEFORE = /\b(no|not|denies|denied|without|absence of|negative for)\s+(history of\s+)?$/;
// Extraction sections are often "Label: verdict" pairs — e.g. a "Trauma"
// section whose content is "None reported". The negating word there comes
// AFTER the keyword, not before, so a backward-only check misreads the
// section title as a positive finding. Catch that shape too.
const NEGATION_AFTER = /^\s*[:.\-]?\s*(none|no|denied|denies|negative|not reported|n\/a|nil)\b/;

function isNegated(lower, matchIndex, matchLength) {
  const before = lower.slice(Math.max(0, matchIndex - 24), matchIndex);
  if (NEGATION_BEFORE.test(before)) return true;
  const after = lower.slice(matchIndex + matchLength, matchIndex + matchLength + 20);
  return NEGATION_AFTER.test(after);
}

/** True if any phrase appears in `lower` at least once without being negated. */
export function findPositive(lower, phrases) {
  for (const phrase of phrases) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(phrase, from);
      if (idx === -1) break;
      if (!isNegated(lower, idx, phrase.length)) return true;
      from = idx + phrase.length;
    }
  }
  return false;
}

export function textBlob(sections) {
  return sections.map((s) => `${s.title || ""}. ${s.content || ""}`).join(" ");
}

export const COMORBIDITY_KEYWORDS = [
  "diabetes", "hypertension", "obesity", "high bmi", "smoking", "smoker",
  "osteoporosis", "osteopenia", "rheumatoid arthritis", "prior surgery",
  "immunosuppression", "steroid use", "cancer history",
];

export function matchedKeywords(lower, list) {
  return list.filter((k) => findPositive(lower, [k]));
}

// Words too generic to trust as a single-token match on their own — mostly
// filler verbs/nouns shared by many unrelated checklist items.
const GENERIC_WORDS = new Set([
  "referral", "routine", "review", "consider", "considered", "discussed",
  "provided", "indicated", "assessment", "management", "control", "program",
  "activity", "modification", "education", "condition", "specialist",
  "surgeon", "patient", "symptoms", "clinical", "primary", "advice",
  "options", "before", "after", "based", "using", "given", "reviewed",
  "imaging", "series", "typical", "present", "presentation",
]);

// Option strings too short/generic to safely attribute to a specific
// question by keyword search alone — a stray "no" in the note (e.g. "no
// effusion") isn't an answer to "Diabetes mellitus?". Left for the
// physician to answer directly rather than guessed.
const AMBIGUOUS_OPTIONS = new Set(["yes", "no"]);

/** First option (in order) that appears as a non-negated mention in `lower`,
 * skipping options too generic to trust (see AMBIGUOUS_OPTIONS). */
export function pickMentionedOption(lower, options) {
  return options.find((o) => !AMBIGUOUS_OPTIONS.has(o.trim().toLowerCase()) && findPositive(lower, [o.toLowerCase()]));
}

/** Meaningful words (>=5 letters, not generic) pulled out of a checklist
 * item / option label, ignoring anything in parentheses. */
export function significantWords(phrase) {
  return phrase
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w));
}

/** True if `phrase`'s significant words show up (non-negated) in `lower`.
 * Looser than an exact-phrase match — these checklist items are rarely
 * quoted verbatim in a note — but a single-word-in-common match on a
 * multi-word phrase is too easy to get wrong (e.g. "weight" alone showing up
 * via an unrelated "weight-bearing X-ray" mention), so 2+ significant words
 * require a majority to actually be present; a phrase reduced to exactly one
 * significant word still matches on that word alone. */
export function bagPositive(lower, phrase) {
  const words = significantWords(phrase);
  if (words.length === 0) return false;
  const hits = words.filter((w) => findPositive(lower, [w]));
  const needed = words.length === 1 ? 1 : Math.max(2, Math.ceil(words.length * 0.6));
  return hits.length >= needed;
}
