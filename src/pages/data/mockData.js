/* ────────────────────────────────────────────────────────────────────────
   Static demo data for the MedFlow referral workflow.

   Every object below is shaped exactly like the real backend / AI‑service
   contract (see MedFlow_AI_Backend/docs/AI_INTEGRATION.md and the ai‑service
   OpenAPI), but nothing here calls a server — the UI is a click‑through of the
   product‑vision workflow with one coherent orthopaedic (knee) case.

   Flow it mirrors (from the Product Vision, "Product Workflow Lifecycle"):
     1 Case creation        4 Draft generation
     2 AI ingestion + extract   5 Physician review & authorisation
     3 Clinical validation + rules   6 Communication   7 Tracking / feedback
──────────────────────────────────────────────────────────────────────── */

export const ORG = "Riverside Orthopaedic Group";
export const CASE_ID = "MED-2026-4821";
export const PATHWAY = "knee";

export const GUIDING_PRINCIPLE =
  "AI assists — it never replaces clinical judgment. Every value is traceable to the note, every downstream decision is deterministic, and a physician reviews and approves everything before it is sent.";

export const PATIENT_DEFAULTS = {
  firstName: "Marion",
  lastName: "Alvarez",
  dob: "1974-02-14",
  sex: "female",
  mrn: "ROG-558214",
  phone: "(415) 555-0182",
  email: "m.alvarez@example.com",
  address: "418 Cedar Lane, Oakdale, CA 95361",
  payer: "Meridian Health PPO",
  memberId: "MHP-4821006",
  pcp: "Dr. Samuel Ortiz — Oakdale Family Medicine",
};

export const SAMPLE_NOTE = `55-year-old female with right knee pain for 6 months, worse when climbing
stairs and after prolonged standing. No history of trauma. Weight-bearing
X-ray of the right knee shows moderate medial compartment joint space
narrowing and osteophytes. Has tried paracetamol and a 6-week course of
naproxen with only limited improvement. Completed physiotherapy 3 months
ago. No fevers, no locking, no giving way. Exam: no effusion, medial joint
line tenderness, full range of movement, ligaments stable. Plan: refer to
orthopaedics for the chronic right knee pain.`;

/* ── Stage 2: AI extraction ──────────────────────────────────────────────
   Shape = backend `AiRequestResource` for a completed request. `result` is
   the ai-service extraction payload: dynamic `sections`, each with the
   verbatim `source_phrase` and a service-computed `verbatim` flag.        */

export const AI_REQUEST = {
  id: "01JAV8P2QK4Q6R2M3W7X9YB0CD",
  type: "extraction",
  status: "completed",
  case_id: CASE_ID,
  model_id: "google/medgemma-1.5-4b-it",
  prompt_version: "2026-09-10.1",
  token_count: 214,
  duration_ms: 41000,
  created_at: "2026-09-10T15:20:00+00:00",
  completed_at: "2026-09-10T15:20:41+00:00",
  result: {
    sections: [
      { title: "Patient Information", content: "55-year-old female",
        source_phrase: "55-year-old female", verbatim: true },
      { title: "Presenting Complaint", content: "Right knee pain for 6 months",
        source_phrase: "right knee pain for 6 months", verbatim: true },
      { title: "Aggravating Factors", content: "Climbing stairs, prolonged standing",
        source_phrase: "worse when climbing stairs and after prolonged standing", verbatim: true },
      { title: "Trauma", content: "None reported",
        source_phrase: "No history of trauma", verbatim: true },
      { title: "Imaging", content: "Weight-bearing X-ray: moderate medial joint space narrowing and osteophytes",
        source_phrase: "Weight-bearing\nX-ray of the right knee shows moderate medial compartment joint space\nnarrowing and osteophytes", verbatim: true },
      { title: "Previous Treatment", content: "Paracetamol; 6-week course of naproxen with limited improvement; physiotherapy completed 3 months ago",
        source_phrase: "tried paracetamol and a 6-week course of\nnaproxen with only limited improvement", verbatim: true },
      { title: "Examination", content: "No effusion, medial joint line tenderness, full range of movement, ligaments stable",
        source_phrase: "no effusion, medial joint\nline tenderness, full range of movement, ligaments stable", verbatim: true },
      { title: "Red-flag Review", content: "No fevers, no locking, no giving way",
        source_phrase: "No fevers, no locking, no giving\nway", verbatim: true },
    ],
  },
};

