#!/usr/bin/env node
/* Regression check for mskTriage.js's runMskTriage() against the product
 * spec's 72 worked scenarios (24 each for Knee OA, MSK Shoulder, and Lumbar
 * Radiculopathy — see the "LEGEND" + per-condition scenario tables pasted
 * into the project chat). Each scenario asserts only the two outputs the
 * spec pins down precisely and unambiguously per scenario: urgency and
 * referral appropriateness (severity buckets and the exact wording of
 * missing-info flags are spec prose, not a literal field-by-field script,
 * so they aren't asserted here — see the file header notes below each
 * scenario group for how the free-text scenario names were translated into
 * concrete mskInput fixtures).
 *
 * Run with: node scripts/verify-msk-triage-scenarios.mjs
 */

import { emptyMskInput, runMskTriage } from "../src/mskTriage.js";

// ── Shared fixture builders — the spec's 24-scenario shape is identical
// across all three condition groups (1-6 mild, 7-12 moderate, 13-18 severe,
// 19-21 red flag, 22 true atypical, 23-24 "atypical"-named but still on the
// normal appropriate-referral path), so one set of builders covers all of
// them; only the red-flag key (19-21) and the atypical suggestion (22)
// genuinely vary per condition group. ──

function mild(conditionGroup) {
  const input = emptyMskInput(conditionGroup);
  input.duration = "chronic";
  input.symptoms.painPattern = "intermittent";
  input.symptoms.functionalImpact = "minimal";
  input.exam.rom = "normal";
  input.exam.strengthDeficit = "none";
  input.management.tried = "no";
  return input;
}

function moderate(conditionGroup) {
  const input = emptyMskInput(conditionGroup);
  input.duration = "chronic";
  input.symptoms.painPattern = "daily_frequent";
  input.symptoms.functionalImpact = "clear";
  input.management.tried = "yes";
  input.management.weeks = "12";
  return input;
}

function severe(conditionGroup) {
  const input = emptyMskInput(conditionGroup);
  input.duration = "chronic";
  input.symptoms.painPattern = "constant";
  input.management.tried = "yes";
  input.management.weeks = "12";
  return input;
}

function redFlag(conditionGroup, flagKey) {
  const input = emptyMskInput(conditionGroup);
  input.redFlags[flagKey] = true;
  return input;
}

function atypical(conditionGroup, suggestion) {
  const input = mild(conditionGroup);
  input.atypical.present = true;
  input.atypical.suggestion = suggestion;
  return input;
}

const ROUTINE = "Routine", PRIORITY = "Priority", URGENT = "Urgent";
const APPROPRIATE = "Appropriate";
const NOT_APPROPRIATE_YET = "Not appropriate yet";
const URGENT_REFERRAL = "Urgent referral required";
const CONSIDER_ALTERNATIVE = "Consider alternative diagnosis";

// One entry per numbered scenario in the spec. `build` returns the mskInput
// fixture; `urgency`/`referral` are the two asserted outputs.
function buildGroupScenarios(group, names, redFlagKeys, atypicalSuggestion) {
  const scenarios = [];
  // 1-6: Mild — Not appropriate yet
  for (let i = 0; i < 6; i++) {
    scenarios.push({ name: names[i], group, urgency: ROUTINE, referral: NOT_APPROPRIATE_YET, build: () => mild(group) });
  }
  // 7-12: Moderate — Appropriate
  for (let i = 6; i < 12; i++) {
    scenarios.push({ name: names[i], group, urgency: ROUTINE, referral: APPROPRIATE, build: () => moderate(group) });
  }
  // 13-18: Severe — Priority / Appropriate
  for (let i = 12; i < 18; i++) {
    scenarios.push({ name: names[i], group, urgency: PRIORITY, referral: APPROPRIATE, build: () => severe(group) });
  }
  // 19-21: Red flags — Urgent / Urgent referral required
  for (let i = 18; i < 21; i++) {
    scenarios.push({ name: names[i], group, urgency: URGENT, referral: URGENT_REFERRAL, build: () => redFlag(group, redFlagKeys[i - 18]) });
  }
  // 22: True atypical — Routine / Consider alternative diagnosis
  scenarios.push({ name: names[21], group, urgency: ROUTINE, referral: CONSIDER_ALTERNATIVE, build: () => atypical(group, atypicalSuggestion) });
  // 23-24: Named "atypical" in the spec but still on the normal path
  // (overlapping differential, not an out-of-pattern presentation) —
  // Routine / Appropriate, same as a moderate presentation.
  for (let i = 22; i < 24; i++) {
    scenarios.push({ name: names[i], group, urgency: ROUTINE, referral: APPROPRIATE, build: () => moderate(group) });
  }
  return scenarios;
}

