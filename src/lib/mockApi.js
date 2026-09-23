/* ────────────────────────────────────────────────────────────────────────
   Mock implementations of every api.js export — used when VITE_MOCK_MODE
   is on (see api.js), so the whole frontend runs standalone with zero
   requests to the Laravel backend (:8010) or the ai-service (:8000).

   Design: an in-memory store per resource (cases, patients, the admin
   tables, AI requests) that persists for the life of the browser tab, plus
   static catalogs (pathways, referral routing) built from the same data
   already used elsewhere for offline fallbacks (mockData.js,
   referralPathwayCatalog.js) so the mock demo stays one coherent story
   instead of inventing a second, inconsistent one.

   Every exported function here mirrors the *resolved value* of its api.js
   counterpart exactly (some resolve to `data`, some to the whole envelope —
   see api.js's own comments), never the raw fetch Response, since api.js
   short-circuits before any fetch/parse happens in mock mode.
──────────────────────────────────────────────────────────────────────── */

import {
  ORG,
  PATIENT_DEFAULTS,
  GROUNDED,
  PATHWAY_SIGNAL,
  RULE_SIGNALS,
} from "../data/mockData.js";
import {
  ZONES,
  PROGRAM_CONTACTS,
  ENTRY_DOORS,
  CLINICAL_PATHWAYS,
  EMERGENCY_INDICATIONS,
  URGENT_INDICATIONS,
  ALL_REASONS,
  REASON_GROUPS,
} from "../data/referralPathwayCatalog.js";
import { inferClinicalFieldsFromSections } from "./clinicalAutoFill.js";

/* ── Small helpers ────────────────────────────────────────────────────── */