/* ── Grounded facts (the alternative ai-service extraction mode) ───────── */

export const GROUNDED = {
  model_id: "google/medgemma-1.5-4b-it",
  prompt_version: "2026-09-10.1",
  items: [
    { label: "Patient", value: "55-year-old female", source_phrase: "55-year-old female", verbatim: true },
    { label: "Symptom", value: "right knee pain", source_phrase: "right knee pain", verbatim: true },
    { label: "Duration", value: "6 months", source_phrase: "for 6 months", verbatim: true },
    { label: "Aggravating factor", value: "climbing stairs", source_phrase: "worse when climbing stairs", verbatim: true },
    { label: "Medical history", value: "no trauma", source_phrase: "No history of trauma", verbatim: true },
    { label: "Imaging", value: "moderate medial OA on weight-bearing X-ray", source_phrase: "Weight-bearing", verbatim: true },
    { label: "Previous treatment", value: "paracetamol, naproxen, physiotherapy", source_phrase: "tried paracetamol and a 6-week course of", verbatim: true },
    { label: "Examination", value: "medial joint line tenderness, no effusion", source_phrase: "medial joint\nline tenderness", verbatim: true },
  ],
  not_stated: ["Weight / BMI", "Occupational impact detail", "Other affected joints"],
};

/* The physician can edit the extraction before it moves on. The demo shows one
   correction being made (splitting Previous Treatment into cleaner facts is
   left as an exercise — here we just tweak wording). */
export const SECTIONS_AFTER_EDIT = AI_REQUEST.result.sections.map((s) =>
  s.title === "Aggravating Factors"
    ? { ...s, content: "Climbing stairs; prolonged standing at work" }
    : s
);

/* ── Stage 3: Clinical Rules Engine — pathway gap analysis ───────────────
   Shape = backend `PathwaySignalModel` (app/services/pathways/knee.yaml).   */

export const PATHWAY_SIGNAL = {
  pathway: "knee",
  title: "Knee — orthopaedic referral",
  matched: true,
  urgency: "routine", // urgent (red-flag term) | review (required criterion missing) | routine
  complete: true,
  criteria: [
    { id: "imaging", label: "Weight-bearing X-ray of the affected knee", required: true, met: true, evidence: "weight-bearing" },
    { id: "conservative_therapy", label: "Trial of conservative therapy (analgesia / NSAIDs / physiotherapy)", required: true, met: true, evidence: "naproxen" },
    { id: "duration", label: "Symptom duration documented", required: true, met: true, evidence: "months" },
    { id: "functional_impact", label: "Functional limitation documented", required: false, met: true, evidence: "stairs" },
  ],
  missing: [],
  red_flags: [],
};

/* A second, deliberately incomplete example the demo can toggle to, to show the
   "flag the gap before referral" behaviour. */
export const PATHWAY_SIGNAL_GAP = {
  ...PATHWAY_SIGNAL,
  urgency: "review",
  complete: false,
  criteria: PATHWAY_SIGNAL.criteria.map((c) =>
    c.id === "conservative_therapy" ? { ...c, met: false, evidence: null } : c
  ),
  missing: ["Trial of conservative therapy (analgesia / NSAIDs / physiotherapy)"],
};

/* Generic, non-diagnostic signals (always returned, alongside the pathway). */
export const RULE_SIGNALS = [
  { rule: "imaging_documented", outcome: true, detail: "imaging or investigation result documented: x-ray" },
  { rule: "prior_treatment_documented", outcome: true, detail: "previous treatment documented: naproxen, physiotherapy" },
  { rule: "conservative_management_failed", outcome: true, detail: "conservative management reported as insufficient: limited improvement" },
  { rule: "red_flag_terms_present", outcome: false, detail: "no evidence of clinician-review red-flag term present" },
];

/* ── Stage 4: deterministic referral draft ──────────────────────────────
   Shape = the ai-service `ReferralDocumentGenerator` output (plain text,
   Jinja2 template — no free-form AI writing).                              */