const KNEE_NAMES = [
  "Mild OA – Intermittent Pain", "Mild OA – Activity Related", "Mild OA – Early Degenerative Changes",
  "Mild OA – Minimal Functional Impact", "Mild OA – Post-Activity Pain", "Mild OA – Stiffness Only",
  "Moderate OA – Daily Pain", "Moderate OA – Functional Limitation", "Moderate OA – Sleep Disruption",
  "Moderate OA – Mechanical Symptoms", "Moderate OA – Reduced ROM", "Moderate OA – Worsening Pattern",
  "Severe OA – Constant Pain", "Severe OA – Night Pain", "Severe OA – Mechanical Locking",
  "Severe OA – Instability", "Severe OA – Advanced Degeneration", "Severe OA – Bilateral",
  "Red Flag – Suspected Infection", "Red Flag – Trauma", "Red Flag – Rapid Decline",
  "Atypical – Rheumatoid Pattern", "Atypical – Meniscal Overlap", "Atypical – Patellofemoral OA",
];
const SHOULDER_NAMES = [
  "Mild Rotator Cuff Tendinopathy", "Mild Impingement", "Mild Biceps Tendinopathy",
  "Mild OA", "Mild AC Joint Pain", "Mild Frozen Shoulder – Early",
  "Moderate Rotator Cuff Tear", "Moderate Impingement", "Moderate OA",
  "Moderate Frozen Shoulder", "Moderate Biceps Tendinopathy", "Moderate Instability",
  "Severe Rotator Cuff Tear", "Severe OA", "Severe Frozen Shoulder",
  "Severe Impingement", "Severe Instability", "Severe Biceps Rupture",
  "Red Flag – Infection", "Red Flag – Fracture", "Red Flag – Neurological Deficit",
  "Atypical – Cervical Radiculopathy", "Atypical – Labral Tear", "Atypical – Adhesive Capsulitis Secondary to Diabetes",
];
const LUMBAR_NAMES = [
  "Mild Radiculopathy – Intermittent", "Mild – Activity Related", "Mild – Early Presentation",
  "Mild – Posture Related", "Mild – Minimal Impact", "Mild – Mild Sensory Loss",
  "Moderate Radiculopathy – Daily Symptoms", "Moderate – Functional Limitation", "Moderate – Sleep Disruption",
  "Moderate – Sensory Loss", "Moderate – Worsening Pattern", "Moderate – Mechanical Back Pain + Radiculopathy",
  "Severe Radiculopathy – Motor Deficit", "Severe – Constant Pain", "Severe – Severe Sensory Loss",
  "Severe – Severe Functional Impairment", "Severe – Bilateral Symptoms", "Severe – Progressive Weakness",
  "Red Flag – Cauda Equina", "Red Flag – Infection", "Red Flag – Trauma",
  "Atypical – Diabetic Neuropathy Overlap", "Atypical – Hip OA Mimic", "Atypical – Piriformis Syndrome",
];

const SCENARIOS = [
  ...buildGroupScenarios("knee", KNEE_NAMES, ["infection", "trauma", "systemic"], "rheumatology"),
  ...buildGroupScenarios("shoulder", SHOULDER_NAMES, ["infection", "trauma", "neuroDeficit"], "neurology / cervical spine"),
  ...buildGroupScenarios("lumbar", LUMBAR_NAMES, ["neuroDeficit", "infection", "trauma"], "neurology"),
];

let failed = 0;
for (const s of SCENARIOS) {
  const result = runMskTriage(s.build());
  const ok = result.urgency === s.urgency && result.referralAppropriateness === s.referral;
  if (!ok) {
    failed++;
    console.error(
      `FAIL [${s.group}] ${s.name}\n` +
      `  expected: urgency=${s.urgency} referral=${s.referral}\n` +
      `  actual:   urgency=${result.urgency} referral=${result.referralAppropriateness}`
    );
  }
}

console.log(`\n${SCENARIOS.length - failed}/${SCENARIOS.length} scenarios match the spec.`);
if (failed > 0) {
  console.error(`${failed} scenario(s) drifted from the spec — see failures above.`);
  process.exit(1);
}