let seq = 0;
function uid(prefix = "id") {
  return `mock-${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
}
function nowIso() {
  return new Date().toISOString();
}
function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function mockDelay(value, ms = 300) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return Promise.reject(err);
}
function opt(valueToLabel) {
  return Object.entries(valueToLabel).map(([value, label]) => ({
    value,
    label,
  }));
}

/* MedFlowApp.jsx navigates to the dashboard and back with a real
   `window.location.search = ...` assignment (a full page reload, not SPA
   routing — see main.jsx), which would otherwise wipe every plain-JS store
   below on every "Dashboard" click. Persist to sessionStorage instead, so a
   case/patient/AI request created in the wizard is still there once the
   physician reaches the Dashboard, for the life of the browser tab. */
const STORAGE_PREFIX = "medflow-mock:";
function loadJSON(key, fallback) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // best-effort — a private/full session storage just falls back to in-memory-only
  }
}

/* Reshapes a grounded-extraction result's `items` into the {title, content,
   source_phrase, verbatim} shape clinicalAutoFill.js's inferClinicalFieldsFromSections
   expects — the same reshape MedFlowApp.jsx's own sectionsFromItems() does. */
function sectionsFromItems(items) {
  return (items || []).map((it) => ({
    title: it.label,
    content: it.value,
    source_phrase: it.source_phrase,
    verbatim: it.verbatim,
  }));
}

/* ── Current user / auth ─────────────────────────────────────────────── */

const ORGANIZATIONS = loadJSON("organizations", [
  {
    id: "org-riverside",
    name: ORG,
    tier: "clinic-group",
    branding_config: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "org-solo-1",
    name: "Dr. Amara Whitfield — Solo Practice",
    tier: "solo",
    branding_config: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
]);

// `name` is a bare first+last name, no "Dr." title — DashboardPage.jsx builds
// its own "Welcome back, Dr. {firstName}" greeting from this.
const CURRENT_USER = {
  id: "user-dev",
  organization_id: "org-riverside",
  name: "Samuel Ortiz",
  email: "dr.ortiz@medflow.local",
  clinic_town: "Oakdale",
  role: "physician",
  organization: ORGANIZATIONS[0],
  ...loadJSON("user", {}),
};

export function login({ email }) {
  return mockDelay(
    {
      user: { ...CURRENT_USER, email: email || CURRENT_USER.email },
      token: uid("token"),
    },
    400,
  );
}

export function logout() {
  return mockDelay({ success: true, message: "Logged out" }, 100);
}

export function getCurrentUser() {
  return mockDelay(clone(CURRENT_USER), 200);
}

export function updateProfile(data) {
  if (data.clinic_town !== undefined)
    CURRENT_USER.clinic_town = data.clinic_town;
  saveJSON("user", CURRENT_USER);
  return mockDelay(clone(CURRENT_USER), 300);
}

/* ── Admin data tables (organizations / case types / workflow templates) ─ */

const CASE_TYPES = loadJSON("case_types", [
  {
    id: "ct-specialist-referral",
    code: "specialist_referral",
    name: "Specialist Referral",
    category: "specialist_referral",
    field_schema: {},
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ct-prior-auth",
    code: "prior_auth",
    name: "Prior Authorization",
    category: "prior_authorization",
    field_schema: {},
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ct-disability",
    code: "disability_assessment",
    name: "Disability Assessment",
    category: "disability_assessment",
    field_schema: {},
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
]);

const WORKFLOW_TEMPLATES = loadJSON("workflow_templates", [
  {
    id: "wt-specialist-referral",
    organization_id: "org-riverside",
    case_type_id: "ct-specialist-referral",
    name: "Standard Specialist Referral",
    pathway_rules: {},
    document_template: null,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "wt-prior-auth",
    organization_id: "org-riverside",
    case_type_id: "ct-prior-auth",
    name: "Standard Prior Authorization",
    pathway_rules: {},
    document_template: null,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
]);

function makeResource(store, storageKey) {
  return {
    list: () => mockDelay(clone(store), 300),
    create: (data) => {
      const row = {
        id: uid("row"),
        created_at: nowIso(),
        updated_at: nowIso(),
        ...data,
      };
      store.push(row);
      saveJSON(storageKey, store);
      return mockDelay(clone(row), 300);
    },
    update: (id, data) => {
      const row = store.find((r) => r.id === id);
      if (!row) return notFound("Row not found");
      Object.assign(row, data, { updated_at: nowIso() });
      saveJSON(storageKey, store);
      return mockDelay(clone(row), 300);
    },
    remove: (id) => {
      const idx = store.findIndex((r) => r.id === id);
      if (idx === -1) return notFound("Row not found");
      store.splice(idx, 1);
      saveJSON(storageKey, store);
      return mockDelay({ success: true, message: "Deleted successfully" }, 300);
    },
  };
}

export const tableResources = {
  organizations: makeResource(ORGANIZATIONS, "organizations"),
  case_types: makeResource(CASE_TYPES, "case_types"),
  workflow_templates: makeResource(WORKFLOW_TEMPLATES, "workflow_templates"),
};

export function listCaseTypes() {
  return mockDelay(clone(CASE_TYPES), 250);
}

export function listWorkflowTemplates() {
  return mockDelay(clone(WORKFLOW_TEMPLATES), 250);
}

/* ── Clinical pathway field definitions (Clinical Assessment form) ──────
   Field codes below are transcribed verbatim from
   MedFlow_AI_Backend/database/seeders/PathwayFieldDefinitionSeeder.php so
   clinicalAutoFill.js's real heuristic (imported above) can auto-fill them
   exactly as it would against the real backend. ─────────────────────── */

const GENERIC_HISTORY_SELECTS = [
  {
    code: "GEN_DURATION",
    name: "Duration",
    options: {
      acute: "Acute (<6wk)",
      subacute: "Subacute (6-12wk)",
      chronic: "Chronic (>12wk)",
    },
    strategy: "duration_parse",
  },
  {
    code: "GEN_PAIN_PATTERN",
    name: "Pain pattern",
    options: {
      intermittent: "Intermittent",
      daily_frequent: "Daily / frequent",
      constant: "Constant",
    },
    strategy: "keyword_bag",
  },
  {
    code: "GEN_FUNCTIONAL_IMPACT",
    name: "Functional impact",
    options: { minimal: "Minimal", clear: "Clear (ADLs/work)", major: "Major" },
    strategy: "keyword_bag",
  },
  {
    code: "GEN_SLEEP_DISRUPTION",
    name: "Sleep disruption",
    options: {
      none: "None",
      occasional: "Occasional",
      present: "Present",
      major: "Major",
    },
    strategy: "keyword_bag",
  },
];
const GENERIC_HISTORY_CHECKBOXES = [
  {
    code: "GEN_NUMBNESS_TINGLING",
    name: "Numbness / tingling",
    strategy: "keyword_bag",
  },
  {
    code: "GEN_MECHANICAL_SYMPTOMS",
    name: "Mechanical symptoms (locking, catching, giving way, clicking)",
    strategy: "keyword_bag",
  },
];
const GENERIC_EXAM_SELECTS = [
  {
    code: "GEN_ROM",
    name: "Range of motion",
    options: { normal: "Normal", reduced: "Reduced", major_loss: "Major loss" },
    strategy: "keyword_bag",
  },
  {
    code: "GEN_STRENGTH_DEFICIT",
    name: "Strength deficit",
    options: {
      none: "None",
      mild: "Mild",
      moderate: "Moderate",
      severe: "Severe",
    },
    strategy: "keyword_bag",
  },
];
const EXAM_OVERLAY_BY_CODE = {
  CTS: [
    { code: "GEN_THENAR_ATROPHY", name: "Thenar atrophy" },
    { code: "GEN_THUMB_WEAKNESS", name: "Thumb weakness" },
  ],
  SHOULDER: [
    {
      code: "GEN_FROZEN_SHOULDER",
      name: "Frozen shoulder (marked, global ROM loss)",
    },
  ],
  LOW_BACK_PAIN: [
    { code: "GEN_MOTOR_DEFICIT", name: "Motor deficit (e.g. foot drop)" },
  ],
};
const GENERIC_LABS_FIELD = {
  code: "GEN_LABS_STATUS",
  name: "Labs",
  options: { done: "Done", pending: "Ordered / pending", not_done: "Not done" },
  strategy: "keyword_bag",
};
const IMAGING_CHOICE_OPTIONS = {
  xray: "X-ray",
  weight_bearing_xray: "Weight-bearing X-ray",
  mri: "MRI",
  ct: "CT",
  ultrasound: "Ultrasound",
  none: "None yet",
};
const GENERIC_MANAGEMENT_FIELDS = [
  {
    code: "GEN_MANAGEMENT_TRIED",
    name: "Conservative management tried?",
    type: "select",
    options: { yes: "Yes", no: "No" },
    strategy: "keyword_bag",
  },
  {
    code: "GEN_MANAGEMENT_WEEKS",
    name: "Duration tried (weeks)",
    type: "number",
    options: null,
    strategy: "duration_parse",
  },
  {
    code: "GEN_MANAGEMENT_RESPONSE",
    name: "Response",
    type: "select",
    options: { none: "None", partial: "Partial", good: "Good" },
    strategy: "keyword_bag",
  },
  {
    code: "GEN_MEDICATIONS",
    name: "Medications",
    type: "text",
    options: null,
    strategy: "medication_keywords",
  },
];
const MANAGEMENT_CHECKLIST = [
  { code: "PHYSIOTHERAPY", name: "Physiotherapy" },
  { code: "NSAIDS", name: "NSAIDs / analgesia" },
  { code: "ACTIVITY_MODIFICATION", name: "Activity modification" },
  { code: "BRACING_SPLINTING", name: "Bracing / splinting" },
  { code: "INJECTION_GIVEN", name: "Corticosteroid injection given" },
  { code: "REFERRAL_PRIOR", name: "Previously referred for this condition" },
];
const RED_FLAG_CONCEPTS = [
  {
    code: "INFECTION_SIGNS",
    name: "Signs of infection (fever, warmth, redness, effusion)",
    severity: "critical",
    urgency: "urgent",
    priority: 1,
    action: "Escalate for same-day clinical review — do not route as routine.",
  },
  {
    code: "VASCULAR_NEURO_COMPROMISE",
    name: "Vascular or acute neurological compromise",
    severity: "critical",
    urgency: "urgent",
    priority: 1,
    action: "Refer to Emergency Department.",
  },
  {
    code: "SUSPECTED_MALIGNANCY",
    name: "Suspected malignancy (unexplained mass, weight loss, night pain)",
    severity: "high",
    urgency: "urgent",
    priority: 2,
    action: "Fast-track referral; consider the MSK Oncology pathway.",
  },
];

// Per-pathway history content, transcribed from PathwayFieldDefinitionSeeder::definitions().
const PATHWAY_HISTORY_DEFS = {
  CTS: {
    selects: [
      {
        code: "SEVERITY",
        name: "Severity",
        options: {
          mild_moderate: "Mild / moderate (intermittent)",
          severe: "Severe (constant)",
        },
      },
    ],
    radio: {
      code: "NOCTURNAL",
      name: "Nocturnal symptoms?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Numbness / tingling in thumb, index, middle finger",
      "Pain radiating to forearm",
      "Thenar atrophy",
      "Grip / pinch weakness",
    ],
    comorbidities_placeholder:
      "e.g. diabetes, hypothyroidism, pregnancy, rheumatoid arthritis",
  },
  SHOULDER: {
    selects: [
      {
        code: "ONSET",
        name: "Onset",
        options: { acute: "Acute", chronic: "Chronic" },
      },
      {
        code: "PAIN_PATTERN",
        name: "Pain pattern",
        options: {
          night_pain: "Night pain",
          activity_related: "Activity-related",
          constant: "Constant",
        },
      },
    ],
    radio: {
      code: "STIFFNESS_DOMINANT",
      name: "Stiffness-dominant (vs pain-dominant)?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Painful arc (60-120°)",
      "Weakness on resisted testing",
      "Global loss of active AND passive ROM",
      "Sudden loss of strength after a pop or tear sensation",
    ],
    comorbidities_placeholder:
      "e.g. diabetes (adhesive capsulitis risk), prior shoulder surgery",
  },
  KNEE_OA: {
    selects: [
      {
        code: "ONSET",
        name: "Onset",
        options: { acute: "Acute", chronic: "Chronic" },
      },
      {
        code: "MECHANISM",
        name: "Mechanism",
        options: {
          traumatic: "Traumatic",
          non_traumatic: "Non-traumatic",
          sudden: "Sudden",
          gradual: "Gradual",
        },
      },
    ],
    radio: {
      code: "WORK_RELATED",
      name: "Work-related injury?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: ["Swelling", "Giving way", "Clicking / catching", "True locking"],
    comorbidities_placeholder: "e.g. BMI, smoking, A1c",
    anatomical: {
      label: "Primary location of pain / complaint",
      options: [
        {
          key: "anterior",
          label: "Anterior",
          differentials: [
            "Patellofemoral syndrome (PFS)",
            "Chondromalacia patella",
            "Quadriceps tendinopathy",
            "Patellar tendinopathy",
            "Bursitis",
            "Osgood-Schlatter's (if adolescent)",
            "Chronic patellar subluxation/dislocation",
          ],
        },
        {
          key: "medial",
          label: "Medial",
          differentials: [
            "Acute medial meniscal tear",
            "Degenerative meniscal tear",
            "Medial compartment arthritis",
            "Pes anserine bursitis",
            "MCL sprain",
          ],
        },
        {
          key: "lateral",
          label: "Lateral",
          differentials: [
            "Acute lateral meniscal tear",
            "Degenerative meniscal tear",
            "Lateral compartment end-stage OA",
            "ITB syndrome",
            "LCL sprain",
          ],
        },
        {
          key: "posterior",
          label: "Posterior",
          differentials: ["Baker's cyst", "Gastrocnemius strain", "PCL sprain"],
        },
        {
          key: "intra",
          label: "Intra-articular",
          differentials: [
            "Osteoarthritis",
            "Osteochondral defect",
            "Spontaneous osteonecrosis of knee (SONK)",
          ],
        },
        {
          key: "instability",
          label: "Instability +/- pain",
          differentials: [
            "Patellar instability",
            "Unstable meniscal tear",
            "ACL tear",
            "PCL tear",
            "High-grade MCL/LCL sprain",
            "Intra-articular loose body",
          ],
          warning: "Consider Sports Medicine / Orthopedics consultation.",
        },
      ],
    },
  },
  LOW_BACK_PAIN: {
    selects: [
      {
        code: "DURATION",
        name: "Duration",
        options: {
          acute: "Acute (<6 weeks)",
          subacute: "Sub-acute (6 weeks-3 months)",
          chronic: "Chronic (>=3 months)",
          recurrent: "Recurrent (>=2 episodes/12 months)",
        },
      },
    ],
    radio: {
      code: "PAIN_DOMINANT",
      name: "Pain dominant in",
      options: { back_buttocks: "Back / buttocks", leg: "Leg" },
    },
    symptoms: [
      "Constant pain",
      "Numbness / weakness / tingling / burning",
      "Morning stiffness >30 min (if onset age <50)",
      "Saddle-area symptoms",
    ],
    comorbidities_placeholder:
      "e.g. osteoporosis, prior back surgery, immunosuppression",
  },
  HIP_OA: {
    selects: [
      {
        code: "ONSET",
        name: "Onset",
        options: { acute: "Acute", chronic: "Chronic" },
      },
      {
        code: "PAIN_LOCATION",
        name: "Pain location",
        options: {
          groin: "Groin",
          lateral_hip: "Lateral hip",
          buttock: "Buttock",
          anterior_thigh: "Anterior thigh",
        },
      },
    ],
    radio: {
      code: "ACTIVITY_RELATED",
      name: "Pain worse with activity?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Morning stiffness <30 min",
      "Reduced internal rotation",
      "Limp / antalgic gait",
      "Mechanical clicking or catching",
      "Sudden inability to weight-bear",
    ],
    comorbidities_placeholder:
      "e.g. BMI, prior hip surgery, avascular necrosis risk (steroid use, alcohol use)",
  },
  MSK_ONCOLOGY: {
    selects: [
      {
        code: "DEPTH",
        name: "Depth",
        options: { superficial: "Superficial", deep: "Deep to fascia" },
      },
      {
        code: "AGE_GROUP",
        name: "Age",
        options: { under_40: "Under 40", "40_over": "40 and over" },
      },
    ],
    radio: {
      code: "GROWING",
      name: "Rapidly growing?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Mass >5cm",
      "Deep / fixed mass",
      "Rapid growth",
      "Painful mass",
      "Recurrent after prior excision",
    ],
    comorbidities_placeholder:
      "e.g. prior malignancy, radiation exposure, neurofibromatosis",
  },
  HAND_WRIST_OA: {
    selects: [
      {
        code: "JOINTS_INVOLVED",
        name: "Joints involved",
        options: {
          cmc: "CMC (thumb base)",
          dip: "DIP",
          pip: "PIP",
          wrist: "Wrist",
          multiple: "Multiple",
        },
      },
    ],
    radio: {
      code: "SYMMETRY",
      name: "Symmetric involvement?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Joint pain with activity",
      "Stiffness <30-60 min in morning",
      "Reduced grip strength",
      "Bony enlargement (Heberden's / Bouchard's nodes)",
    ],
    comorbidities_placeholder:
      "e.g. prior hand trauma, occupation with repetitive grip",
  },
  HAND_WRIST_MASS: {
    selects: [
      {
        code: "CONSISTENCY",
        name: "Consistency",
        options: { cystic: "Cystic / fluctuant", firm: "Firm / solid" },
      },
    ],
    radio: {
      code: "PAINFUL",
      name: "Painful?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Severe pain",
      "Functional impairment",
      "Discharge",
      "Nail deformity",
      "Numbness",
    ],
    comorbidities_placeholder: "e.g. prior aspiration attempts, occupation",
  },
  TRIGGER_FINGER: {
    selects: [
      {
        code: "DIGITS_INVOLVED",
        name: "Digits involved",
        options: { single: "Single digit", multiple: "Multiple digits" },
      },
    ],
    radio: {
      code: "DIABETES",
      name: "Diabetes mellitus?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Locking / catching with flexion",
      "Painful clicking at A1 pulley",
      "Palpable nodule at A1 pulley",
      "Digit locked, not passively correctable",
    ],
    comorbidities_placeholder: "e.g. diabetes, rheumatoid arthritis",
  },
  DUPUYTRENS: {
    selects: [
      {
        code: "DIGITS_INVOLVED",
        name: "Digits involved",
        options: {
          single: "Single digit",
          multiple: "Multiple digits",
          bilateral: "Bilateral",
        },
      },
    ],
    radio: {
      code: "TABLETOP",
      name: "Tabletop test positive?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Palpable palmar nodule",
      "Palpable cord",
      "Finger contracture",
      "Limitation of work or life activity",
    ],
    comorbidities_placeholder:
      "e.g. family history, alcohol use, diabetes, prior hand trauma",
  },
  ACUTE_HAND_INJURY: {
    selects: [
      {
        code: "MECHANISM",
        name: "Mechanism",
        options: {
          laceration: "Laceration",
          crush: "Crush",
          fall: "Fall / direct blow",
          penetrating: "Penetrating",
        },
      },
    ],
    radio: {
      code: "ONSET_WITHIN_4_WEEKS",
      name: "Onset within 4 weeks?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Open wound",
      "Deformity",
      "Suspected fracture / dislocation",
      "Reduced sensation distal to injury",
      "Reduced / absent pulse",
    ],
    comorbidities_placeholder: "e.g. anticoagulation, diabetes, tetanus status",
  },
  SKIN_LESION: {
    selects: [
      {
        code: "LESION_TYPE",
        name: "Suspected type",
        options: {
          bcc: "BCC",
          scc: "SCC",
          melanoma: "Melanoma",
          other: "Other / uncertain",
        },
      },
    ],
    radio: {
      code: "CHANGING",
      name: "Changing in size, shape, or colour?",
      options: { yes: "Yes", no: "No" },
    },
    symptoms: [
      "Rapid growth",
      "Irregular border",
      "Colour variation",
      "Bleeding or ulceration",
      "Diameter >1cm",
    ],
    comorbidities_placeholder:
      "e.g. immunosuppression, prior skin cancer, significant sun exposure",
  },
  // ELBOW, FOOT_ANKLE, CERVICAL_SPINE, RHEUMATOID_HAND have no pathway-specific
  // history content in the backend seeder yet — generic GEN_* fields only,
  // same as the real backend for these four.
};

const PATHWAY_META = {
  CTS: {
    name: "Carpal Tunnel Syndrome",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  SHOULDER: {
    name: "Shoulder Assessment",
    specialization: "ortho",
    bodyRegion: "Shoulder",
  },
  KNEE_OA: {
    name: "Knee Assessment",
    specialization: "ortho",
    bodyRegion: "Knee",
  },
  LOW_BACK_PAIN: {
    name: "Low Back Pain",
    specialization: "ortho",
    bodyRegion: "Lumbar Spine",
  },
  HIP_OA: {
    name: "Hip Osteoarthritis",
    specialization: "ortho",
    bodyRegion: "Hip",
  },
  MSK_ONCOLOGY: {
    name: "MSK Oncology",
    specialization: "ortho",
    bodyRegion: "Musculoskeletal (any region)",
  },
  HAND_WRIST_OA: {
    name: "Hand & Wrist Osteoarthritis",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  HAND_WRIST_MASS: {
    name: "Hand & Wrist Soft Tissue Mass",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  TRIGGER_FINGER: {
    name: "Trigger Finger",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  DUPUYTRENS: {
    name: "Dupuytren's Disease",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  ACUTE_HAND_INJURY: {
    name: "Acute Hand Injury",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
  SKIN_LESION: {
    name: "Skin Lesion",
    specialization: "plastic",
    bodyRegion: "Skin",
  },
  ELBOW: {
    name: "Elbow Assessment",
    specialization: "ortho",
    bodyRegion: "Elbow",
  },
  FOOT_ANKLE: {
    name: "Foot & Ankle Assessment",
    specialization: "ortho",
    bodyRegion: "Foot & Ankle",
  },
  CERVICAL_SPINE: {
    name: "Cervical Spine Assessment",
    specialization: "ortho",
    bodyRegion: "Cervical Spine",
  },
  RHEUMATOID_HAND: {
    name: "Rheumatoid Hand",
    specialization: "plastic",
    bodyRegion: "Hand & Wrist",
  },
};
const PATHWAY_CODES = Object.keys(PATHWAY_META);
const pathwayId = (code) => `pw-${code.toLowerCase()}`;

let fieldSeq = 0;
function field(
  code,
  name,
  field_type,
  { options, display_config, strategy, is_required = false } = {},
) {
  return {
    id: `fld-${uid()}-${fieldSeq++}`,
    code,
    name,
    field_type,
    description: null,
    is_required,
    display_config: display_config || null,
    options: options || [],
    red_flag_category: null,
    ai_mapping: strategy
      ? { ai_capability: "note_extraction", config: { strategy } }
      : null,
  };
}

function buildSections(code) {
  const def = PATHWAY_HISTORY_DEFS[code] || {};

  const eligibility = {
    code: "eligibility",
    name: "Eligibility",
    description: null,
    fields: [
      field(
        "ELIGIBILITY",
        "Patient meets initial pathway eligibility criteria",
        "checkbox",
        {
          strategy: "keyword_bag",
          display_config: {
            warning:
              "Consider an alternate referral pathway or specialty if this isn't met.",
          },
        },
      ),
    ],
  };

  const historyFields = [];
  (def.selects || []).forEach((s) =>
    historyFields.push(
      field(s.code, s.name, "select", {
        options: opt(s.options),
        strategy: "option_match",
      }),
    ),
  );
  if (def.radio)
    historyFields.push(
      field(def.radio.code, def.radio.name, "select", {
        options: opt(def.radio.options),
        strategy: "option_match",
      }),
    );
  (def.symptoms || []).forEach((s, i) =>
    historyFields.push(
      field(`SYMPTOM_${i + 1}`, s, "checkbox", { strategy: "keyword_bag" }),
    ),
  );
  if (def.comorbidities_placeholder) {
    historyFields.push(
      field("COMORBIDITIES", "Comorbidities", "text", {
        display_config: { placeholder: def.comorbidities_placeholder },
        strategy: "comorbidity_keywords",
      }),
    );
  }
  GENERIC_HISTORY_SELECTS.forEach((g) =>
    historyFields.push(
      field(g.code, g.name, "select", {
        options: opt(g.options),
        strategy: g.strategy,
      }),
    ),
  );
  GENERIC_HISTORY_CHECKBOXES.forEach((g) =>
    historyFields.push(
      field(g.code, g.name, "checkbox", { strategy: g.strategy }),
    ),
  );
  const history = {
    code: "history",
    name: "History & Details",
    description: null,
    fields: historyFields,
  };

  const redFlags = {
    code: "red_flags",
    name: "Red Flags",
    description: null,
    fields: RED_FLAG_CONCEPTS.map((r) =>
      field(r.code, r.name, "checkbox", { strategy: "keyword_bag" }),
    ),
  };

  let anatomical = null;
  if (def.anatomical) {
    const optionsDetail = {};
    const valueToLabel = {};
    for (const o of def.anatomical.options) {
      valueToLabel[o.key] = o.label;
      optionsDetail[o.key] = {
        differentials: o.differentials || null,
        warning: o.warning || null,
      };
    }
    anatomical = {
      code: "anatomical",
      name: def.anatomical.label,
      description: null,
      fields: [
        field("ANATOMICAL_LOCATION", def.anatomical.label, "select", {
          options: opt(valueToLabel),
          strategy: "option_match",
          display_config: { options_detail: optionsDetail },
        }),
      ],
    };
  }

  const examFields = [];
  GENERIC_EXAM_SELECTS.forEach((g) =>
    examFields.push(
      field(g.code, g.name, "select", {
        options: opt(g.options),
        strategy: g.strategy,
      }),
    ),
  );
  examFields.push(
    field("GEN_DEFORMITY_ATROPHY", "Deformity / atrophy", "checkbox", {
      strategy: "keyword_bag",
    }),
  );
  (EXAM_OVERLAY_BY_CODE[code] || []).forEach((o) =>
    examFields.push(field(o.code, o.name, "checkbox", {})),
  );
  const examination = {
    code: "examination",
    name: "Examination",
    description: null,
    fields: examFields,
  };

  const investigations = {
    code: "investigations",
    name: "Investigations",
    description: null,
    fields: [
      field("IMAGING_CHOICE", "Imaging obtained", "select", {
        options: opt(IMAGING_CHOICE_OPTIONS),
        strategy: "imaging_modality_match",
      }),
      field(GENERIC_LABS_FIELD.code, GENERIC_LABS_FIELD.name, "select", {
        options: opt(GENERIC_LABS_FIELD.options),
        strategy: GENERIC_LABS_FIELD.strategy,
      }),
    ],
  };

  const managementFields = [
    ...MANAGEMENT_CHECKLIST.map((m) =>
      field(m.code, m.name, "checkbox", { strategy: "keyword_bag" }),
    ),
    ...GENERIC_MANAGEMENT_FIELDS.map((g) =>
      field(g.code, g.name, g.type, {
        options: g.options ? opt(g.options) : undefined,
        strategy: g.strategy,
      }),
    ),
  ];
  const management = {
    code: "management",
    name: "Management",
    description: null,
    fields: managementFields,
  };

  const finalAssessment = {
    code: "final_assessment",
    name: "Final Assessment",
    description: null,
    fields: [
      field(
        "ATYPICAL_PRESENT",
        "Pattern is atypical for this condition group",
        "checkbox",
        { strategy: "keyword_bag" },
      ),
      field(
        "ATYPICAL_SUGGESTION",
        "Suggested alternative assessment",
        "text",
        {},
      ),
    ],
  };

  return [
    eligibility,
    history,
    redFlags,
    anatomical,
    examination,
    investigations,
    management,
    finalAssessment,
  ].filter(Boolean);
}

const PATHWAY_DEFINITIONS = new Map(); // pathway id -> {pathway, version, follow_up, sections}
const PATHWAYS = PATHWAY_CODES.map((code) => {
  const meta = PATHWAY_META[code];
  const id = pathwayId(code);
  const summary = {
    id,
    code,
    name: meta.name,
    specialization: meta.specialization,
  };
  PATHWAY_DEFINITIONS.set(id, {
    pathway: summary,
    version: { id: `${id}-v1`, version_number: 1, status: "active" },
    follow_up: null,
    sections: buildSections(code),
  });
  return summary;
});
export function listPathways() {
  return mockDelay(clone(PATHWAYS), 250);
}

export function getPathwayDefinition(pathwayId_) {
  const def = PATHWAY_DEFINITIONS.get(pathwayId_);
  if (!def) return notFound("Pathway not found");
  return mockDelay(clone(def), 350);
}

/* {section_code: enabled} — all 8 sections default to AI-fill enabled;
   mutable per pathway via updatePathwayAiSettings, same as the real
   PathwayService::disabledSections() toggle store. */
const SECTION_CODES = [
  "eligibility",
  "history",
  "red_flags",
  "anatomical",
  "examination",
  "investigations",
  "management",
  "final_assessment",
];
const pathwayAiSettings = new Map(
  Object.entries(loadJSON("pathway_ai_settings", {})),
); // pathway id -> {code: boolean}
function aiSettingsFor(pathwayId_) {
  if (!pathwayAiSettings.has(pathwayId_)) {
    pathwayAiSettings.set(
      pathwayId_,
      Object.fromEntries(SECTION_CODES.map((c) => [c, true])),
    );
  }
  return pathwayAiSettings.get(pathwayId_);
}

export function getPathwayAiSettings(pathwayId_) {
  return mockDelay(clone(aiSettingsFor(pathwayId_)), 250);
}

export function updatePathwayAiSettings(pathwayId_, sectionCode, enabled) {
  const settings = aiSettingsFor(pathwayId_);
  settings[sectionCode] = enabled;
  saveJSON("pathway_ai_settings", Object.fromEntries(pathwayAiSettings));
  return mockDelay(clone(settings), 250);
}

/* ── Clinical pathways browser (specializations -> pathways -> rules) ───
   A separate, richer view of the same pathways above (conditions,
   criteria, red flags, imaging requirements, actions, rules) — mirrors
   ClinicalRules\Models\Specialization/Pathway, seeded by
   ClinicalPathwaySeeder.php on the real backend. KNEE_OA's criteria match
   mockData.js's PATHWAY_SIGNAL so the two stay one coherent demo; every
   other pathway gets a structurally-real but generic set. */
function buildClinicalDetail(code) {
  const meta = PATHWAY_META[code];
  const isKnee = code === "KNEE_OA";
  return {
    id: pathwayId(code),
    code,
    name: meta.name,
    version: 1,
    conditions: [
      {
        code: `${code}_PRIMARY`,
        name: meta.name,
        body_region: meta.bodyRegion,
        pivot: { role: "primary" },
      },
    ],
    criteria: isKnee
      ? PATHWAY_SIGNAL.criteria.map((c) => ({
          code: c.id.toUpperCase(),
          name: c.label,
          criterion_type: "documentation",
          required: c.required,
          config: { detail: c.evidence },
        }))
      : [
          {
            code: "IMAGING",
            name: "Relevant imaging obtained",
            criterion_type: "documentation",
            required: true,
            config: {
              detail: `e.g. x-ray of the affected ${meta.bodyRegion.toLowerCase()}`,
            },
          },
          {
            code: "CONSERVATIVE_THERAPY",
            name: "Trial of conservative therapy",
            criterion_type: "documentation",
            required: true,
            config: { detail: "analgesia / NSAIDs / physiotherapy" },
          },
          {
            code: "DURATION",
            name: "Symptom duration documented",
            criterion_type: "documentation",
            required: true,
            config: {},
          },
        ],
    red_flags: RED_FLAG_CONCEPTS.map((r) => ({
      code: r.code,
      name: r.name,
      severity: r.severity,
      pivot: { urgency: r.urgency, priority: r.priority, action: r.action },
    })),
    imaging_requirements: [
      {
        modality: "X-ray",
        body_region: meta.bodyRegion,
        indication: "Baseline assessment",
        required: true,
      },
    ],
    actions: [
      {
        code: "REFER_SPECIALIST",
        name: "Refer to specialist",
        action_type: "referral",
        urgency: "routine",
      },
    ],
    rules: [
      {
        name: `${meta.name} — routine referral`,
        priority: 1,
        condition: { all_required_met: true, red_flags: false },
        action: { urgency: "routine" },
      },
    ],
  };
}

export function listClinicalPathways() {
  const specializations = [
    {
      id: "spec-ortho",
      name: "Orthopedics & Spine",
      pathways: PATHWAY_CODES.filter(
        (c) => PATHWAY_META[c].specialization === "ortho",
      ).map(buildClinicalDetail),
    },
    {
      id: "spec-plastic",
      name: "Plastic & Hand Surgery",
      pathways: PATHWAY_CODES.filter(
        (c) => PATHWAY_META[c].specialization === "plastic",
      ).map(buildClinicalDetail),
    },
  ];
  return mockDelay(clone(specializations), 350);
}

/* ── AI jobs (extraction / pathway form / validation / imaging) ─────────
   Each submit* call creates a record that starts "processing" and flips to
   "completed" once its own readyAt has passed — checked lazily on every
   getExtraction()/listExtractions() call, so polling via setInterval (as
   MedFlowApp.jsx does) sees a realistic queued -> completed transition
   with no background timers to leak. */

const aiRequests = new Map(Object.entries(loadJSON("ai_requests", {})));
function saveAiRequests() {
  saveJSON("ai_requests", Object.fromEntries(aiRequests));
}

function createAiRequest({
  type,
  caseId,
  sourceDocumentId,
  params = {},
  delayMs = 1400,
  result,
}) {
  const id = uid("ai");
  const created = nowIso();
  aiRequests.set(id, {
    id,
    type,
    case_id: caseId || null,
    params,
    source: sourceDocumentId ? "document" : "note",
    source_document: sourceDocumentId
      ? { id: sourceDocumentId, filename: "referral-notes.pdf", version: 1 }
      : null,
    case_documents: null,
    model_id: "google/medgemma-1.5-4b-it",
    prompt_version: "2026-09-10.1",
    error: null,
    created_at: created,
    started_at: created,
    failed_at: null,
    _readyAt: Date.now() + delayMs,
    _result: result,
  });
  saveAiRequests();
  return snapshotAiRequest(id);
}

function snapshotAiRequest(id) {
  const r = aiRequests.get(id);
  if (!r) return null;
  const ready = Date.now() >= r._readyAt;
  const { _readyAt, _result, ...rest } = r;
  if (!ready) {
    return {
      ...rest,
      status: "processing",
      token_count: null,
      duration_ms: null,
      result: null,
      completed_at: null,
    };
  }
  return {
    ...rest,
    status: "completed",
    token_count: 214,
    duration_ms: r._readyAt - new Date(r.created_at).getTime(),
    result: clone(_result),
    completed_at: nowIso(),
  };
}

export function submitExtraction({ pathway, caseId, sourceDocumentId }) {
  return mockDelay(
    createAiRequest({
      type: "grounded_extraction",
      caseId,
      sourceDocumentId,
      params: { pathway: pathway || null },
      delayMs: 1500,
      result: GROUNDED,
    }),
    150,
  );
}

export function getExtraction(id) {
  const snap = snapshotAiRequest(id);
  if (!snap) return notFound("AI request not found");
  return mockDelay(snap, 150);
}

export function retryExtraction(id) {
  const r = aiRequests.get(id);
  if (!r) return notFound("AI request not found");
  r._readyAt = Date.now() + 1200;
  r.error = null;
  r.failed_at = null;
  saveAiRequests();
  return mockDelay(snapshotAiRequest(id), 150);
}

export function listExtractions({ caseId, status } = {}) {
  let rows = [...aiRequests.keys()].map(snapshotAiRequest);
  if (caseId) rows = rows.filter((r) => r.case_id === caseId);
  if (status) rows = rows.filter((r) => r.status === status);
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return mockDelay(
    { data: rows, meta: { total: rows.length }, links: {} },
    250,
  );
}

export function evaluateRules({ pathway }) {
  const knownPack =
    pathway === "knee"
      ? clone(PATHWAY_SIGNAL)
      : pathway
        ? buildGenericPathwaySignal(pathway)
        : null;
  return mockDelay({ signals: clone(RULE_SIGNALS), pathway: knownPack }, 400);
}

function buildGenericPathwaySignal(pathwayAiCode) {
  const label = pathwayAiCode.charAt(0).toUpperCase() + pathwayAiCode.slice(1);
  return {
    pathway: pathwayAiCode,
    title: `${label} — pathway validation`,
    matched: true,
    urgency: "routine",
    complete: true,
    criteria: [
      {
        id: "imaging",
        label: "Relevant imaging obtained",
        required: true,
        met: true,
        evidence: "imaging",
      },
      {
        id: "conservative_therapy",
        label: "Trial of conservative therapy",
        required: true,
        met: true,
        evidence: "conservative management",
      },
      {
        id: "duration",
        label: "Symptom duration documented",
        required: true,
        met: true,
        evidence: "duration",
      },
    ],
    missing: [],
    red_flags: [],
  };
}

export function submitPathwayValidation({ pathway, caseId }) {
  const result =
    pathway === "knee"
      ? PATHWAY_SIGNAL
      : buildGenericPathwaySignal(pathway || "general");
  return mockDelay(
    createAiRequest({
      type: "pathway_validation",
      caseId,
      params: { pathway: pathway || null },
      delayMs: 1600,
      result,
    }),
    150,
  );
}

export function submitPathwayFormExtraction({
  pathwayId: pwId,
  caseId,
  sourceDocumentId,
}) {
  const definition = PATHWAY_DEFINITIONS.get(pwId);
  const fields = definition ? definition.sections.flatMap((s) => s.fields) : [];
  const flat = definition
    ? inferClinicalFieldsFromSections(
        definition,
        sectionsFromItems(GROUNDED.items),
      )
    : {};
  const answers = Object.entries(flat).map(([code, value]) => ({
    code,
    value,
  }));
  return mockDelay(
    createAiRequest({
      type: "pathway_form_extraction",
      caseId,
      sourceDocumentId,
      params: { pathway: definition?.pathway?.code || null, fields },
      delayMs: 1300,
      result: { answers },
    }),
    150,
  );
}

export function getAutoFill(extractionId, pathwayId_) {
  const definition = PATHWAY_DEFINITIONS.get(pathwayId_);
  if (!definition) return notFound("Pathway not found");
  const flat = inferClinicalFieldsFromSections(
    definition,
    sectionsFromItems(GROUNDED.items),
  );
  const sections = definition.sections.map((s) => ({
    code: s.code,
    name: s.name,
    fields: s.fields.map((f) => ({
      code: f.code,
      field_type: f.field_type,
      value: flat[f.code] ?? null,
    })),
  }));
  return mockDelay(
    {
      pathway: clone(definition.pathway),
      version: clone(definition.version),
      sections,
    },
    300,
  );
}

export function analyzeAttachment(caseId, attachmentId) {
  return mockDelay(
    createAiRequest({
      type: "imaging_analysis",
      caseId,
      delayMs: 1400,
      result: {
        modality: "X-ray",
        body_region: "Knee",
        findings: [
          "Moderate medial compartment joint space narrowing",
          "Marginal osteophytes",
          "No acute fracture or dislocation",
        ],
        impression:
          "Findings compatible with moderate medial compartment osteoarthritis, consistent with the clinical note.",
      },
    }),
    150,
  );
}

export function extractDocument(caseId, attachmentId) {
  return mockDelay(
    {
      id: uid("doc"),
      status: "completed",
      extracted_text:
        "REFERRAL LETTER\n\nRe: patient referred for orthopaedic assessment.\n\n" +
        "55-year-old female with right knee pain for 6 months, worse when climbing stairs and after " +
        "prolonged standing. No history of trauma. Weight-bearing X-ray of the right knee shows moderate " +
        "medial compartment joint space narrowing and osteophytes. Has tried paracetamol and a 6-week " +
        "course of naproxen with only limited improvement. Completed physiotherapy 3 months ago.",
    },
    500,
  );
}

/* ── Referral routing catalog (Alberta pathway PDFs) ─────────────────── */

function buildReferralCatalog() {
  const entry_doors = ENTRY_DOORS.map((d) => ({
    code: d.id,
    label: d.label,
    description: d.sub,
  }));
  const program_contacts = {};
  for (const zone of ZONES) {
    const c = PROGRAM_CONTACTS[zone] || {};
    program_contacts[zone] = {
      zone,
      raapid: c.raapid || null,
      fast: c.fast || null,
      non_urgent_advice: c.nonUrgentAdvice || null,
    };
  }
  const urgent_indications = {};
  for (const p of ["ortho", "plastic"]) {
    const e = EMERGENCY_INDICATIONS[p];
    const u = URGENT_INDICATIONS[p];
    urgent_indications[p] = {
      emergency: e
        ? {
            weeks: null,
            action_text: e.action,
            examples: e.examples,
            zone_routing: null,
          }
        : null,
      urgent: u
        ? {
            weeks: null,
            action_text: null,
            examples: u.examples,
            zone_routing: u.zoneRouting,
          }
        : null,
    };
  }
  const reasons = ALL_REASONS.map((r) => ({
    id: r.id,
    code: r.id,
    pathway: r.pathway,
    group_name: r.group,
    label: r.label,
    display_order: 0,
    is_bypass: Boolean(r.bypass),
    bypass_note: r.bypass ? r.fundingNote || (r.notes || [])[0] || null : null,
    is_urgent: Boolean(r.urgent),
    acute_weeks: r.weeks ?? null,
    wcb_required: Boolean(r.wcb),
    zone_process: r.process || null,
    funding_note: r.fundingNote || null,
    source_conflict_note: r.sourceConflict || null,
    notes: r.notes || null,
    imaging_timeframe: r.imaging?.timeframe || null,
    imaging_items: r.imaging?.items || null,
    imaging_notes: r.imaging?.notes || null,
  }));
  return {
    entry_doors,
    program_contacts,
    clinical_pathways: CLINICAL_PATHWAYS,
    urgent_indications,
    reasons,
    reason_groups: REASON_GROUPS,
  };
}
const REFERRAL_CATALOG = buildReferralCatalog();

export function getReferralRoutingCatalog() {
  return mockDelay(clone(REFERRAL_CATALOG), 400);
}

const referralRoutingDecisions = new Map(
  Object.entries(loadJSON("referral_routing", {})),
); // caseId -> decision

export function getCaseReferralRouting(caseId) {
  return mockDelay(clone(referralRoutingDecisions.get(caseId) || null), 250);
}

export function submitCaseReferralRouting(caseId, data) {
  const saved = { ...data, case_id: caseId, updated_at: nowIso() };
  referralRoutingDecisions.set(caseId, saved);
  saveJSON("referral_routing", Object.fromEntries(referralRoutingDecisions));
  return mockDelay(clone(saved), 250);
}

/* ── Patients / cases (case intake wizard) ───────────────────────────── */

const PATIENTS = loadJSON("patients", []);
const CASES = loadJSON("cases", []);

export function createPatient(data) {
  const row = {
    id: uid("patient"),
    organization_id: data.organization_id ?? null,
    mrn_token: data.mrn_token ?? null,
    name: data.name ?? "",
    dob: data.dob ?? null,
    sex: data.sex ?? null,
    contact: data.contact ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  PATIENTS.push(row);
  saveJSON("patients", PATIENTS);
  return mockDelay(clone(row), 350);
}

function mimeOf(file) {
  return (
    file?.type ||
    (/\.pdf$/i.test(file?.name || "")
      ? "application/pdf"
      : /\.docx?$/i.test(file?.name || "")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : /\.(png|jpe?g|gif|webp)$/i.test(file?.name || "")
          ? "image/jpeg"
          : "application/octet-stream")
  );
}

export function createCase(data, files = [], referralDocument = null) {
  const patient = PATIENTS.find((p) => p.id === data.patient_id) || null;
  const organization =
    ORGANIZATIONS.find((o) => o.id === data.organization_id) || null;
  const workflowTemplate =
    WORKFLOW_TEMPLATES.find((w) => w.id === data.workflow_template_id) || null;
  const caseType = CASE_TYPES.find((c) => c.id === data.case_type_id) || null;

  const attachments = files.map((f) => ({
    id: uid("att"),
    case_id: null,
    path: null,
    original_filename: f.name,
    mime_type: mimeOf(f),
    size: f.size || 0,
    uploaded_by: data.created_by ?? null,
    created_at: nowIso(),
  }));

  const documents = referralDocument
    ? [
        {
          id: uid("doc"),
          case_id: null,
          version: 1,
          pdf_path: null,
          extracted_text:
            "REFERRAL LETTER\n\nPatient referred for assessment — see attached documentation for full clinical history.",
          extraction_metadata: {
            source_file: referralDocument.name || "referral-document",
          },
          created_at: nowIso(),
        },
      ]
    : [];

  const row = {
    id: uid("case"),
    organization_id: data.organization_id ?? null,
    patient_id: data.patient_id ?? null,
    created_by: data.created_by ?? null,
    case_type_id: data.case_type_id ?? null,
    workflow_template_id: data.workflow_template_id ?? null,
    status: data.status || "created",
    raw_notes: data.raw_notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    patient,
    organization,
    workflow_template: workflowTemplate,
    case_type: caseType,
    attachments,
    documents,
    pathways: data.pathway_id
      ? [
          {
            pathway_id: data.pathway_id,
            status: "in_progress",
            started_at: nowIso(),
          },
        ]
      : [],
  };
  attachments.forEach((a) => {
    a.case_id = row.id;
  });
  documents.forEach((d) => {
    d.case_id = row.id;
  });
  CASES.push(row);
  saveJSON("cases", CASES);
  return mockDelay(clone(row), 500);
}

export function getCase(id) {
  const row = CASES.find((c) => c.id === id);
  if (!row) return notFound("Case not found");
  return mockDelay(clone(row), 300);
}

export function listCases({ organizationId, status } = {}) {
  let rows = CASES;
  if (organizationId)
    rows = rows.filter((c) => c.organization_id === organizationId);
  if (status) rows = rows.filter((c) => c.status === status);
  return mockDelay(clone(rows), 300);
}