export const REFERRAL_DRAFT = `REFERRAL DRAFT — FOR PHYSICIAN REVIEW AND APPROVAL
Generated: 2026-09-10T15:21:00+00:00
Requested pathway: knee
Referring clinician: Dr. Samuel Ortiz

STRUCTURED CLINICAL SUMMARY
- Patient Information: 55-year-old female [source: "55-year-old female"]
- Presenting Complaint: Right knee pain for 6 months [source: "right knee pain for 6 months"]
- Aggravating Factors: Climbing stairs, prolonged standing [source: "worse when climbing stairs and after prolonged standing"]
- Trauma: None reported [source: "No history of trauma"]
- Imaging: Weight-bearing X-ray: moderate medial joint space narrowing and osteophytes [source: "Weight-bearing X-ray of the right knee shows moderate medial compartment joint space narrowing and osteophytes"]
- Previous Treatment: Paracetamol; 6-week course of naproxen with limited improvement; physiotherapy completed 3 months ago [source: "tried paracetamol and a 6-week course of naproxen with only limited improvement"]
- Examination: No effusion, medial joint line tenderness, full range of movement, ligaments stable [source: "no effusion, medial joint line tenderness, full range of movement, ligaments stable"]

PATHWAY CHECK — Knee — orthopaedic referral (ROUTINE)
[x] Weight-bearing X-ray of the affected knee — "weight-bearing"
[x] Trial of conservative therapy (analgesia / NSAIDs / physiotherapy) — "naproxen"
[x] Symptom duration documented — "months"
[x] Functional limitation documented (optional) — "stairs"
- all required criteria documented; no red-flag terms found

AUTOMATED SIGNALS (deterministic, non-diagnostic)
- imaging_documented: yes — imaging or investigation result documented: x-ray
- prior_treatment_documented: yes — previous treatment documented: naproxen, physiotherapy
- conservative_management_failed: yes — conservative management reported as insufficient: limited improvement
- red_flag_terms_present: no — no evidence of clinician-review red-flag term present

This draft was assembled from the approved extraction only. It contains no
information beyond what was extracted from the clinical note and reviewed. The
pathway check and signals are deterministic prompts for review, not clinical
decisions. A physician must review, edit, and approve this draft before use.`;

/* ── Stage 5: physician feedback record ─────────────────────────────────
   Shape = ai-service `POST /v1/feedback`. The raw note is never stored,
   only a hash — this is the seed of the continuous-learning dataset.       */

export const FEEDBACK_RECORD = {
  decision: "edited", // approved | rejected | edited
  model_id: "google/medgemma-1.5-4b-it",
  prompt_version: "2026-09-10.1",
  note_hash: "8e565c8388610d1f6e68304c46a8ff4c31e77d9eea4cc6a1ae964de02b3f09c0",
  comment: "Tightened the 'aggravating factors' wording; added the occupational detail.",
  reviewer: "dr.ortiz",
};

/* ── Stage 6: routing & specialists ─────────────────────────────────────── */

export const SPECIALISTS = [
  { id: "s1", name: "Dr. Elena Marsh", practice: "Northside Orthopaedic Institute", match: "Knee & sports medicine", accepts: "Meridian Health PPO" },
  { id: "s2", name: "Dr. Priya Nandan", practice: "Harborview Joint Center", match: "Adult reconstruction, knee", accepts: "Meridian Health PPO" },
  { id: "s3", name: "Dr. Raymond Cho", practice: "Bayview Sports Medicine", match: "General orthopaedics", accepts: "Most PPO / HMO" },
];

/* ── The 8 platform modules (Product Vision, ch.5) — for the "how it fits" note */
export const MODULES = [
  { n: 1, name: "Case Management Engine", role: "case lifecycle, status, ownership" },
  { n: 2, name: "Workflow Engine", role: "configurable steps, routing, approval gates" },
  { n: 3, name: "AI Processing Engine", role: "ingest → extract → ground → confidence", here: true },
  { n: 4, name: "Clinical Rules Engine", role: "pathway criteria, red flags, priority signal", here: true },
  { n: 5, name: "Document Generation Engine", role: "structured letter / PDF from approved data", here: true },
  { n: 6, name: "Communication Engine", role: "secure e-fax / message / API delivery" },
  { n: 7, name: "Organization Management", role: "multi-tenant, roles, branding" },
  { n: 8, name: "Security & Compliance", role: "encryption, RBAC, immutable audit log" },
];

export const urgencyCopy = {
  routine: "All required referral criteria are documented — the referral is ready for physician review.",
  review: "A required referral criterion is missing. The referral is likely to be returned by the specialist; complete it before sending.",
  urgent: "A red-flag term is present in the note. Escalate for same-day clinical review — do not route as a routine referral.",
};
