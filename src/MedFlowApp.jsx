import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  FileText,
  Sparkles,
  ShieldCheck,
  FileSignature,
  UserCheck,
  User,
  Send,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  UploadCloud,
  Menu,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Info,
  Paperclip,
  GitBranch,
  ScrollText,
  LogOut,
  LayoutDashboard,
  MapPin,
  ClipboardList,
  Route,
} from "lucide-react";
import { GlobalStyle } from "./styles.jsx";
import Logo from "./components/ui/Logo.jsx";
import {
  resolveReferralHub,
  ALL_ALBERTA_TOWNS,
  ALBERTA_REFERRAL_HUBS,
} from "./albertaReferralRouting.js";
// Offline fallback for the Referral Routing step — used only if
// GET /referral-routing/catalog can't be reached; the backend-seeded
// catalog (ReferralRoutingSeeder) is otherwise the source of truth.
import {
  ZONES,
  PROGRAM_CONTACTS as STATIC_PROGRAM_CONTACTS,
  NON_URGENT_ADVICE_ZONES,
  ENTRY_DOORS as STATIC_ENTRY_DOORS,
  CLINICAL_PATHWAYS as STATIC_CLINICAL_PATHWAYS,
  EMERGENCY_INDICATIONS as STATIC_EMERGENCY_INDICATIONS,
  URGENT_INDICATIONS as STATIC_URGENT_INDICATIONS,
  ALL_REASONS as STATIC_ALL_REASONS,
  REASON_GROUPS as STATIC_REASON_GROUPS,
} from "./referralPathwayCatalog.js";
import { CONDITION_GROUPS, runMskTriage } from "./mskTriage.js";
import { inferClinicalFieldsFromSections } from "./clinicalAutoFill.js";
import {
  getCurrentUser,
  listCaseTypes,
  listWorkflowTemplates,
  createPatient,
  createCase,
  getCase,
  submitExtraction,
  submitPathwayFormExtraction,
  getAutoFill,
  getExtraction,
  listExtractions,
  retryExtraction,
  isTerminal,
  evaluateRules,
  submitPathwayValidation,
  analyzeAttachment,
  extractDocument,
  listPathways,
  getPathwayDefinition,
  getReferralRoutingCatalog,
  getCaseReferralRouting,
  submitCaseReferralRouting,
  headers,
  BASE,
} from "./api.js";
import {
  ORG,
  CASE_ID,
  GUIDING_PRINCIPLE,
  PATIENT_DEFAULTS,
  SAMPLE_NOTE,
  AI_REQUEST,
  GROUNDED,
  SECTIONS_AFTER_EDIT,
  PATHWAY_SIGNAL,
  RULE_SIGNALS,
  REFERRAL_DRAFT,
  FEEDBACK_RECORD,
  SPECIALISTS,
  MODULES,
  urgencyCopy,
} from "./mockData.js";

/* ────────────────────────────────────────────────────────────────────────
   MedFlow — static walkthrough of the referral workflow.

   Nothing here calls a server. Every AI / rules / draft object is shaped
   exactly like the real backend + ai-service contract (see mockData.js) so
   the UI is faithful to the pipeline without a model behind it.
──────────────────────────────────────────────────────────────────────── */

const NAV = [
  { id: "patient", label: "Patient", icon: User, stage: "1 · Case creation" },
  {
    id: "intake",
    label: "Case intake",
    icon: FileText,
    stage: "1 · Case creation",
  },
  {
    id: "extraction",
    label: "AI extraction",
    icon: Sparkles,
    stage: "2 · AI ingestion & extraction",
  },
  {
    id: "clinical-assessment",
    label: "Clinical assessment",
    icon: ClipboardList,
    stage: "3 · Clinical validation & rule check",
  },
  {
    id: "referral-routing",
    label: "Referral routing",
    icon: Route,
    stage: "3 · Clinical validation & rule check",
  },
  {
    id: "validation",
    label: "Validation & rules",
    icon: ShieldCheck,
    stage: "3 · Clinical validation & rule check",
  },
  {
    id: "referral",
    label: "Referral draft",
    icon: FileSignature,
    stage: "4 · Draft generation",
  },
  {
    id: "review",
    label: "Physician review",
    icon: UserCheck,
    stage: "5 · Review & authorisation",
  },
  { id: "send", label: "Route & send", icon: Send, stage: "6 · Communication" },
  {
    id: "feedback",
    label: "Feedback & audit",
    icon: GitBranch,
    stage: "7 · Tracking & learning",
  },
];

// `pathway` is the ai-service-facing name used by Validation & rules
// (app/services/pathways/{knee,shoulder,spine}.yaml — only these 3 packs
// exist today); `clinicalCondition` is the Clinical Assessment condition
// group (16 values, matches CONDITION_GROUPS). This map feeds the
// confirmed/selected condition group into the ai-service name where one
// exists; conditions with no YAML pack yet are left unmapped, and
// Validation & rules falls back to its generic rules for them.
const PATHWAY_BY_CONDITION_GROUP = {
  knee: "knee",
  shoulder: "shoulder",
  lumbar: "spine",
};

// DB pathway `code` (Pathway.code, e.g. "KNEE_OA") -> Clinical Assessment
// condition group id (CONDITION_GROUPS key) — the two vocabularies differ,
// so the intake picker (sourced from GET /pathways) translates through this
// to drive the rest of the app unchanged.
const PATHWAY_CODE_TO_CONDITION_GROUP = {
  CTS: "cts",
  SHOULDER: "shoulder",
  KNEE_OA: "knee",
  LOW_BACK_PAIN: "lumbar",
  HIP_OA: "hip_oa",
  MSK_ONCOLOGY: "msk_oncology",
  HAND_WRIST_OA: "hand_wrist_oa",
  HAND_WRIST_MASS: "hand_wrist_mass",
  TRIGGER_FINGER: "trigger_finger",
  DUPUYTRENS: "dupuytrens",
  ACUTE_HAND_INJURY: "acute_hand_injury",
  SKIN_LESION: "skin_lesion",
  ELBOW: "elbow",
  FOOT_ANKLE: "foot_ankle",
  CERVICAL_SPINE: "cervical_spine",
  RHEUMATOID_HAND: "rheumatoid_hand",
};

const STATUS_BY_PAGE = {
  patient: "Draft",
  intake: "Draft",
  extraction: "Extracting",
  "clinical-assessment": "Triaging",
  "referral-routing": "Routing",
  validation: "Validating",
  referral: "Draft ready",
  review: "Pending review",
  send: "Pending review",
  feedback: "Completed",
};

// Demo-only fax number (555 prefix, same fictional convention as the rest of
// mockData.js) — the routing map has no real per-clinic directory yet.
const FAX_AREA_CODE_BY_HUB = {
  Edmonton: "780",
  "Grande Prairie": "780",
  "Fort McMurray": "780",
  Calgary: "403",
  "Red Deer": "403",
  Lethbridge: "403",
  "Medicine Hat": "403",
};
function fakeFax(hub, i) {
  return `(${FAX_AREA_CODE_BY_HUB[hub] || "403"}) 555-01${String(i).padStart(2, "0")}`;
}

// The ai-service's grounded-extraction result is { items: [{label, value,
// source_phrase, verbatim}], not_stated: [...] } — reshape it into the same
// {title, content, source_phrase, verbatim} shape the sections-based UI
// (Structured data, Physician review) already knows how to render.
function sectionsFromItems(items) {
  return (items || []).map((it) => ({
    title: it.label,
    content: it.value,
    source_phrase: it.source_phrase,
    verbatim: it.verbatim,
  }));
}

function pageFromUrl() {
  const id = new URLSearchParams(window.location.search).get("page");
  return NAV.some((n) => n.id === id) ? id : "patient";
}

function visitedThrough(pageId) {
  const idx = NAV.findIndex((n) => n.id === pageId);
  const v = {};
  NAV.forEach((n, i) => {
    if (i <= idx) v[n.id] = true;
  });
  return v;
}

// Whether each step's own data/action requirement is satisfied — the gate
// that stops sidebar clicks, deep-link URLs, and browser back/forward from
// skipping past a step that hasn't actually been completed. It does NOT gate
// the in-page Next buttons — those already validate before calling next().
function computeStepOk({
  patientOk,
  extraction,
  validationOk,
  decision,
  sendState,
}) {
  const extractionOk = Boolean(
    extraction &&
    isTerminal(extraction.status) &&
    extraction.status !== "failed" &&
    extraction.result?.items,
  );
  return {
    patient: patientOk,
    intake: Boolean(extraction),
    extraction: extractionOk,
    "clinical-assessment": extractionOk,
    "referral-routing": extractionOk,
    validation: extractionOk,
    referral: Boolean(validationOk),
    review: Boolean(decision),
    send: sendState === "sent",
    feedback: sendState === "sent",
  };
}

function frontierOf(stepOk) {
  const i = NAV.findIndex((n) => !stepOk[n.id]);
  return i === -1 ? NAV.length - 1 : i;
}

const INITIAL_STEP_OK = computeStepOk({
  patientOk: Boolean(
    PATIENT_DEFAULTS.firstName.trim() &&
    PATIENT_DEFAULTS.lastName.trim() &&
    PATIENT_DEFAULTS.dob.trim(),
  ),
  extraction: null,
  validationOk: false,
  decision: null,
  sendState: "idle",
});
const INITIAL_FRONTIER = frontierOf(INITIAL_STEP_OK);

function initialPage() {
  const idx = Math.max(
    0,
    NAV.findIndex((n) => n.id === pageFromUrl()),
  );
  return NAV[Math.min(idx, INITIAL_FRONTIER)].id;
}

export default function MedFlowApp({ user, onLogout, onOpenDashboard } = {}) {
  const [page, setPage] = useState(initialPage);
  const [visited, setVisited] = useState(() => visitedThrough(initialPage()));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [patient, setPatient] = useState(() => ({
    ...PATIENT_DEFAULTS,
    // The sample MRN is fixed; suffix it so repeat demo runs don't collide
    // with a previously-created patient (organization_id, mrn_token) is unique.
    mrn: `${PATIENT_DEFAULTS.mrn}-${Date.now().toString(36).toUpperCase()}`,
  }));
  const [pathway, setPathway] = useState("knee");
  // The condition group the physician confirms at Clinical Assessment
  // (post-extraction, against the real note) — the assessment form itself
  // owns every other field locally (remounted per condition group; see
  // ClinicalAssessmentForm), so this is the only piece lifted up here. The
  // intake pathway picker now sets this directly (see PageIntake below).
  const [clinicalCondition, setClinicalCondition] = useState("knee");
  // The condition group confirmed at Clinical Assessment (or picked at
  // intake, before the note exists) overrides the ai-service-facing guess.
  useEffect(() => {
    const mapped = PATHWAY_BY_CONDITION_GROUP[clinicalCondition];
    if (mapped) setPathway(mapped);
  }, [clinicalCondition]);

  // Pathways fetched from the database (GET /pathways) for the intake
  // picker — falls back to the static CONDITION_GROUPS labels (no DB id) if
  // this hasn't resolved yet or the backend is unreachable.
  const [pathways, setPathways] = useState([]);
  const [selectedPathwayId, setSelectedPathwayId] = useState(null);
  useEffect(() => {
    listPathways()
      .then((list) =>
        setPathways(
          list.map((p) => ({
            ...p,
            conditionGroup: PATHWAY_CODE_TO_CONDITION_GROUP[p.code],
          })),
        ),
      )
      .catch(() => {}); // keep the static fallback in PageIntake
  }, []);
  // Default the DB-backed selection to whatever condition group is already
  // active (e.g. the "knee" default) once the list loads, so a physician
  // who never touches the picker still gets a pathway_id on case creation.
  useEffect(() => {
    if (selectedPathwayId || pathways.length === 0) return;
    const match = pathways.find((p) => p.conditionGroup === clinicalCondition);
    if (match) setSelectedPathwayId(match.id);
  }, [pathways, clinicalCondition, selectedPathwayId]);
  // The selected pathway's DB field definition (sections -> fields ->
  // options/AI-fill mapping) — fetched after case creation. Used below to
  // resolve a field's human-readable name/option label for the "pathway
  // form" tab on the AI extraction page (getAutoFill()'s own response only
  // carries {code, field_type, value}, not the display metadata).
  const [pathwayDefinition, setPathwayDefinition] = useState(null);

  // Pathway-form extraction: a real AI job, queued alongside the grounded
  // extraction whenever a pathway is selected. The model answers the
  // pathway's own form fields directly (validated server-side against each
  // field's type/options) rather than free text for client-side matching.
  // Polled like pathwayJob/imagingJob below; feeds aiFieldValues (Clinical
  // Assessment overlay) and formFillResult (AI extraction page display)
  // once done.
  const [formFillJob, setFormFillJob] = useState(null);
  const [aiFieldValues, setAiFieldValues] = useState(null);
  const [formFillResult, setFormFillResult] = useState(null);

  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [sections, setSections] = useState(() =>
    JSON.parse(JSON.stringify(AI_REQUEST.result.sections)),
  );
  const [letterBody, setLetterBody] = useState(REFERRAL_DRAFT);
  const [specialist, setSpecialist] = useState("");
  const [channel, setChannel] = useState("fax");
  const [attested, setAttested] = useState(false);
  const [sendState, setSendState] = useState("idle");
  const [decision, setDecision] = useState(null); // approved | edited | rejected

  const [extraction, setExtraction] = useState(null); // real extraction record once a case is created
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeError, setIntakeError] = useState(null);

  // The created case's id — set once intake succeeds, consumed by Referral
  // Routing to GET/POST that case's referral-routing decision.
  const [caseId, setCaseId] = useState(null);

  // Keep `case` in the URL alongside `page` once a case exists, so a direct
  // link, bookmark, or reload can resume it (see the rehydration effect
  // below) instead of every downstream page falling back to its static
  // mock/demo data with no indication that's what happened.
  useEffect(() => {
    if (!caseId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("case") === caseId) return;
    params.set("case", caseId);
    window.history.replaceState(
      window.history.state,
      "",
      `?${params.toString()}`,
    );
  }, [caseId]);

  // Resume from `?case=...` in the URL (a direct link, bookmark, or reload)
  // instead of the wizard's in-memory-only state silently starting over.
  // Waits for `pathways` (fetched separately, see below) so the case's
  // pathway_id can be mapped back to a condition group. Only rehydrates the
  // case + patient + notes + the four AI job types (grounded extraction,
  // pathway-form fill, imaging, pathway validation) — enough for Extraction
  // and Clinical Assessment to show real data instead of PageExtraction's
  // static mock fallback; later stages (referral draft, review decision,
  // send status) still start fresh, since resuming those needs endpoints
  // this pass doesn't touch.
  const resumingRef = useRef(false);
  useEffect(() => {
    const urlCaseId = new URLSearchParams(window.location.search).get("case");
    if (!urlCaseId || caseId || resumingRef.current || pathways.length === 0)
      return;
    resumingRef.current = true;

    (async () => {
      try {
        const c = await getCase(urlCaseId);
        setCaseId(c.id);

        if (c.patient) {
          const [firstName, ...rest] = (c.patient.name || "").split(" ");
          setPatient((prev) => ({
            ...prev,
            firstName: firstName || "",
            lastName: rest.join(" "),
            dob: c.patient.dob ? c.patient.dob.slice(0, 10) : "", // <input type="date"> needs YYYY-MM-DD, not the full ISO datetime
            sex: c.patient.sex || "",
            mrn: c.patient.mrn_token || "",
            phone: c.patient.contact || "",
          }));
        }
        setNotes(c.raw_notes || "");

        const casePathwayId = c.pathways?.[0]?.pathway_id;
        if (casePathwayId) {
          setSelectedPathwayId(casePathwayId);
          const meta = pathways.find((p) => p.id === casePathwayId);
          if (meta) setClinicalCondition(meta.conditionGroup);
          getPathwayDefinition(casePathwayId)
            .then(setPathwayDefinition)
            .catch(() => {});
        }

        const requests = await listExtractions({ caseId: c.id })
          .then((body) => body.data)
          .catch(() => []);
        const latestOfType = (type) =>
          requests
            .filter((r) => r.type === type)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        const extractionReq =
          latestOfType("grounded_extraction") || latestOfType("extraction");
        if (extractionReq) {
          const full = await getExtraction(extractionReq.id).catch(
            () => extractionReq,
          );
          setExtraction(full);
          if (full.result?.items)
            setSections(sectionsFromItems(full.result.items));
        }

        const formFillReq = latestOfType("pathway_form_extraction");
        if (formFillReq)
          setFormFillJob(
            await getExtraction(formFillReq.id).catch(() => formFillReq),
          );

        const imagingReq = latestOfType("imaging_analysis");
        if (imagingReq)
          setImagingJob(
            await getExtraction(imagingReq.id).catch(() => imagingReq),
          );

        const validationReq = latestOfType("pathway_validation");
        if (validationReq)
          setPathwayJob(
            await getExtraction(validationReq.id).catch(() => validationReq),
          );
      } catch (err) {
        setIntakeError(
          err.message || "Could not resume this case from its link.",
        );
      }
    })();
  }, [pathways, caseId]);
  // The referral-routing catalog fetched from the backend (GET
  // /referral-routing/catalog); null falls back to the static
  // referralPathwayCatalog.js import (see PageReferralRouting).
  const [referralCatalog, setReferralCatalog] = useState(null);
  useEffect(() => {
    getReferralRoutingCatalog()
      .then(setReferralCatalog)
      .catch(() => {});
  }, []);

  // AI-assisted description of an uploaded image attachment (e.g. an X-ray) —
  // never a diagnosis. Only the first image-type attachment is analyzed.
  // Polled like an extraction, so it keeps progressing regardless of page.
  const [imagingJob, setImagingJob] = useState(null);

  // Combined extracted text from clinical notes and documents
  const [combinedExtractedText, setCombinedExtractedText] = useState(null);
  // Text extracted specifically from uploaded documents (PDF/DOCX) — shown in the "Document extraction" tab
  const [extractedDocText, setExtractedDocText] = useState(null);

  // Generic signals: deterministic keyword rules (fast, synchronous).
  const [deterministicSignals, setDeterministicSignals] = useState(null);
  // Pathway criteria + red flags: a real AI job — the model judges each one
  // against the extraction (unlike deterministic keyword matching). Polled
  // like an extraction, so it keeps progressing regardless of which page is
  // showing.
  const [pathwayJob, setPathwayJob] = useState(null);
  const [pathwaySubmitError, setPathwaySubmitError] = useState(null);

  const pathwayPending = Boolean(pathwayJob && !isTerminal(pathwayJob.status));
  const pathwayFailed = pathwayJob?.status === "failed";
  const pathwayReady = Boolean(
    pathwayJob?.status === "completed" && pathwayJob.result,
  );

  const pathwaySignal = pathwayReady ? pathwayJob.result : PATHWAY_SIGNAL;
  const genericSignals = deterministicSignals || RULE_SIGNALS;

  // Step 4 of the Alberta routing automation: once the doctor's clinic town
  // resolves to a hub (set on the Dashboard's Profile & routing tab), route to that
  // hub's real specialty clinics instead of the generic mock directory.
  // A referral can override the doctor's default town (e.g. the patient's
  // own town differs) without touching the saved profile setting.
  const [routingTownOverride, setRoutingTownOverride] = useState(null);
  const clinicTownForRouting = routingTownOverride ?? user?.clinic_town;
  const routing = resolveReferralHub(clinicTownForRouting);
  const specialistOptions = routing
    ? routing.specialties.map((name, i) => ({
        id: `${routing.hub}-${i}`,
        name,
        practice: `${routing.hub} · ${routing.zone}`,
        match: `${routing.corridor} corridor`,
        fax: fakeFax(routing.hub, i),
      }))
    : SPECIALISTS;
  const currentIndex = NAV.findIndex((n) => n.id === page);
  const maxVisitedIndex = Math.max(
    ...NAV.map((n, i) => (visited[n.id] ? i : -1)),
  );

  const patientOk = Boolean(
    patient.firstName.trim() && patient.lastName.trim() && patient.dob.trim(),
  );
  const stepOk = computeStepOk({
    patientOk,
    extraction,
    validationOk: pathwayReady,
    decision,
    sendState,
  });
  // The furthest tab reachable by clicking/URL/back-forward: one past the
  // tabs already visited, but never past the first tab that isn't OK yet.
  const maxReachableIndex = Math.min(maxVisitedIndex + 1, frontierOf(stepOk));
  const maxReachableIndexRef = useRef(maxReachableIndex);
  useEffect(() => {
    maxReachableIndexRef.current = maxReachableIndex;
  });

  const showToast = useCallback((m) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  }, []);
  // Unguarded — only for internal forward/back transitions that already
  // passed the current page's own validation (submit handlers, onSent, etc).
  const goTo = useCallback((id) => {
    setPage(id);
    setVisited((v) => ({ ...v, [id]: true }));
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const params = new URLSearchParams(window.location.search);
    params.set("page", id);
    window.history.pushState({ page: id }, "", `?${params.toString()}`);
  }, []);
  const next = () =>
    currentIndex < NAV.length - 1 && goTo(NAV[currentIndex + 1].id);
  const back = () => currentIndex > 0 && goTo(NAV[currentIndex - 1].id);
  // Guarded — for sidebar clicks: refuses to open a tab past one that isn't OK yet.
  const jump = useCallback(
    (id) => {
      const idx = NAV.findIndex((n) => n.id === id);
      if (idx < 0 || idx > maxReachableIndexRef.current) return;
      goTo(id);
    },
    [goTo],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("page") !== page) {
      params.set("page", page);
      window.history.replaceState({ page }, "", `?${params.toString()}`);
    }
    const onPopState = () => {
      const id = pageFromUrl();
      const idx = Math.max(
        0,
        NAV.findIndex((n) => n.id === id),
      );
      const targetId = NAV[Math.min(idx, maxReachableIndexRef.current)].id;
      setPage(targetId);
      setVisited((v) => ({ ...v, [targetId]: true }));
      if (targetId !== id) {
        const p = new URLSearchParams(window.location.search);
        p.set("page", targetId);
        window.history.replaceState({ page: targetId }, "", `?${p.toString()}`);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleCreateCase = useCallback(async () => {
    setIntakeSubmitting(true);
    setIntakeError(null);
    try {
      const user = await getCurrentUser();
      const caseTypes = await listCaseTypes();
      const caseType = caseTypes[0];
      if (!caseType)
        throw new Error(
          "No case type configured on the backend — seed one first.",
        );
      const templates = await listWorkflowTemplates();
      const template =
        templates.find((t) => t.case_type_id === caseType.id) || templates[0];
      if (!template)
        throw new Error(
          "No workflow template configured on the backend — seed one first.",
        );

      const newPatient = await createPatient({
        organization_id: user.organization_id,
        mrn_token: patient.mrn || `MRN-${Date.now()}`,
        name: `${patient.firstName} ${patient.lastName}`.trim(),
        dob: patient.dob || null,
        ...(patient.sex === "male" || patient.sex === "female"
          ? { sex: patient.sex }
          : {}),
        contact: patient.phone || patient.email || null,
      }).catch((err) => {
        console.error("Patient creation error:", err);
        console.error("Patient data being sent:", {
          organization_id: user.organization_id,
          mrn_token: patient.mrn || `MRN-${Date.now()}`,
          name: `${patient.firstName} ${patient.lastName}`.trim(),
          dob: patient.dob || null,
          sex:
            patient.sex === "male" || patient.sex === "female"
              ? patient.sex
              : undefined,
          contact: patient.phone || patient.email || null,
        });
        throw err;
      });

      const hasNotes = Boolean(notes && notes.trim().length >= 10);
      const hasFiles = Boolean(files && files.length > 0);

      if (!hasNotes && !hasFiles) {
        throw new Error(
          "Please provide either a clinical note (at least 10 characters) or upload at least one supporting document.",
        );
      }

      const newCase = await createCase(
        {
          organization_id: user.organization_id,
          patient_id: newPatient.id,
          created_by: user.id,
          case_type_id: caseType.id,
          workflow_template_id: template.id,
          ...(selectedPathwayId ? { pathway_id: selectedPathwayId } : {}),
          status: "created",
          raw_notes: notes || null,
          documents: hasFiles
            ? {
                extracted_text: null,
                file_count: files.length,
              }
            : null,
        },
        files.map((f) => f.file),
      );
      setCaseId(newCase.id);

      // If document attachments were uploaded, extract text from documents (PDF / DOCX)
      let localExtractedDocText = newCase.documents?.[0]?.extracted_text || "";
      const docAttachments = (newCase.attachments || []).filter(
        (a) =>
          a.mime_type === "application/pdf" ||
          a.mime_type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          a.original_filename?.endsWith(".pdf") ||
          a.original_filename?.endsWith(".docx") ||
          a.original_filename?.endsWith(".doc"),
      );

      if (!localExtractedDocText && docAttachments.length > 0) {
        // Trigger document extraction for the document attachments.
        // The backend processes the document synchronously (PDF/DOCX -> text)
        // and returns the extracted_text in the same response as the AI job.
        const docExtractions = await Promise.allSettled(
          docAttachments.map((att) => extractDocument(newCase.id, att.id)),
        );
        console.log("Document extraction responses:", docExtractions);
        // Collect successfully extracted texts from the response
        const extractedTexts = docExtractions
          .filter((r) => r.status === "fulfilled" && r.value?.extracted_text)
          .map((r) => r.value.extracted_text)
          .join("\n\n");
        if (extractedTexts) {
          localExtractedDocText = extractedTexts;
          console.log(
            `Document text extracted (${extractedTexts.length} chars)`,
          );
        } else {
          console.warn(
            "Document extraction returned no text — backend may not support extracted_text yet, or document is not text-based.",
            docExtractions,
          );
        }
      }

      // Persist extracted doc text in state so PageExtraction can show the Document extraction tab
      if (localExtractedDocText) setExtractedDocText(localExtractedDocText);

      // Three options:
      // Option 1: Clinical note only (no documents uploaded)
      // Option 2: Clinical note + documents uploaded -> combine both
      // Option 3: Documents only (no clinical note) -> document text only
      let textForExtraction = "";
      const trimmedNotes = notes ? notes.trim() : "";

      if (hasNotes && (hasFiles || localExtractedDocText)) {
        // Option 2: Clinical note AND documents
        textForExtraction = localExtractedDocText
          ? `CLINICAL NOTES:\n${trimmedNotes}\n\nDOCUMENT TEXT:\n${localExtractedDocText}`
          : trimmedNotes;
        setCombinedExtractedText(
          localExtractedDocText
            ? `CLINICAL NOTES:\n${trimmedNotes}\n\nDOCUMENT TEXT:\n${localExtractedDocText}`
            : trimmedNotes,
        );
      } else if (hasNotes) {
        // Option 1: Clinical note only
        textForExtraction = trimmedNotes;
        setCombinedExtractedText(trimmedNotes);
      } else {
        // Option 3: Documents only (no clinical note)
        // If we have extracted text use it; otherwise show a clear placeholder
        // (not a fake [Document Analysis] string that looks like real content)
        const docPlaceholder = files.length
          ? `[Awaiting text extraction from: ${files.map((f) => f.name).join(", ")}]`
          : "[No clinical text available]";
        textForExtraction = localExtractedDocText || docPlaceholder;
        setCombinedExtractedText(localExtractedDocText || docPlaceholder);
      }

      // Submit grounded extraction
      const queued = await submitExtraction({
        note: textForExtraction,
        pathway,
        caseId: newCase.id,
      });
      setExtraction(queued);

      // Fetch the selected pathway's field definition
      if (selectedPathwayId) {
        getPathwayDefinition(selectedPathwayId)
          .then((def) => {
            setPathwayDefinition(def);
            const fieldCount = def.sections.reduce(
              (n, s) => n + s.fields.length,
              0,
            );
            console.log(
              `Pathway definition loaded: ${def.pathway.name} — ${def.sections.length} sections, ${fieldCount} fields`,
              def,
            );
          })
          .catch(() => {});

        // Pathway form extraction using the same combined text
        submitPathwayFormExtraction({
          note: textForExtraction,
          pathwayId: selectedPathwayId,
          caseId: newCase.id,
        })
          .then(setFormFillJob)
          .catch((err) => {
            console.log(`Pathway form extraction not available:`, err.message);
          });
      }

      const imageAttachment = newCase.attachments?.find((a) =>
        a.mime_type?.startsWith("image/"),
      );
      if (imageAttachment) {
        analyzeAttachment(newCase.id, imageAttachment.id)
          .then(setImagingJob)
          .catch((err) => {
            console.log(`Image analysis not available:`, err.message);
          });
      }

      showToast(
        files.length
          ? `Case created — ${files.length} document${files.length > 1 ? "s" : ""} attached, extraction queued`
          : "Case created — extraction queued",
      );
      next();
    } catch (err) {
      setIntakeError(err.message || "Something went wrong creating the case.");
    } finally {
      setIntakeSubmitting(false);
    }
  }, [patient, pathway, notes, files, next, showToast]);

  const runValidation = useCallback(
    (secs) => {
      // Generic signals: best-effort — a failure here just keeps the RULE_SIGNALS
      // fallback, since the pathway job below is the part that gates progress.
      evaluateRules({ sections: secs, pathway })
        .then((r) => setDeterministicSignals(r.signals))
        .catch(() => {});

      setPathwayJob(null);
      setPathwaySubmitError(null);
      submitPathwayValidation({ sections: secs, pathway })
        .then(setPathwayJob)
        .catch((err) =>
          setPathwaySubmitError(
            err.message || "Could not start AI pathway validation.",
          ),
        );
    },
    [pathway],
  );

  useEffect(() => {
    if (!pathwayJob || isTerminal(pathwayJob.status)) return undefined;
    const id = pathwayJob.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const updated = await getExtraction(id);
        if (!cancelled) setPathwayJob(updated);
      } catch {
        // transient network error — the next tick retries
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathwayJob?.id, pathwayJob?.status]);

  useEffect(() => {
    if (!imagingJob || isTerminal(imagingJob.status)) return undefined;
    const id = imagingJob.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const updated = await getExtraction(id);
        if (!cancelled) setImagingJob(updated);
      } catch {
        // transient network error — the next tick retries
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [imagingJob?.id, imagingJob?.status]);

  useEffect(() => {
    if (!formFillJob || isTerminal(formFillJob.status)) return undefined;
    const id = formFillJob.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const updated = await getExtraction(id);
        if (!cancelled) setFormFillJob(updated);
      } catch {
        // transient network error — the next tick retries
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [formFillJob?.id, formFillJob?.status]);

  // Once the form-fill job completes, overlay its answers onto the
  // selected pathway's form — {code: value}, the same shape
  // clinicalAutoFill.js's client-side heuristic produces, so
  // DynamicClinicalAssessmentForm doesn't need to know which one filled it.
  useEffect(() => {
    if (formFillJob?.status !== "completed" || !selectedPathwayId) return;
    getAutoFill(formFillJob.id, selectedPathwayId)
      .then((data) => {
        setFormFillResult(data);
        const flat = {};
        data.sections.forEach((s) =>
          s.fields.forEach((f) => {
            if (f.value !== null && f.value !== undefined)
              flat[f.code] = f.value;
          }),
        );
        setAiFieldValues(flat);
      })
      .catch(() => {}); // keep the client-side heuristic fallback
  }, [formFillJob?.id, formFillJob?.status, selectedPathwayId]);

  const handleExtractionCompleted = useCallback((secs) => {
    setSections(secs);
    // AI pre-fill for Clinical Assessment happens inside the assessment form
    // itself (computed once per pathway on mount — see
    // DynamicClinicalAssessmentForm / clinicalAutoFill.js), not here, since
    // it depends on which pathway's backend field definition is active.
    //
    // AI pathway validation now runs once the physician leaves Clinical
    // Assessment (see the "clinical-assessment" page below) — not here — so
    // it evaluates against the condition confirmed post-extraction, not a
    // pre-note guess.
  }, []);

  const statusLabel =
    sendState === "sent" ? "Sent" : STATUS_BY_PAGE[page] || "Draft";

  return (
    <div className="mf-app">
      <GlobalStyle />
      <TopBar
        statusLabel={statusLabel}
        stepIndex={currentIndex}
        stepTotal={NAV.length}
        stage={NAV[currentIndex]?.stage}
        onMenuClick={() => setSidebarOpen((v) => !v)}
        user={user}
        onLogout={onLogout}
        onOpenDashboard={onOpenDashboard}
      />

      <div className="mf-body">
        <Sidebar
          nav={NAV}
          page={page}
          visited={visited}
          maxReachableIndex={maxReachableIndex}
          goTo={jump}
          open={sidebarOpen}
          patient={patient}
          pathway={pathway}
          urgency={pathwaySignal.urgency}
        />

        <main className="mf-main">
          <div key={page} className="mf-page-transition">
            {page === "patient" && (
              <PagePatient
                patient={patient}
                setPatient={setPatient}
                onNext={() => {
                  showToast("Patient info saved");
                  next();
                }}
              />
            )}
            {page === "intake" && (
              <PageIntake
                pathways={pathways}
                clinicalCondition={clinicalCondition}
                onChangePathway={(id, conditionGroup) => {
                  setSelectedPathwayId(id);
                  setClinicalCondition(conditionGroup);
                }}
                notes={notes}
                setNotes={setNotes}
                files={files}
                setFiles={setFiles}
                onCreate={handleCreateCase}
                submitting={intakeSubmitting}
                error={intakeError}
                onBack={back}
              />
            )}
            {page === "extraction" && (
              <PageExtraction
                extraction={extraction}
                setExtraction={setExtraction}
                sections={sections}
                setSections={setSections}
                imagingJob={imagingJob}
                formFillJob={formFillJob}
                formFillResult={formFillResult}
                pathwayDefinition={pathwayDefinition}
                combinedExtractedText={combinedExtractedText}
                extractedDocText={extractedDocText}
                onCompleted={handleExtractionCompleted}
                onNext={next}
                onBack={back}
              />
            )}
            {page === "clinical-assessment" && (
              <PageClinicalAssessment
                conditionGroup={clinicalCondition}
                pathways={pathways}
                sections={sections}
                aiFieldValues={aiFieldValues}
                formFillStatus={formFillJob?.status}
                prefetchedDefinition={pathwayDefinition}
                onChangeConditionGroup={setClinicalCondition}
                onNext={() => {
                  runValidation(sections);
                  next();
                }}
                onBack={back}
              />
            )}
            {page === "referral-routing" && (
              <PageReferralRouting
                catalog={referralCatalog}
                caseId={caseId}
                onNext={next}
                onBack={back}
              />
            )}
            {page === "validation" && (
              <PageValidation
                signal={pathwaySignal}
                genericSignals={genericSignals}
                loading={pathwayPending}
                ready={pathwayReady}
                error={
                  pathwaySubmitError ||
                  (pathwayFailed
                    ? pathwayJob.error?.message ||
                      "AI pathway validation failed."
                    : null)
                }
                onRetry={() => runValidation(sections)}
                onNext={() => {
                  showToast("Pathway validated — draft generation next");
                  next();
                }}
                onBack={back}
              />
            )}
            {page === "referral" && (
              <PageReferral
                signal={pathwaySignal}
                letterBody={letterBody}
                setLetterBody={setLetterBody}
                onNext={() => {
                  showToast("Draft passed to physician review");
                  next();
                }}
                onBack={back}
              />
            )}
            {page === "review" && (
              <PageReview
                signal={pathwaySignal}
                letterBody={letterBody}
                sections={sections}
                decision={decision}
                setDecision={setDecision}
                onNext={() => {
                  showToast(
                    "Extraction " +
                      (decision || "approved") +
                      " — routing next",
                  );
                  next();
                }}
                onBack={back}
              />
            )}
            {page === "send" && (
              <PageSend
                letterBody={letterBody}
                specialist={specialist}
                setSpecialist={setSpecialist}
                channel={channel}
                setChannel={setChannel}
                attested={attested}
                setAttested={setAttested}
                sendState={sendState}
                setSendState={setSendState}
                specialistOptions={specialistOptions}
                routing={routing}
                clinicTown={clinicTownForRouting}
                isTownOverridden={routingTownOverride !== null}
                onChangeTown={setRoutingTownOverride}
                onSent={() => {
                  showToast("Referral sent and logged");
                  next();
                }}
                onBack={back}
              />
            )}
            {page === "feedback" && (
              <PageFeedback
                decision={decision}
                channel={channel}
                specialist={specialistOptions.find((s) => s.id === specialist)}
                onBack={back}
              />
            )}
          </div>
        </main>
      </div>

      {toast && (
        <div className="mf-toast">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

function TopBar({
  statusLabel,
  stepIndex,
  stepTotal,
  stage,
  onMenuClick,
  user,
  onLogout,
  onOpenDashboard,
}) {
  const pct = Math.round(((stepIndex + 1) / stepTotal) * 100);
  return (
    <div className="mf-topbar">
      <div className="mf-topbar-inner">
        <div className="mf-topbar-left">
          <button
            className="mf-menu-btn"
            onClick={onMenuClick}
            aria-label="Toggle navigation"
          >
            <Menu size={18} />
          </button>
          <Logo height={20} />
          <span className="mf-crumb">/ {CASE_ID}</span>
        </div>
        <div className="mf-topbar-right">
          <span className="mf-step-count">
            Stage {stage?.[0]} <span className="mf-step-count-of">of 7</span>
          </span>
          <span
            className={`mf-status-pill mf-status-${statusLabel.replace(/\s/g, "-").toLowerCase()}`}
          >
            {statusLabel}
          </span>
          <span className="mf-org-badge">{user?.name || ORG}</span>
          {onOpenDashboard && (
            <button
              className="mf-mini-btn ghost"
              onClick={onOpenDashboard}
              aria-label="Dashboard"
              title="Dashboard"
            >
              <LayoutDashboard size={13} /> Dashboard
            </button>
          )}
          {onLogout && (
            <button
              className="mf-mini-btn ghost"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
      </div>
      <div
        className="mf-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="mf-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function initials(p) {
  return (
    (
      (p.firstName?.trim()[0] || "") + (p.lastName?.trim()[0] || "")
    ).toUpperCase() || "—"
  );
}

function Sidebar({
  nav,
  page,
  visited,
  maxReachableIndex,
  goTo,
  open,
  patient,
  pathway,
  urgency,
}) {
  const currentIdx = nav.findIndex((x) => x.id === page);
  const doneCount = nav.filter(
    (n, i) => visited[n.id] && i < currentIdx,
  ).length;
  const nameValid = patient.firstName?.trim() && patient.lastName?.trim();
  return (
    <>
      <aside className={`mf-sidebar${open ? " open" : ""}`}>
        <div className="mf-sidebar-case">
          <div className="mf-sidebar-case-head">
            <span className="mf-avatar">{initials(patient)}</span>
            <div>
              <p className="mf-sidebar-case-name">
                {nameValid
                  ? `${patient.firstName} ${patient.lastName}`
                  : "New patient"}
              </p>
              <p className="mf-sidebar-case-id">{CASE_ID}</p>
            </div>
          </div>
          <p className="mf-sidebar-case-meta">
            {pathway[0].toUpperCase() + pathway.slice(1)} pathway ·{" "}
            <span
              className={`mf-urgency mf-urgency-${urgency}`}
              style={{ fontSize: 10, padding: "2px 7px" }}
            >
              {urgency}
            </span>
          </p>
        </div>
        <div className="mf-nav-progress">
          <span>Workflow</span>
          <span>
            {doneCount}/{nav.length}
          </span>
        </div>
        <nav className="mf-nav">
          {nav.map((n, i) => {
            const Icon = n.icon;
            const isCurrent = n.id === page;
            const isDone = visited[n.id] && i < currentIdx;
            const reachable = i <= maxReachableIndex;
            const state = isCurrent
              ? "current"
              : isDone
                ? "done"
                : reachable
                  ? "upcoming"
                  : "locked";
            return (
              <button
                key={n.id}
                className={`mf-nav-item is-${state}`}
                onClick={() => reachable && goTo(n.id)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="mf-nav-marker">
                  {isDone ? (
                    <Check size={13} strokeWidth={3} />
                  ) : isCurrent ? (
                    <Icon size={14} />
                  ) : (
                    <span className="mf-nav-num">{i + 1}</span>
                  )}
                </span>
                <span className="mf-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      {open && (
        <div className="mf-sidebar-overlay" onClick={() => goTo(page)} />
      )}
    </>
  );
}

/* ── Stage 1a: Patient ──────────────────────────────────────────────────── */

function PagePatient({ patient, setPatient, onNext }) {
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.value }));
  const nameValid = patient.firstName.trim() && patient.lastName.trim();
  const dobValid = patient.dob.trim().length > 0;
  const canContinue = nameValid && dobValid;
  const submit = () => {
    setTouched(true);
    if (canContinue) onNext();
  };
  const age = (() => {
    const d = new Date(patient.dob);
    if (Number.isNaN(d.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (
      n.getMonth() < d.getMonth() ||
      (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())
    )
      a--;
    return a;
  })();

  return (
    <PageShell
      title="Patient information"
      subhead="Core demographics and coverage. This travels with the case through extraction, the rules engine, and the referral letter — the AI never invents it."
    >
      <PrincipleBanner />
      <div className="mf-two-col">
        <div>
          <Field label="Patient name">
            <div className="mf-input-grid">
              <input
                className="mf-input"
                placeholder="First name"
                value={patient.firstName}
                onChange={set("firstName")}
              />
              <input
                className="mf-input"
                placeholder="Last name"
                value={patient.lastName}
                onChange={set("lastName")}
              />
            </div>
            {touched && !nameValid && (
              <p className="mf-error">
                Enter the patient's first and last name.
              </p>
            )}
          </Field>
          <Field label="Date of birth">
            <div className="mf-input-grid">
              <input
                className="mf-input"
                type="date"
                value={patient.dob}
                onChange={set("dob")}
              />
              <div className="mf-select-wrap">
                <select
                  className="mf-select"
                  value={patient.sex}
                  onChange={set("sex")}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
                <ChevronDown size={16} className="mf-select-icon" />
              </div>
            </div>
            {touched && !dobValid && (
              <p className="mf-error">Date of birth is required.</p>
            )}
          </Field>
          <Field label="Medical record number (MRN)">
            <input
              className="mf-input"
              value={patient.mrn}
              onChange={set("mrn")}
            />
          </Field>
          <Field label="Contact">
            <div className="mf-input-grid">
              <input
                className="mf-input"
                placeholder="Phone"
                value={patient.phone}
                onChange={set("phone")}
              />
              <input
                className="mf-input"
                type="email"
                placeholder="Email"
                value={patient.email}
                onChange={set("email")}
              />
            </div>
            <input
              className="mf-input"
              style={{ marginTop: 10 }}
              placeholder="Home address"
              value={patient.address}
              onChange={set("address")}
            />
          </Field>
          <Field label="Insurance">
            <div className="mf-input-grid">
              <input
                className="mf-input"
                placeholder="Payer / plan"
                value={patient.payer}
                onChange={set("payer")}
              />
              <input
                className="mf-input"
                placeholder="Member ID"
                value={patient.memberId}
                onChange={set("memberId")}
              />
            </div>
          </Field>
          <Field label="Referring / primary care physician">
            <input
              className="mf-input"
              value={patient.pcp}
              onChange={set("pcp")}
            />
          </Field>
        </div>
        <SummaryCard title="Patient">
          <SummaryRow
            k="Name"
            v={
              nameValid
                ? `${patient.firstName} ${patient.lastName}`
                : "Not entered"
            }
          />
          <SummaryRow k="Age" v={age != null ? `${age} yrs` : "—"} />
          <SummaryRow
            k="Sex"
            v={
              patient.sex
                ? patient.sex[0].toUpperCase() + patient.sex.slice(1)
                : "—"
            }
          />
          <SummaryRow k="MRN" v={patient.mrn || "—"} />
          <SummaryRow k="Payer" v={patient.payer || "—"} />
          <SummaryRow
            k="Status"
            v={<StatusPillSmall color="amber">Draft</StatusPillSmall>}
          />
          <button
            className="mf-primary-btn full"
            disabled={!canContinue}
            onClick={submit}
          >
            Continue to case intake <ArrowRight size={15} />
          </button>
          <p className="mf-tiny-note">
            Editable any time before the referral is sent.
          </p>
        </SummaryCard>
      </div>
      <PageNav onNext={submit} nextLabel="Continue to case intake" />
    </PageShell>
  );
}

/* ── Stage 1b: Case intake ─────────────────────────────────────────────── */

function PageIntake({
  pathways,
  clinicalCondition,
  onChangePathway,
  notes,
  setNotes,
  files,
  setFiles,
  onCreate,
  submitting,
  error,
  onBack,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const canSubmit = clinicalCondition && !submitting;

  // Sourced from the database (GET /pathways) once loaded; falls back to
  // the static condition-group list (no real pathway_id yet) so intake
  // still works if the backend is unreachable.
  const fromDb = pathways.length > 0;
  const options = fromDb
    ? pathways.map((p) => ({
        value: p.id,
        label: p.name,
        conditionGroup: p.conditionGroup,
      }))
    : CONDITION_GROUPS.map((c) => ({
        value: c.id,
        label: c.label,
        conditionGroup: c.id,
      }));
  const selectedValue = fromDb
    ? pathways.find((p) => p.conditionGroup === clinicalCondition)?.id || ""
    : clinicalCondition;

  const addFiles = (list) =>
    setFiles((prev) => [
      ...prev,
      ...Array.from(list).map((f) => ({
        id: `${f.name}-${Math.random()}`,
        name: f.name,
        size: f.size,
        file: f,
      })),
    ]);

  return (
    <PageShell
      title="Start a new referral"
      subhead="Paste the visit note. On “Create case” the backend queues an AI extraction job and returns immediately — the note never goes to the model from the browser."
    >
      <div className="mf-two-col">
        <div>
          <Field label="Referral pathway">
            <div className="mf-select-wrap">
              <select
                className="mf-select"
                value={selectedValue}
                onChange={(e) => {
                  const opt = options.find((o) => o.value === e.target.value);
                  if (opt)
                    onChangePathway(
                      fromDb ? opt.value : null,
                      opt.conditionGroup,
                    );
                }}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="mf-select-icon" />
            </div>
          </Field>
          <Field label="Clinical notes">
            <div className="mf-label-row">
              <span />
              <button
                className="mf-inline-link"
                onClick={() => setNotes(SAMPLE_NOTE)}
              >
                Load example note
              </button>
            </div>
            <textarea
              className="mf-textarea"
              placeholder="Paste the visit note: chief complaint, history, exam findings, prior treatment, imaging…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field label="Supporting documents">
            <div
              className={`mf-dropzone${dragOver ? " drag" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                inputRef.current?.click()
              }
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length)
                  addFiles(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={20} color="var(--ink-soft)" />
              <div className="mf-dropzone-title">
                Drop imaging, lab results, or clinical documents here
              </div>
              <div className="mf-dropzone-sub">
                or click to browse — PDF, DOCX, JPG, PNG, WEBP up to 20MB
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp"
                style={{ display: "none" }}
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>
            {files.length > 0 && (
              <div className="mf-filelist">
                {files.map((f) => (
                  <div className="mf-file" key={f.id}>
                    <FileText size={14} color="var(--ink-soft)" />
                    <span className="mf-file-name">{f.name}</span>
                    <button
                      className="mf-file-remove"
                      onClick={() =>
                        setFiles((p) => p.filter((x) => x.id !== f.id))
                      }
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </div>
        <SummaryCard title="Case summary">
          <SummaryRow
            k="Pathway"
            v={options.find((o) => o.value === selectedValue)?.label || "—"}
          />
          <SummaryRow
            k="Notes"
            v={`${notes.trim() ? notes.trim().split(/\s+/).length : 0} words`}
          />
          <SummaryRow k="Attachments" v={files.length} />
          <SummaryRow
            k="Status"
            v={<StatusPillSmall color="amber">Draft</StatusPillSmall>}
          />
          <button
            className="mf-primary-btn full"
            disabled={!canSubmit}
            onClick={() => {
              setTouched(true);
              if (canSubmit) onCreate();
            }}
          >
            {submitting ? "Creating case…" : "Create case & queue extraction"}{" "}
            <ArrowRight size={15} />
          </button>
          {error && <p className="mf-error">{error}</p>}
          <p className="mf-tiny-note">
            <code>POST /api/v1/ai/extractions</code> → 202{" "}
            {'{ id, status: "queued" }'}. A physician approves everything before
            it is sent.
          </p>
        </SummaryCard>
      </div>
      <PageNav
        onBack={onBack}
        onNext={() => {
          setTouched(true);
          if (canSubmit) onCreate();
        }}
        nextLabel={
          submitting ? "Creating case…" : "Create case & queue extraction"
        }
      />
    </PageShell>
  );
}

/* ── Stage 2a: AI extraction ───────────────────────────────────────────── */

function PageExtraction({
  extraction,
  setExtraction,
  sections,
  setSections,
  imagingJob,
  formFillJob,
  formFillResult,
  pathwayDefinition,
  combinedExtractedText,
  extractedDocText,
  onCompleted,
  onNext,
  onBack,
}) {
  const [showNote, setShowNote] = useState(false);
  const [mode, setMode] = useState("extraction"); // extraction | imaging | form_fill | doc_extraction
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasImaging = Boolean(imagingJob); // Only show tab if we have an actual job
  const imagingPending = Boolean(imagingJob && !isTerminal(imagingJob.status));
  const imagingReady = Boolean(
    imagingJob?.status === "completed" && imagingJob.result,
  );
  const imagingFailed = imagingJob?.status === "failed";
  const imagingErrorMessage = imagingFailed
    ? imagingJob.error?.code === "unsupported_modality"
      ? "The AI model currently loaded can't analyze images yet — an admin needs to switch it to a vision-capable model."
      : imagingJob.error?.message || "Imaging analysis failed."
    : null;

  // Pathway-form extraction: the model's own per-field answers for the
  // selected pathway, alongside the generic grounded extraction above. See
  // GET /v1/pathway-form-extractions/{id} (ai-service) via
  // AutoFillController — formFillResult only carries {code, field_type,
  // value}, so field names/option labels are resolved from
  // pathwayDefinition (fetched once at case creation) by code.
  const hasFormFill = Boolean(formFillJob); // Only show tab if we have an actual job
  const formFillPending = Boolean(
    formFillJob && !isTerminal(formFillJob.status),
  );
  const formFillReady = Boolean(
    formFillJob?.status === "completed" && formFillResult,
  );
  const formFillFailed = formFillJob?.status === "failed";
  const formFillErrorMessage = formFillFailed
    ? formFillJob.error?.message || "Pathway form extraction failed."
    : null;
  const fieldMetaByCode = {};
  (pathwayDefinition?.sections || []).forEach((s) =>
    s.fields.forEach((f) => {
      fieldMetaByCode[f.code] = f;
    }),
  );
  const formatFieldValue = (field, value) => {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (field.field_type === "select") {
      return (
        fieldMetaByCode[field.code]?.options?.find((o) => o.value === value)
          ?.label ?? value
      );
    }
    return value;
  };

  const live = Boolean(extraction);
  const r = extraction || AI_REQUEST;
  const pending = live && !isTerminal(r.status);
  const failed = live && r.status === "failed";
  // Live requests are grounded extractions: { items, not_stated }, not the
  // { sections } shape the mock/demo fallback uses. Normalize both into the
  // same {title, content, source_phrase, verbatim} list — that normalized
  // list is exactly `sections` (lifted state), the single editable source of
  // truth used here and everything downstream (Clinical Assessment, Review).
  const items = live ? r.result?.items : GROUNDED.items;
  const notStated = live ? r.result?.not_stated : GROUNDED.not_stated;
  // A terminal, non-failed request should always carry a result — but guard
  // against it anyway (e.g. a stale/deduped response) rather than crash.
  const missingResult = !pending && !failed && !items;

  const editSection = (i, key, val) => {
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)),
    );
    setDirty(true);
  };
  const resetSections = () => {
    setSections(
      live
        ? sectionsFromItems(items)
        : JSON.parse(JSON.stringify(AI_REQUEST.result.sections)),
    );
    setDirty(false);
  };

  useEffect(() => {
    if (!extraction || isTerminal(extraction.status)) return undefined;
    const id = extraction.id;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const updated = await getExtraction(id);
        if (!cancelled) setExtraction(updated);
      } catch {
        // transient network error — the next tick retries
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [extraction?.id, extraction?.status, setExtraction]);

  useEffect(() => {
    if (extraction?.status === "completed" && extraction.result?.items) {
      onCompleted(sectionsFromItems(extraction.result.items));
    }
  }, [extraction, onCompleted]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      setExtraction(await retryExtraction(extraction.id));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <PageShell
      title="AI extraction result"
      subhead="What the AI pulled from the note. It does not diagnose or infer — every value carries the exact source phrase, and the service (not the model) confirms that phrase is really in the note."
      headerRight={
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {dirty && (
            <button className="mf-toggle-link" onClick={resetSections}>
              <RefreshCw size={14} /> Reset to AI output
            </button>
          )}
          <button
            className="mf-toggle-link"
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil size={14} /> {editing ? "Preview" : "Edit"}
          </button>
          <button
            className="mf-toggle-link"
            onClick={() => setShowNote((v) => !v)}
          >
            {showNote ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
            {showNote ? "Hide" : "View"} original note
          </button>
        </div>
      }
    >
      {showNote && (
        <div className="mf-note-box">
          <p className="mf-note-box-title">
            Combined clinical text (notes + documents)
          </p>
          <pre className="mf-mono-block">
            {combinedExtractedText || SAMPLE_NOTE}
          </pre>
        </div>
      )}

      <div className="mf-provenance">
        <span className="mf-prov-pill">
          request <b>{r.id.slice(0, 10)}…</b>
        </span>
        {r.model_id && (
          <span className="mf-prov-pill">
            model <b>{r.model_id}</b>
          </span>
        )}
        {r.prompt_version && (
          <span className="mf-prov-pill">
            prompt <b>{r.prompt_version}</b>
          </span>
        )}
        {r.duration_ms != null && (
          <span className="mf-prov-pill">
            {r.token_count} tokens · {(r.duration_ms / 1000).toFixed(0)}s
          </span>
        )}
        <span className="mf-prov-pill">
          <b>{r.status}</b>
        </span>
      </div>

      {pending && (
        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Extraction {r.status} on {r.model_id || "the model"}… this can take up
          to a minute on CPU. Checking every few seconds.
        </div>
      )}

      {failed && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {r.error?.code === "empty_not"
            ? "The clinical note appears to be empty or too short. Please ensure you've entered a detailed clinical note before extraction."
            : r.error?.code === "ai_reject" || r.error?.code === "ai_rejected"
              ? "The AI service rejected the extraction request. This may be due to content policy, service configuration, or rate limiting. Please contact your system administrator to check the AI service configuration."
              : r.error?.message ||
                "The AI request could not be completed. Please try again or contact support if the issue persists."}
          {r.error?.code &&
            r.error?.code !== "empty_not" &&
            r.error?.code !== "ai_reject" &&
            r.error?.code !== "ai_rejected" && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  color: "var(--ink-soft)",
                }}
              >
                Error code: {r.error.code}
              </span>
            )}
          {r.error?.code !== "ai_reject" && r.error?.code !== "ai_rejected" && (
            <button
              className="mf-inline-link"
              onClick={handleRetry}
              disabled={retrying}
              style={{ marginLeft: 8 }}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {missingResult && !failed && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          This extraction finished without a result. Try again.
          {live && (
            <button
              className="mf-inline-link"
              onClick={handleRetry}
              disabled={retrying}
              style={{ marginLeft: 8 }}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {!pending && !failed && !missingResult && (
        <>
          {(hasImaging || hasFormFill || extractedDocText) && (
            <div className="mf-tabs">
              <button
                className={`mf-tab${mode === "extraction" ? " active" : ""}`}
                onClick={() => setMode("extraction")}
              >
                Extraction
              </button>
              {extractedDocText && (
                <button
                  className={`mf-tab${mode === "doc_extraction" ? " active" : ""}`}
                  onClick={() => setMode("doc_extraction")}
                >
                  Document extraction
                </button>
              )}
              {hasImaging && (
                <button
                  className={`mf-tab${mode === "imaging" ? " active" : ""}`}
                  onClick={() => setMode("imaging")}
                >
                  Imaging findings
                </button>
              )}
              {hasFormFill && (
                <button
                  className={`mf-tab${mode === "form_fill" ? " active" : ""}`}
                  onClick={() => setMode("form_fill")}
                >
                  Pathway form
                </button>
              )}
            </div>
          )}

          {mode === "form_fill" ? (
            <>
              {formFillPending && (
                <div className="mf-info-strip">
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Answering this pathway's form fields from the note… this can
                  take up to a minute on CPU.
                </div>
              )}
              {formFillErrorMessage && (
                <div className="mf-info-strip">
                  <AlertTriangle
                    size={14}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  {formFillErrorMessage}
                </div>
              )}
              {formFillReady && (
                <>
                  <div className="mf-provenance">
                    <span className="mf-prov-pill">
                      pathway <b>{formFillResult.pathway?.name}</b>
                    </span>
                    {(() => {
                      const allFields = formFillResult.sections.flatMap(
                        (s) => s.fields,
                      );
                      const answeredCount = allFields.filter(
                        (f) => f.value !== null && f.value !== undefined,
                      ).length;
                      return (
                        <span className="mf-prov-pill">
                          <b>{answeredCount}</b> of {allFields.length} fields
                          answered by AI
                        </span>
                      );
                    })()}
                  </div>
                  {formFillResult.sections.map((s) => (
                    <Card key={s.code} style={{ marginTop: 8 }}>
                      <p className="mf-section-title">{s.name}</p>
                      {s.fields.map((f) => {
                        const answered =
                          f.value !== null && f.value !== undefined;
                        return (
                          <div
                            key={f.code}
                            className="mf-summary-row"
                            style={{ opacity: answered ? 1 : 0.6 }}
                          >
                            <span className="mf-summary-key">
                              {fieldMetaByCode[f.code]?.name || f.code}
                            </span>
                            {answered ? (
                              <span className="mf-summary-val">
                                {formatFieldValue(f, f.value)}
                              </span>
                            ) : (
                              <span
                                className="mf-verbatim-chip unverified"
                                style={{ fontSize: 11 }}
                              >
                                Not stated
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </Card>
                  ))}
                  <div className="mf-info-strip" style={{ marginTop: 12 }}>
                    <ShieldCheck
                      size={14}
                      style={{ flexShrink: 0, marginTop: 1 }}
                    />
                    Every answer here is re-validated against the field's own
                    type/options before it reaches this page — it also pre-fills
                    Clinical Assessment, but a physician must confirm each value
                    there before it counts. Fields marked "Not stated" were not
                    found in the note.
                  </div>
                </>
              )}
            </>
          ) : mode === "imaging" ? (
            <>
              {imagingPending && (
                <div className="mf-info-strip">
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Analyzing the uploaded image… this can take up to a minute on
                  CPU.
                </div>
              )}
              {imagingErrorMessage && (
                <div className="mf-info-strip">
                  <AlertTriangle
                    size={14}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  {imagingErrorMessage}
                </div>
              )}
              {imagingReady && (
                <>
                  <div className="mf-provenance">
                    <span className="mf-prov-pill">
                      modality <b>{imagingJob.result.modality || "unknown"}</b>
                    </span>
                    <span className="mf-prov-pill">
                      region <b>{imagingJob.result.body_region || "unknown"}</b>
                    </span>
                    {imagingJob.result.model_id && (
                      <span className="mf-prov-pill">
                        model <b>{imagingJob.result.model_id}</b>
                      </span>
                    )}
                  </div>

                  {/* Convert imaging findings to structured items format */}
                  {imagingJob.result.findings?.length ? (
                    <div className="mf-section-list">
                      {imagingJob.result.findings.map((finding, i) => (
                        <div className="mf-section-item" key={i}>
                          <p className="mf-section-title">Finding {i + 1}</p>
                          <p className="mf-section-content">{finding}</p>
                          <span className="mf-verbatim-chip unverified">
                            <AlertTriangle size={11} />
                            AI-assisted interpretation — verify against actual
                            image
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Card style={{ marginTop: 8 }}>
                      <p
                        className="mf-section-content"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        No findings identified from this image.
                      </p>
                    </Card>
                  )}

                  {imagingJob.result.impression && (
                    <div className="mf-section-item" style={{ marginTop: 8 }}>
                      <p className="mf-section-title">Impression</p>
                      <p className="mf-section-content">
                        {imagingJob.result.impression}
                      </p>
                      <span className="mf-verbatim-chip unverified">
                        <AlertTriangle size={11} />
                        AI-assisted interpretation — verify against actual image
                      </span>
                    </div>
                  )}

                  <div className="mf-info-strip" style={{ marginTop: 12 }}>
                    <ShieldCheck
                      size={14}
                      style={{ flexShrink: 0, marginTop: 1 }}
                    />
                    AI-assisted description, not a diagnosis — verify against
                    the actual image before this informs any decision.
                  </div>
                </>
              )}
            </>
          ) : mode === "doc_extraction" ? (
            <>
              <div className="mf-info-strip" style={{ marginTop: 0 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Raw text extracted from your uploaded documents (PDF / DOCX)
                before it was sent to the AI. This is what the AI read from the
                attachments.
              </div>
              <div className="mf-note-box" style={{ marginTop: 8 }}>
                <p className="mf-note-box-title">Extracted document text</p>
                <pre
                  className="mf-mono-block"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {extractedDocText}
                </pre>
              </div>
            </>
          ) : editing ? (
            <div className="mf-fields-view">
              <div className="mf-info-strip">
                <Pencil size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Correct anything the AI got wrong. This is the last edit point
                before the rules engine runs — every edit is captured for the
                feedback dataset.
              </div>
              {sections.map((s, i) => (
                <Card key={i}>
                  <Field label="Section title">
                    <input
                      className="mf-input"
                      value={s.title}
                      onChange={(e) => editSection(i, "title", e.target.value)}
                    />
                  </Field>
                  <Field label="Content">
                    <textarea
                      className="mf-textarea"
                      style={{ minHeight: 60 }}
                      value={s.content}
                      onChange={(e) =>
                        editSection(i, "content", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Source phrase (from the note)">
                    <input
                      className="mf-input"
                      value={(s.source_phrase || "").replace(/\s+/g, " ")}
                      placeholder="No matching phrase in note"
                      onChange={(e) =>
                        editSection(i, "source_phrase", e.target.value)
                      }
                    />
                  </Field>
                  <span
                    className={`mf-verbatim-chip${s.verbatim ? "" : " unverified"}`}
                  >
                    {s.verbatim ? "verbatim ✓" : "unverified ⚠"}
                  </span>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="mf-section-list">
                {sections.map((s, i) => (
                  <div className="mf-section-item" key={i}>
                    <p className="mf-section-title">{s.title}</p>
                    <p className="mf-section-content">{s.content}</p>
                    <span
                      className={`mf-verbatim-chip${s.verbatim ? "" : " unverified"}`}
                    >
                      {s.verbatim ? (
                        <Check size={11} />
                      ) : (
                        <AlertTriangle size={11} />
                      )}
                      {s.source_phrase ? (
                        <>
                          {s.verbatim ? "verbatim" : "unverified"}: “
                          {s.source_phrase.replace(/\s+/g, " ")}”
                        </>
                      ) : (
                        "no matching phrase in note"
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {notStated?.length > 0 && (
                <Card style={{ marginTop: 12 }}>
                  <p className="mf-section-title">Not stated in this note</p>
                  <p
                    className="mf-section-content"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {notStated.join(" · ")}
                  </p>
                </Card>
              )}
              <p className="mf-tiny-note" style={{ marginTop: 12 }}>
                No fixed schema — the section titles are chosen by the model
                from this note's content. A note about a different complaint
                would produce different sections.
              </p>
            </>
          )}
        </>
      )}

      {!pending && !failed && (
        <>
          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Grounding is a trust signal, not a confidence score. An{" "}
            <b>unverified</b> phrase means the model rewrote it — the clinician
            should check that value against the note before it moves downstream.
          </div>

          <div className="mf-actions">
            <button className="mf-primary-btn" onClick={onNext}>
              Continue to clinical assessment <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
      <PageNav
        onBack={onBack}
        onNext={pending || failed || missingResult ? undefined : onNext}
        nextLabel="Continue to clinical assessment"
      />
    </PageShell>
  );
}

/* ── Stage 3: Clinical assessment — condition-specific pathway walkthrough
   feeding a live, deterministic triage result (static logic, no model) ──── */

// Small "AI suggested this — verify or change it" badge, shown next to a
// field's current value only until the physician interacts with that field.
function AiBadge() {
  return (
    <span
      className="mf-ai-tag"
      title="Suggested from the AI extraction — verify or change it"
    >
      <Sparkles size={10} /> AI
    </span>
  );
}

function PillGroup({ label, value, onChange, options, aiValue }) {
  return (
    <Field label={label}>
      <div className="mf-channel-row">
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            className={`mf-channel-btn${value === o.value ? " active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {aiValue === o.value && <AiBadge />}
          </button>
        ))}
      </div>
    </Field>
  );
}

function CheckField({ label, hint, checked, onChange, danger, ai, after }) {
  return (
    <label className={`mf-attest-row${danger ? " gap" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {ai && <AiBadge />}
        {after}
        {hint && (
          <span
            style={{
              display: "block",
              fontSize: 11.5,
              color: "var(--ink-soft)",
            }}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

const MSK_RESULT_TONE = {
  Mild: "sage",
  Moderate: "amber",
  Severe: "clay",
  "Red Flag": "clay",
  Atypical: "amber",
  Routine: "sage",
  Priority: "amber",
  Urgent: "clay",
};

function AlertBanner({ tone = "clay", title, children }) {
  return (
    <div
      className="mf-verdict mf-verdict-gap"
      style={
        tone === "clay"
          ? { background: "var(--clay-soft)", color: "var(--clay)" }
          : undefined
      }
    >
      <AlertTriangle size={16} />
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

function PageClinicalAssessment({
  conditionGroup,
  pathways,
  onChangeConditionGroup,
  sections,
  aiFieldValues,
  formFillStatus,
  prefetchedDefinition,
  onNext,
  onBack,
}) {
  const pathwayMeta = pathways.find((p) => p.conditionGroup === conditionGroup);

  // The form itself comes from the backend (GET /pathways/{id}) rather than
  // a hardcoded per-condition-group config — refetched whenever the tab
  // (i.e. the DB pathway id behind it) changes. `prefetchedDefinition` is
  // whatever handleCreateCase already fetched for the pathway selected at
  // intake — reused as-is when the tab still matches it, so arriving here
  // right after case creation doesn't re-request a definition already in
  // hand. Switching to a different pathway tab still fetches fresh.
  const [definition, setDefinition] = useState(
    prefetchedDefinition?.pathway?.id === pathwayMeta?.id
      ? prefetchedDefinition
      : null,
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
      .catch((err) =>
        setDefError(
          err.message ||
            "Could not load this pathway's clinical assessment form.",
        ),
      );
  }, [pathwayMeta?.id, prefetchedDefinition]);

  return (
    <PageShell
      title="Clinical assessment"
      subhead={
        definition
          ? `${definition.pathway.name} — pre-filled from the AI extraction where the note already says so; every value stays editable. One pathway walkthrough feeds the deterministic triage result below — nothing is asked twice.`
          : "A structured walk-through of the written primary-care pathway for the condition, feeding a deterministic triage result."
      }
    >
      <Field label="Pathway">
        <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
          {CONDITION_GROUPS.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`mf-channel-btn${conditionGroup === c.id ? " active" : ""}`}
              onClick={() => onChangeConditionGroup?.(c.id)}
              style={{ flex: "1 1 150px" }}
            >
              {c.label}
              {!pathways.some((p) => p.conditionGroup === c.id) && (
                <span style={{ opacity: 0.6 }}> (soon)</span>
              )}
            </button>
          ))}
        </div>
      </Field>

      {!pathwayMeta ? (
        <>
          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            No written pathway yet for{" "}
            {CONDITION_GROUPS.find((c) => c.id === conditionGroup)?.label ||
              conditionGroup}{" "}
            — pick another tab above, or continue; the generic rules still
            apply.
          </div>
          <PageNav
            onBack={onBack}
            onNext={onNext}
            nextLabel="Continue to validation & rules"
          />
        </>
      ) : defError ? (
        <>
          <div className="mf-info-strip">
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {defError}
          </div>
          <PageNav
            onBack={onBack}
            onNext={onNext}
            nextLabel="Continue to validation & rules"
          />
        </>
      ) : !definition ? (
        <p className="mf-tiny-note">Loading clinical assessment form…</p>
      ) : (
        <DynamicClinicalAssessmentForm
          key={definition.pathway.id}
          conditionGroup={conditionGroup}
          definition={definition}
          sections={sections}
          aiFieldValues={aiFieldValues}
          formFillStatus={formFillStatus}
          onNext={onNext}
          onBack={onBack}
        />
      )}
    </PageShell>
  );
}

/* ── Stage 3b: Referral routing (full Alberta pathway catalog) ─────────── */

// A destination string's tone for the summary pill — a light heuristic
// over the catalog's free-text destinations, not a separate data field.
function destinationTone(text) {
  if (!text) return "amber";
  if (/neurosurg|oncology|—$/i.test(text)) return "clay";
  if (/zone fast team/i.test(text) && !/hand → plastic|wrist →/i.test(text))
    return "sage";
  return "amber";
}

// Reshapes the backend catalog (GET /referral-routing/catalog) into the
// exact field names the rest of this component uses — the same shape as
// the static referralPathwayCatalog.js fallback, so the JSX below never
// needs to know which source it came from.
function normalizeReferralCatalog(raw) {
  if (!raw) {
    return {
      entryDoors: STATIC_ENTRY_DOORS,
      programContacts: STATIC_PROGRAM_CONTACTS,
      nonUrgentAdviceZones: NON_URGENT_ADVICE_ZONES,
      clinicalPathways: STATIC_CLINICAL_PATHWAYS,
      emergencyIndications: STATIC_EMERGENCY_INDICATIONS,
      urgentIndications: STATIC_URGENT_INDICATIONS,
      reasons: STATIC_ALL_REASONS,
      reasonGroups: STATIC_REASON_GROUPS,
    };
  }
  const programContacts = {};
  const nonUrgentAdviceZones = [];
  for (const [zone, c] of Object.entries(raw.program_contacts || {})) {
    programContacts[zone] = {
      raapid: c.raapid,
      fast: c.fast,
      nonUrgentAdvice: c.non_urgent_advice,
    };
    if (c.non_urgent_advice) nonUrgentAdviceZones.push(zone);
  }
  const emergencyIndications = {};
  const urgentIndications = {};
  for (const pathway of ["ortho", "plastic"]) {
    const e = raw.urgent_indications?.[pathway]?.emergency;
    const u = raw.urgent_indications?.[pathway]?.urgent;
    if (e)
      emergencyIndications[pathway] = {
        examples: e.examples,
        action: e.action_text,
      };
    if (u)
      urgentIndications[pathway] = {
        examples: u.examples,
        zoneRouting: u.zone_routing,
      };
  }
  return {
    entryDoors: (raw.entry_doors || []).map((d) => ({
      id: d.code,
      label: d.label,
      sub: d.description,
    })),
    programContacts,
    nonUrgentAdviceZones,
    clinicalPathways: raw.clinical_pathways || [],
    emergencyIndications,
    urgentIndications,
    reasons: (raw.reasons || []).map((r) => ({
      id: r.id,
      pathway: r.pathway,
      group: r.group_name,
      label: r.label,
      process: r.zone_process,
      wcb: Boolean(r.wcb_required),
      bypass: Boolean(r.is_bypass),
      urgent: Boolean(r.is_urgent),
      weeks: r.acute_weeks,
      fundingNote: r.funding_note,
      sourceConflict: r.source_conflict_note,
      notes: r.notes,
      imaging: r.imaging_items
        ? {
            timeframe: r.imaging_timeframe,
            items: r.imaging_items,
            notes: r.imaging_notes,
          }
        : null,
    })),
    reasonGroups: raw.reason_groups || [],
  };
}

function ReasonSelect({ value, onChange, groups, reasons }) {
  return (
    <div className="mf-select-wrap">
      <select
        className="mf-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select a reason for referral…
        </option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {reasons
              .filter((r) => r.group === g)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={16} className="mf-select-icon" />
    </div>
  );
}

function PageReferralRouting({ catalog, caseId, onNext, onBack }) {
  const data = useMemo(() => normalizeReferralCatalog(catalog), [catalog]);

  const [door, setDoor] = useState(""); // entry door id
  const [urgentPathway, setUrgentPathway] = useState(""); // "ortho" | "plastic" — for emergency/urgent doors
  const [urgentZone, setUrgentZone] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [zone, setZone] = useState("");
  const [wcbStatus, setWcbStatus] = useState(null); // "yes" | "no" | null

  // Prefill from this case's previously saved decision, if any — GET
  // /cases/{id}/referral-routing. Only runs once the real catalog (with
  // real reason UUIDs) has loaded, and only if nothing's been picked yet.
  useEffect(() => {
    if (!caseId || !catalog || door) return;
    getCaseReferralRouting(caseId)
      .then((saved) => {
        if (!saved) return;
        setDoor(saved.door_code || "");
        if (saved.urgent_pathway) setUrgentPathway(saved.urgent_pathway);
        if (saved.door_code === "urgent") setUrgentZone(saved.zone || "");
        else setZone(saved.zone || "");
        if (saved.reason_id) setReasonId(saved.reason_id);
        if (saved.wcb_status) setWcbStatus(saved.wcb_status);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, catalog]);

  const reason = data.reasons.find((r) => r.id === reasonId) || null;
  const destination =
    reason && !reason.bypass && !reason.urgent && zone
      ? reason.process[zone]
      : null;
  const isEdmonton = zone === "Edmonton";
  const needsWcb = Boolean(reason && reason.wcb && zone);

  const pickReason = (id) => {
    setReasonId(id);
    setZone("");
    setWcbStatus(null);
  };
  const pickZone = (z) => {
    setZone(z);
    setWcbStatus(null);
  };

  const referralDone =
    Boolean(reason) &&
    (reason.bypass
      ? true
      : reason.urgent
        ? Boolean(zone)
        : Boolean(zone && destination && (!reason.wcb || wcbStatus)));
  const canContinue =
    door === "emergency"
      ? Boolean(urgentPathway)
      : door === "urgent"
        ? Boolean(urgentPathway && urgentZone)
        : door === "clinical_pathway"
          ? true
          : door === "non_urgent_advice"
            ? true
            : door === "non_urgent_referral"
              ? referralDone
              : false;

  // The "action" behind Continue — persists the decision to
  // POST /cases/{id}/referral-routing. Best-effort: a failed save (offline,
  // or a static-fallback reason id that isn't a real UUID) never blocks
  // moving on, the same way runValidation() doesn't block Clinical
  // Assessment's Next button.
  const handleContinue = () => {
    if (caseId) {
      submitCaseReferralRouting(caseId, {
        door_code: door,
        urgent_pathway:
          door === "emergency" || door === "urgent"
            ? urgentPathway || null
            : null,
        reason_id:
          door === "non_urgent_referral" &&
          reason &&
          !reason.bypass &&
          !reason.urgent
            ? reason.id
            : null,
        zone:
          door === "urgent"
            ? urgentZone || null
            : door === "non_urgent_referral"
              ? zone || null
              : null,
        wcb_status: wcbStatus,
        destination: destination || null,
      }).catch(() => {});
    }
    onNext();
  };

  return (
    <PageShell
      title="Referral routing"
      subhead="Every entry door and reason-for-referral row from Alberta's provincial Orthopedic & Spine and Plastic Surgery pathway PDFs — pick the door, then (for a non-urgent referral) the specific reason; the reason alone determines the zone routing, imaging and WCB requirement. Nothing here is a clinical decision."
    >
      <div className="mf-two-col">
        <div>
          <Field label="Entry door">
            <div className="mf-choice-row" style={{ flexWrap: "wrap" }}>
              {data.entryDoors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`mf-choice${door === d.id ? " active" : ""}`}
                  style={{ flex: "1 1 200px" }}
                  onClick={() => {
                    setDoor(d.id);
                    setUrgentPathway("");
                    setUrgentZone("");
                    setReasonId("");
                    setZone("");
                    setWcbStatus(null);
                  }}
                >
                  <div className="mf-choice-title">{d.label}</div>
                  <div className="mf-choice-sub">{d.sub}</div>
                </button>
              ))}
            </div>
          </Field>

          {(door === "emergency" || door === "urgent") && (
            <>
              <Field label="Pathway">
                <div className="mf-channel-row">
                  {["ortho", "plastic"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`mf-channel-btn${urgentPathway === p ? " active" : ""}`}
                      onClick={() => {
                        setUrgentPathway(p);
                        setUrgentZone("");
                      }}
                    >
                      {p === "ortho" ? "Orthopedic & Spine" : "Plastic Surgery"}
                    </button>
                  ))}
                </div>
              </Field>

              {door === "emergency" && urgentPathway && (
                <div className="mf-verdict mf-verdict-gap">
                  <AlertTriangle size={16} />
                  <div>
                    <div>{data.emergencyIndications[urgentPathway].action}</div>
                    <ul
                      style={{
                        margin: "8px 0 0",
                        paddingLeft: 16,
                        fontSize: 12.5,
                        lineHeight: 1.7,
                      }}
                    >
                      {data.emergencyIndications[urgentPathway].examples.map(
                        (ex) => (
                          <li key={ex}>{ex}</li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {door === "urgent" && urgentPathway && (
                <>
                  <div
                    className="mf-info-strip"
                    style={{ flexDirection: "column", alignItems: "stretch" }}
                  >
                    <span>
                      Indications (
                      {urgentPathway === "ortho"
                        ? "within 4 weeks"
                        : "within 2 weeks"}{" "}
                      of injury):
                    </span>
                    <ul
                      style={{
                        margin: "6px 0 0",
                        paddingLeft: 16,
                        fontSize: 12.5,
                        lineHeight: 1.7,
                      }}
                    >
                      {data.urgentIndications[urgentPathway].examples.map(
                        (ex) => (
                          <li key={ex}>{ex}</li>
                        ),
                      )}
                    </ul>
                  </div>
                  <Field label="Zone">
                    <div
                      className="mf-channel-row"
                      style={{ flexWrap: "wrap" }}
                    >
                      {ZONES.map((z) => (
                        <button
                          key={z}
                          type="button"
                          className={`mf-channel-btn${urgentZone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }}
                          onClick={() => setUrgentZone(z)}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {urgentZone && (
                    <div className="mf-verdict mf-verdict-gap">
                      <Info size={16} />
                      <span>
                        {
                          data.urgentIndications[urgentPathway].zoneRouting[
                            urgentZone
                          ]
                        }
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {door === "clinical_pathway" && (
            <Card>
              <p className="mf-tiny-note" style={{ marginBottom: 8 }}>
                A written clinical pathway may exist for this condition — review
                it for care-option guidance before deciding whether to refer.
              </p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12.5,
                  lineHeight: 1.8,
                }}
              >
                {data.clinicalPathways.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          )}

          {door === "non_urgent_advice" && (
            <div className="mf-verdict mf-verdict-gap">
              <Info size={16} />
              <div>
                <div>
                  eConsult via Alberta Netcare (all zones, response within 5
                  calendar days) — for hand/wrist advice specifically, provided
                  by orthopedic surgeons.
                </div>
                <div style={{ marginTop: 6 }}>
                  ConnectMD phone advice —{" "}
                  <b>{data.nonUrgentAdviceZones.join(" & ")} Zones only</b>:{" "}
                  {data.programContacts.Edmonton?.nonUrgentAdvice}.
                </div>
              </div>
            </div>
          )}

          {door === "non_urgent_referral" && (
            <>
              <Field label="Reason for referral">
                <ReasonSelect
                  value={reasonId}
                  onChange={pickReason}
                  groups={data.reasonGroups}
                  reasons={data.reasons}
                />
              </Field>

              {reason?.bypass && (
                <div className="mf-verdict mf-verdict-gap">
                  <Info size={16} />
                  <span>{reason.fundingNote}</span>
                </div>
              )}

              {reason?.urgent && (
                <>
                  <div className="mf-verdict mf-verdict-gap">
                    <AlertTriangle size={16} />
                    <span>
                      Acute injury — {reason.weeks}-week window.{" "}
                      {reason.notes?.join(" ")}
                    </span>
                  </div>
                  <Field label="Zone">
                    <div
                      className="mf-channel-row"
                      style={{ flexWrap: "wrap" }}
                    >
                      {ZONES.map((z) => (
                        <button
                          key={z}
                          type="button"
                          className={`mf-channel-btn${zone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }}
                          onClick={() => pickZone(z)}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {zone && (
                    <div className="mf-info-strip">
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{data.programContacts[zone]?.raapid}</span>
                    </div>
                  )}
                </>
              )}

              {reason && !reason.bypass && !reason.urgent && (
                <>
                  <Field label="Zone">
                    <div
                      className="mf-channel-row"
                      style={{ flexWrap: "wrap" }}
                    >
                      {ZONES.map((z) => (
                        <button
                          key={z}
                          type="button"
                          className={`mf-channel-btn${zone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }}
                          onClick={() => pickZone(z)}
                        >
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {reason.sourceConflict && (
                    <div className="mf-verdict mf-verdict-gap">
                      <AlertTriangle size={16} />
                      <span>{reason.sourceConflict}</span>
                    </div>
                  )}

                  {reason.fundingNote && (
                    <div className="mf-info-strip">
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{reason.fundingNote}</span>
                    </div>
                  )}

                  {needsWcb && (
                    <Field
                      label={
                        isEdmonton
                          ? "Edmonton Zone — WCB claim related? (must be stated explicitly on the referral letter)"
                          : "Confirm WCB status"
                      }
                    >
                      {!isEdmonton && (
                        <p className="mf-tiny-note" style={{ marginBottom: 6 }}>
                          A referral requires confirming the patient does not
                          qualify for expedited surgery through WCB — WCB
                          patients may or may not be accepted through FAST
                          depending on the zone's surgeon practices.
                        </p>
                      )}
                      <div className="mf-choice-row">
                        <button
                          type="button"
                          className={`mf-choice${wcbStatus === "yes" ? " active" : ""}`}
                          onClick={() => setWcbStatus("yes")}
                        >
                          <div className="mf-choice-title">Yes</div>
                        </button>
                        <button
                          type="button"
                          className={`mf-choice${wcbStatus === "no" ? " active" : ""}`}
                          onClick={() => setWcbStatus("no")}
                        >
                          <div className="mf-choice-title">No</div>
                        </button>
                      </div>
                      {!wcbStatus && (
                        <p className="mf-error">
                          WCB status must be confirmed before this referral can
                          be submitted.
                        </p>
                      )}
                    </Field>
                  )}

                  {reason.notes && (
                    <div
                      className="mf-info-strip"
                      style={{ flexDirection: "column", alignItems: "stretch" }}
                    >
                      {reason.notes.map((n) => (
                        <span key={n}>{n}</span>
                      ))}
                    </div>
                  )}

                  {reason.imaging && (
                    <>
                      <SectionLabel>
                        Required imaging / investigations
                        {reason.imaging.timeframe
                          ? ` — ${reason.imaging.timeframe}`
                          : ""}
                      </SectionLabel>
                      <Card>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 16,
                            fontSize: 12.5,
                            lineHeight: 1.7,
                            color: "var(--ink-soft)",
                          }}
                        >
                          {reason.imaging.items.map((i) => (
                            <li key={i}>{i}</li>
                          ))}
                        </ul>
                      </Card>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <SummaryCard title="Routing result">
          <SummaryRow
            k="Door"
            v={data.entryDoors.find((d) => d.id === door)?.label || "—"}
          />
          {(door === "emergency" || door === "urgent") && (
            <SummaryRow
              k="Pathway"
              v={
                urgentPathway
                  ? urgentPathway === "ortho"
                    ? "Orthopedic & Spine"
                    : "Plastic Surgery"
                  : "—"
              }
            />
          )}
          {door === "urgent" && <SummaryRow k="Zone" v={urgentZone || "—"} />}
          {door === "non_urgent_referral" && (
            <>
              <SummaryRow k="Reason" v={reason?.label || "—"} />
              {reason && !reason.bypass && !reason.urgent && (
                <>
                  <SummaryRow k="Zone" v={zone || "—"} />
                  <SummaryRow
                    k="Destination"
                    v={
                      destination ? (
                        <StatusPillSmall color={destinationTone(destination)}>
                          {destination}
                        </StatusPillSmall>
                      ) : (
                        "—"
                      )
                    }
                  />
                  {needsWcb && (
                    <SummaryRow
                      k="WCB"
                      v={wcbStatus ? wcbStatus.toUpperCase() : "Not confirmed"}
                    />
                  )}
                </>
              )}
              {reason?.bypass && (
                <SummaryRow k="Route" v="Direct to surgeon — no FAST" />
              )}
              {reason?.urgent && (
                <SummaryRow k="Window" v={`${reason.weeks} weeks`} />
              )}
            </>
          )}
        </SummaryCard>
      </div>

      <PageNav
        onBack={onBack}
        onNext={canContinue ? handleContinue : undefined}
        nextLabel="Continue to validation & rules"
      />
    </PageShell>
  );
}

// The rows a "Triage result" readout is made of — rendered twice: inside the
// sticky panel that updates live throughout, and again, plain, as the
// assessment's final step. Both read the same `result`; there is no second
// computation and no second data-entry surface.
function TriageResultRows({ result }) {
  return (
    <>
      <SummaryRow
        k="Condition"
        v={CONDITION_GROUPS.find((c) => c.id === result.conditionGroup)?.label}
      />
      <SummaryRow
        k="Severity"
        v={
          <StatusPillSmall color={MSK_RESULT_TONE[result.severity]}>
            {result.severity}
          </StatusPillSmall>
        }
      />
      <SummaryRow
        k="Urgency"
        v={
          <StatusPillSmall color={MSK_RESULT_TONE[result.urgency]}>
            {result.urgency}
          </StatusPillSmall>
        }
      />
      <SummaryRow k="Referral" v={result.referralAppropriateness} />
      {result.missingInfo.length > 0 && (
        <>
          <p className="mf-summary-title" style={{ marginTop: 14 }}>
            Missing information
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "var(--amber)",
              textAlign: "left",
            }}
          >
            {result.missingInfo.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mf-summary-title" style={{ marginTop: 14 }}>
        Suggested next steps
      </p>
      <ul
        style={{
          margin: 0,
          paddingLeft: 16,
          fontSize: 11.5,
          lineHeight: 1.6,
          color: "var(--ink-soft)",
          textAlign: "left",
        }}
      >
        {result.nextSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </>
  );
}

// Sticky "Triage result" panel — a live readout of the deterministic engine
// (mskTriage.js's runMskTriage), derived entirely from the Clinical
// Assessment answers to its left. Visible from step 1 so severity/urgency
// update live as sections are filled in.
function TriageResultPanel({ result }) {
  const [showLegend, setShowLegend] = useState(false);
  return (
    <SummaryCard
      title={
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          Triage result
          <button
            type="button"
            className="mf-toggle-link"
            style={{ fontSize: 11, fontWeight: 500 }}
            onClick={() => setShowLegend((v) => !v)}
          >
            {showLegend ? "Hide legend" : "What do these mean?"}
          </button>
        </span>
      }
    >
      {showLegend && (
        <div
          style={{
            textAlign: "left",
            fontSize: 11.5,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            padding: "10px 12px",
            margin: "0 0 14px",
          }}
        >
          <p
            style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}
          >
            Urgency
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b>Routine</b> — mild/moderate, no red flags · <b>Priority</b> —
            severe, major functional impairment · <b>Urgent</b> — a red flag
            (infection, trauma, neuro deficit) is present.
          </p>
          <p
            style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}
          >
            Missing information
          </p>
          <p style={{ margin: "0 0 8px" }}>
            What this checks for: symptom duration, severity, functional impact,
            red flags, physical exam, investigations, management attempted,
            comorbidities, medications. A flag means that item hasn't been
            filled in yet.
          </p>
          <p
            style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}
          >
            Referral appropriateness
          </p>
          <p style={{ margin: 0 }}>
            <b>Appropriate</b> — meets pathway criteria ·{" "}
            <b>Not appropriate yet</b> — conservative management not yet tried ·{" "}
            <b>Urgent referral required</b> — a red flag ·{" "}
            <b>Consider alternative diagnosis</b> — pattern is atypical.
          </p>
        </div>
      )}
      <TriageResultRows result={result} />
    </SummaryCard>
  );
}

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
    symptoms: {
      painPattern: "",
      numbnessTingling: false,
      mechanicalSymptoms: false,
      sleepDisruption: "",
      functionalImpact: "",
    },
    redFlagActive: triggeredRedFlags.length > 0,
    redFlagLabels: triggeredRedFlags.map(
      (f) => f.red_flag_category?.name || f.name,
    ),
    exam: {
      rom: "",
      strengthDeficit: "",
      deformityAtrophy: false,
      thenarAtrophy: false,
      thumbWeakness: false,
      frozenShoulder: false,
      motorDeficit: false,
    },
    investigations: { imaging: values.IMAGING_CHOICE ? "done" : "", labs: "" },
    management: { tried: "", weeks: "", response: "" },
    comorbidities: "",
    medications: "",
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

function DynamicClinicalAssessmentForm({
  conditionGroup,
  definition,
  sections,
  aiFieldValues,
  formFillStatus,
  onNext,
  onBack,
}) {
  const sectionByCode = Object.fromEntries(
    definition.sections.map((s) => [s.code, s]),
  );

  // Computed once per mount — this component is remounted (via `key`, the
  // pathway's DB id) every time the pathway tab changes, so there's no
  // stale-suggestion risk. This client-side heuristic (clinicalAutoFill.js)
  // is the immediate suggestion; the backend's LLM-driven pathway-form
  // extraction (below) supersedes it field-by-field once it arrives.
  const [aiFilled, setAiFilled] = useState(() =>
    inferClinicalFieldsFromSections(definition, sections),
  );
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
    Boolean(field.ai_mapping) &&
    !(field.code in aiFilled) &&
    !touchedCodes.current.has(field.code);
  const NotAddressedHint = ({ field }) =>
    notAiAddressed(field) ? (
      <span
        className="mf-tiny-note"
        style={{ marginLeft: 8, fontStyle: "italic" }}
      >
        not addressed in note
      </span>
    ) : null;

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
    const untouched = Object.entries(aiFieldValues).filter(
      ([code, incoming]) => {
        if (touchedCodes.current.has(code)) return false;
        if (aiFilled[code] === false && incoming === true) return false;
        return true;
      },
    );
    if (untouched.length === 0) return;
    setValues((prev) => ({ ...prev, ...Object.fromEntries(untouched) }));
    setAiFilled((prev) => ({ ...prev, ...Object.fromEntries(untouched) }));
  }, [aiFieldValues]);

  // Step 1 — Eligibility: defaults to true (assumed eligible unless told
  // otherwise) same as before this was ever AI-fillable — keyword_bag can
  // only ever assert `true`, never contradict it, so wiring this to
  // values/aiFilled mainly adds the AI badge when the note does support it.
  const eligibilityField = sectionByCode.eligibility?.fields[0];
  const eligible = eligibilityField
    ? (values[eligibilityField.code] ?? true)
    : true;

  // Step 2 — History & details: pathway-specific fields plus the shared
  // triage-relevant (GEN_*) fields that used to be asked a second time on
  // the old MSK Triage page. Grouping is by field-code convention, not a
  // per-pathway config, so it needs no changes when a pathway's fields do.
  const [historyDone, setHistoryDone] = useState(false);
  const historyFields = sectionByCode.history?.fields || [];
  const pathwaySelects = historyFields.filter(
    (f) => f.field_type === "select" && !f.code.startsWith("GEN_"),
  );
  const symptomFields = historyFields.filter((f) =>
    f.code.startsWith("SYMPTOM_"),
  );
  const comorbField = historyFields.find((f) => f.code === "COMORBIDITIES");
  const genSelects = historyFields.filter(
    (f) => f.code.startsWith("GEN_") && f.field_type === "select",
  );
  const genChecks = historyFields.filter(
    (f) => f.code.startsWith("GEN_") && f.field_type === "checkbox",
  );

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
  const anatomicalDetail =
    anatomicalValue &&
    anatomicalField.display_config?.options_detail?.[anatomicalValue];
  // Same gate the pathway walkthrough always used to reveal imaging +
  // management together — now reveals every remaining section (Examination
  // onward) as one continuous block.
  const restRevealed = anatomicalField
    ? Boolean(anatomicalValue)
    : redFlagsDone;

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
  const injectionFields = managementFields.filter((f) =>
    f.code.startsWith("INJECTION_"),
  );
  const checklistFields = managementFields.filter(
    (f) => f.field_type === "checkbox" && !f.code.startsWith("INJECTION_"),
  );
  const managementSelects = managementFields.filter(
    (f) => f.field_type === "select",
  );
  const managementNumbers = managementFields.filter(
    (f) => f.field_type === "number",
  );
  const managementTexts = managementFields.filter(
    (f) => f.field_type === "text",
  );

  // Step 8 — Final assessment
  const finalFields = sectionByCode.final_assessment?.fields || [];
  const atypicalCheckbox = finalFields.find((f) => f.field_type === "checkbox");
  const atypicalText = finalFields.find((f) => f.field_type === "text");

  const result = runMskTriage(
    buildTriageInput(conditionGroup, values, triggeredFlags),
  );

  return (
    <div className="mf-two-col">
      <div>
        {formFillStatus && !isTerminal(formFillStatus) && (
          <p className="mf-tiny-note">
            AI is reading the note for this pathway's fields — suggestions below
            will update as they arrive…
          </p>
        )}
        {aiCount > 0 && (
          <div className="mf-ai-banner">
            <span>
              <Sparkles
                size={13}
                style={{ verticalAlign: -2, marginRight: 6 }}
              />
              {aiCount} field{aiCount === 1 ? "" : "s"} pre-filled from the AI
              extraction — review each before continuing.
            </span>
            <button
              type="button"
              className="mf-mini-btn ghost"
              onClick={clearAllAiSuggestions}
            >
              Clear AI suggestions
            </button>
          </div>
        )}

        <SectionLabel>1. Initial eligibility</SectionLabel>
        <Card>
          {eligibilityField && (
            <>
              <CheckField
                label={eligibilityField.name}
                checked={eligible}
                ai={eligibilityField.code in aiFilled}
                onChange={(v) => setValue(eligibilityField.code, v)}
              />
              {!eligible && eligibilityField.display_config?.warning && (
                <div className="mf-info-strip" style={{ marginTop: 10 }}>
                  <AlertTriangle
                    size={14}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
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
                  <PillGroup
                    key={f.code}
                    label={f.name}
                    value={values[f.code]}
                    aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)}
                    options={f.options}
                  />
                ))}
              </div>
              {symptomFields.length > 0 && (
                <Field label="Symptoms — check all that apply">
                  {symptomFields.map((f) => (
                    <CheckField
                      key={f.code}
                      label={f.name}
                      checked={Boolean(values[f.code])}
                      ai={f.code in aiFilled}
                      after={<NotAddressedHint field={f} />}
                      onChange={(v) => setValue(f.code, v)}
                    />
                  ))}
                </Field>
              )}

              <div className="mf-field-grid" style={{ marginTop: 12 }}>
                {genSelects.map((f) => (
                  <PillGroup
                    key={f.code}
                    label={f.name}
                    value={values[f.code]}
                    aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)}
                    options={f.options}
                  />
                ))}
              </div>
              {genChecks.map((f) => (
                <CheckField
                  key={f.code}
                  label={f.name}
                  checked={Boolean(values[f.code])}
                  ai={f.code in aiFilled}
                  after={<NotAddressedHint field={f} />}
                  onChange={(v) => setValue(f.code, v)}
                />
              ))}

              {comorbField && (
                <Field
                  label={
                    <>
                      {comorbField.name}{" "}
                      {aiFilled[comorbField.code] !== undefined && <AiBadge />}
                    </>
                  }
                >
                  <input
                    type="text"
                    className="mf-input"
                    style={{
                      width: "100%",
                      maxWidth: 420,
                      boxSizing: "border-box",
                    }}
                    placeholder={comorbField.display_config?.placeholder}
                    value={values[comorbField.code] || ""}
                    onChange={(e) => setValue(comorbField.code, e.target.value)}
                  />
                </Field>
              )}
              {!historyDone && (
                <button
                  className="mf-primary-btn"
                  onClick={() => setHistoryDone(true)}
                  style={{ marginTop: 4 }}
                >
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
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-soft)",
                  margin: "0 0 12px",
                }}
              >
                Check any that apply based on history and exam. Any selection
                drives the triage result to Urgent.
              </p>
              <div
                className="mf-info-strip"
                style={{
                  margin: "0 0 12px",
                  background: "transparent",
                  border: "1px dashed #E3B8B4",
                  color: "var(--clay)",
                }}
              >
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />A
                checked box marked "AI" is only ever a confirmed match or an
                explicit denial in the note — never a guess. Confirm every one
                against your own reading of the note and exam before continuing.
              </div>
              <div className="mf-field-grid">
                {redFlagFields.map((f) => (
                  <div
                    key={f.code}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r-sm)",
                      padding: "10px 12px",
                    }}
                  >
                    <CheckField
                      label={f.name}
                      danger
                      hint={f.red_flag_category?.description}
                      checked={Boolean(values[f.code])}
                      ai={f.code in aiFilled}
                      after={<NotAddressedHint field={f} />}
                      onChange={(v) => setValue(f.code, v)}
                    />
                  </div>
                ))}
              </div>
              {triggeredFlags.map((f) => (
                <AlertBanner
                  key={f.code}
                  tone={toneForSeverity(f.red_flag_category?.severity)}
                  title={`${f.red_flag_category?.name || f.name} — action required`}
                >
                  {f.red_flag_category?.action ||
                    "Escalate per this pathway's guidance."}
                </AlertBanner>
              ))}
              {!redFlagsDone && (
                <button
                  className="mf-primary-btn"
                  onClick={() => setRedFlagsDone(true)}
                  style={{ marginTop: 12 }}
                >
                  {triggeredFlags.length > 0
                    ? "Acknowledged — continue anyway"
                    : "No red flags — continue"}{" "}
                  <ArrowRight size={15} />
                </button>
              )}
            </Card>
          </>
        )}

        {redFlagsDone && anatomicalField && (
          <>
            <SectionLabel>
              {anatomicalStepNum}. {anatomicalSection.name}
            </SectionLabel>
            <Card>
              <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
                {anatomicalField.options.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={`mf-channel-btn${anatomicalValue === o.value ? " active" : ""}`}
                    onClick={() => setValue(anatomicalField.code, o.value)}
                    style={{ flex: "1 1 140px" }}
                  >
                    {o.label}
                    {aiFilled[anatomicalField.code] === o.value && <AiBadge />}
                  </button>
                ))}
              </div>
              <NotAddressedHint field={anatomicalField} />
              {anatomicalDetail && (
                <div style={{ marginTop: 14 }}>
                  <p className="mf-section-title">
                    Differential diagnoses —{" "}
                    {
                      anatomicalField.options.find(
                        (o) => o.value === anatomicalValue,
                      )?.label
                    }
                  </p>
                  <ul
                    style={{
                      margin: "6px 0 0",
                      paddingLeft: 18,
                      fontSize: 13,
                      lineHeight: 1.7,
                    }}
                  >
                    {(anatomicalDetail.differentials || []).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
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
                {examFields
                  .filter((f) => f.field_type === "select")
                  .map((f) => (
                    <PillGroup
                      key={f.code}
                      label={f.name}
                      value={values[f.code]}
                      aiValue={aiFilled[f.code]}
                      onChange={(v) => setValue(f.code, v)}
                      options={f.options}
                    />
                  ))}
              </div>
              {examFields
                .filter((f) => f.field_type === "checkbox")
                .map((f) => (
                  <CheckField
                    key={f.code}
                    label={f.name}
                    checked={Boolean(values[f.code])}
                    ai={f.code in aiFilled}
                    after={<NotAddressedHint field={f} />}
                    onChange={(v) => setValue(f.code, v)}
                  />
                ))}
            </Card>

            <SectionLabel>{investigationsStepNum}. Investigations</SectionLabel>
            <Card>
              {investigationFields
                .filter((f) => f.field_type === "select")
                .map((f) => (
                  <PillGroup
                    key={f.code}
                    label={f.name}
                    value={values[f.code]}
                    aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)}
                    options={f.options}
                  />
                ))}
            </Card>

            <SectionLabel>{managementStepNum}. Management</SectionLabel>
            <Card>
              <p className="mf-section-title">
                Conservative / non-operative plan
              </p>
              <div className="mf-field-grid">
                {checklistFields.map((f) => (
                  <CheckField
                    key={f.code}
                    label={f.name}
                    checked={Boolean(values[f.code])}
                    ai={f.code in aiFilled}
                    after={<NotAddressedHint field={f} />}
                    onChange={(v) => setValue(f.code, v)}
                  />
                ))}
              </div>

              {injectionFields.length > 0 && (
                <>
                  <p className="mf-section-title" style={{ marginTop: 14 }}>
                    Injection considerations
                  </p>
                  {injectionFields.map((f) => (
                    <div key={f.code}>
                      <CheckField
                        label={f.name}
                        checked={Boolean(values[f.code])}
                        ai={f.code in aiFilled}
                        after={<NotAddressedHint field={f} />}
                        onChange={(v) => setValue(f.code, v)}
                      />
                      {f.display_config?.warning && values[f.code] && (
                        <div
                          className="mf-verdict mf-verdict-gap"
                          style={{
                            background: "var(--clay-soft)",
                            color: "var(--clay)",
                            marginTop: 4,
                            marginBottom: 8,
                          }}
                        >
                          <AlertTriangle size={14} /> {f.display_config.warning}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              <p className="mf-section-title" style={{ marginTop: 14 }}>
                Conservative management trial
              </p>
              <div className="mf-field-grid">
                {managementSelects.map((f) => (
                  <PillGroup
                    key={f.code}
                    label={f.name}
                    value={values[f.code]}
                    aiValue={aiFilled[f.code]}
                    onChange={(v) => setValue(f.code, v)}
                    options={f.options}
                  />
                ))}
                {managementNumbers.map((f) => (
                  <Field
                    key={f.code}
                    label={
                      <>
                        {f.name} {aiFilled[f.code] !== undefined && <AiBadge />}
                      </>
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      className="mf-input"
                      style={{ width: 120 }}
                      value={values[f.code] || ""}
                      onChange={(e) => setValue(f.code, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              {managementTexts.map((f) => (
                <Field
                  key={f.code}
                  label={
                    <>
                      {f.name} {aiFilled[f.code] !== undefined && <AiBadge />}
                    </>
                  }
                >
                  <textarea
                    className="mf-textarea"
                    style={{ minHeight: 56 }}
                    value={values[f.code] || ""}
                    onChange={(e) => setValue(f.code, e.target.value)}
                  />
                </Field>
              ))}

              {definition.follow_up && (
                <div className="mf-info-strip" style={{ marginTop: 16 }}>
                  <ScrollText
                    size={14}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  {definition.follow_up}
                </div>
              )}
              <button
                className="mf-ghost-btn"
                onClick={() => window.print()}
                style={{ marginTop: 12 }}
              >
                Print summary
              </button>
            </Card>

            <SectionLabel>{finalStepNum}. Final assessment</SectionLabel>
            <Card>
              {atypicalCheckbox && (
                <CheckField
                  label={atypicalCheckbox.name}
                  hint="Overlaps with neuropathy, cervical radiculopathy, RA, hip OA, piriformis, etc."
                  checked={Boolean(values[atypicalCheckbox.code])}
                  ai={atypicalCheckbox.code in aiFilled}
                  after={<NotAddressedHint field={atypicalCheckbox} />}
                  onChange={(v) => setValue(atypicalCheckbox.code, v)}
                />
              )}
              {atypicalCheckbox &&
                values[atypicalCheckbox.code] &&
                atypicalText && (
                  <Field label={atypicalText.name}>
                    <input
                      type="text"
                      className="mf-input"
                      style={{ maxWidth: 320 }}
                      placeholder="e.g. neurology, rheumatology, spine, hip"
                      value={values[atypicalText.code] || ""}
                      onChange={(e) =>
                        setValue(atypicalText.code, e.target.value)
                      }
                    />
                  </Field>
                )}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid var(--line)",
                }}
              >
                <p className="mf-summary-title" style={{ marginBottom: 8 }}>
                  Triage result
                </p>
                <TriageResultRows result={result} />
              </div>
            </Card>
          </>
        )}

        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Deterministic decision support only — not a diagnosis. A physician
          must review every field and finding before proceeding.
        </div>

        <PageNav
          onBack={onBack}
          onNext={onNext}
          nextLabel="Continue to validation & rules"
        />
      </div>

      <TriageResultPanel result={result} />
    </div>
  );
}

/* ── Stage 3b: Clinical validation + Rules Engine ───────────────────────── */

function PageValidation({
  signal,
  genericSignals,
  loading,
  error,
  ready,
  onRetry,
  onNext,
  onBack,
}) {
  return (
    <PageShell
      title="Clinical validation & rules"
      subhead="AI-assisted pathway check. A language model reads the extraction and judges it against the knee referral pathway's criteria and red flags (app/services/pathways/knee.yaml) — not keyword matching, an actual reading of each item. Urgency and missing criteria are still derived deterministically from those judgments. Generic signals below stay keyword-based. A physician must verify every finding before proceeding."
    >
      {loading && (
        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Running AI pathway validation… this can take up to a minute on CPU.
        </div>
      )}
      {error && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
          <button
            className="mf-inline-link"
            onClick={onRetry}
            style={{ marginLeft: 8 }}
          >
            Retry
          </button>
        </div>
      )}
      <div className="mf-provenance">
        <span className="mf-prov-pill">
          pathway <b>{signal.title}</b>
        </span>
        <span className="mf-prov-pill">
          matched pack <b>{String(signal.matched)}</b>
        </span>
        {ready && signal.model_id && (
          <span className="mf-prov-pill">
            model <b>{signal.model_id}</b>
          </span>
        )}
        {ready && signal.duration_seconds != null && (
          <span className="mf-prov-pill">
            {signal.token_count} tokens · {Math.round(signal.duration_seconds)}s
          </span>
        )}
        <span className={`mf-urgency mf-urgency-${signal.urgency}`}>
          {signal.urgency}
        </span>
      </div>

      <div
        className={`mf-verdict mf-verdict-${signal.urgency === "routine" ? "clean" : "gap"}`}
      >
        {signal.urgency === "routine" ? (
          <ShieldCheck size={16} />
        ) : (
          <AlertTriangle size={16} />
        )}
        {urgencyCopy[signal.urgency]}
      </div>

      <SectionLabel>Referral criteria for this pathway</SectionLabel>
      <Card>
        {signal.criteria.map((c) => (
          <div className="mf-criterion-row" key={c.id}>
            <span
              className={`mf-criterion-mark ${c.met ? "met" : c.required ? "missing" : "optional"}`}
            >
              {c.met ? "✓" : c.required ? "!" : "–"}
            </span>
            <div className="mf-criterion-body">
              <span className="mf-criterion-label">{c.label}</span>
              {!c.required && (
                <span className="mf-criterion-req">optional</span>
              )}
              {c.required && !c.met && (
                <span
                  className="mf-criterion-req"
                  style={{ color: "var(--clay)" }}
                >
                  required — missing
                </span>
              )}
              {c.evidence && (
                <span className="mf-criterion-ev">matched: “{c.evidence}”</span>
              )}
            </div>
          </div>
        ))}
      </Card>

      <SectionLabel>Red-flag screening</SectionLabel>
      <Card>
        {[
          "Locked knee / true mechanical locking",
          "Unable to weight-bear",
          "Possible septic joint (hot, swollen, febrile)",
          "Acute significant trauma / suspected fracture",
        ].map((rf) => {
          const hit = signal.red_flags.some((x) =>
            x.toLowerCase().includes(rf.split(" ")[0].toLowerCase()),
          );
          return (
            <div className="mf-redflag-row" key={rf}>
              <span className={hit ? "mf-redflag-hit" : ""}>
                {hit ? "⚠" : "○"}
              </span>
              <span className={hit ? "mf-redflag-hit" : ""}>
                {rf} — {hit ? "PRESENT" : "not detected"}
              </span>
            </div>
          );
        })}
      </Card>

      <SectionLabel>Generic signals</SectionLabel>
      <Card>
        {genericSignals.map((s) => (
          <RuleRow
            key={s.rule}
            met={s.outcome}
            label={`${s.rule}: ${s.outcome ? "yes" : "no"}`}
            detail={s.detail}
          />
        ))}
      </Card>

      {signal.missing.length > 0 && (
        <div className="mf-verdict mf-verdict-gap">
          <AlertTriangle size={16} />
          <span>
            Missing before referral: <b>{signal.missing.join("; ")}</b> — the
            specialist is likely to return this without it.
          </span>
        </div>
      )}

      <PageNav
        onBack={onBack}
        onNext={ready && !loading ? onNext : undefined}
        nextLabel="Generate referral draft"
      />
    </PageShell>
  );
}

/* ── Stage 4: Referral draft ───────────────────────────────────────────── */

function PageReferral({ signal, letterBody, setLetterBody, onNext, onBack }) {
  const [editing, setEditing] = useState(false);
  return (
    <PageShell
      title="Referral draft"
      subhead="The Document Generation Engine renders the approved extraction into the pathway template — a deterministic Jinja2 render, no free-form AI writing. Nothing here is a clinical decision."
      headerRight={
        <button
          className="mf-toggle-link"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil size={14} /> {editing ? "Preview" : "Edit draft"}
        </button>
      }
    >
      <div className="mf-meta-row">
        <MetaPill k="Template" v="Knee — orthopaedic referral" />
        <MetaPill k="Urgency" v={signal.urgency} />
        <MetaPill k="Status" v="For review" />
      </div>

      <div className="mf-toolbar">
        <button
          className="mf-tool-btn"
          onClick={() => setLetterBody(REFERRAL_DRAFT)}
        >
          <RefreshCw size={13} /> Regenerate from approved data
        </button>
      </div>

      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <div className="mf-letter-date">10 September 2026</div>
        {editing ? (
          <textarea
            className="mf-edit-textarea"
            value={letterBody}
            onChange={(e) => setLetterBody(e.target.value)}
          />
        ) : (
          <pre
            className="mf-letter-body"
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            {letterBody}
          </pre>
        )}
        <div className="mf-letter-attach">
          <Paperclip size={13} /> Knee_XRay_WeightBearing_Report.pdf
        </div>
      </div>

      <div className="mf-info-strip">
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The <b>PATHWAY CHECK</b> block is the rules‑engine output embedded
        verbatim — the specialist sees exactly which criteria were met and which
        (if any) are missing.
      </div>

      <PageNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Send to physician review"
      />
    </PageShell>
  );
}

/* ── Stage 5: Physician review & authorisation ─────────────────────────── */

function PageReview({
  signal,
  letterBody,
  sections,
  decision,
  setDecision,
  onNext,
  onBack,
}) {
  const [showNote, setShowNote] = useState(false);
  const original = sections || AI_REQUEST.result.sections;

  return (
    <PageShell
      title="Physician review & authorisation"
      subhead="Everything below is a proposal from the pipeline. The physician confirms it against the source note, then approves, edits, or rejects — and that decision seeds the feedback dataset."
      headerRight={
        <button
          className="mf-toggle-link"
          onClick={() => setShowNote((v) => !v)}
        >
          {showNote ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
          {showNote ? "Hide" : "View"} original note
        </button>
      }
    >
      {showNote && (
        <div className="mf-note-box">
          <p className="mf-note-box-title">Original visit note</p>
          <pre className="mf-mono-block">{SAMPLE_NOTE}</pre>
        </div>
      )}

      <Accordion
        title="AI extraction"
        badge={`${original.length} sections · all grounded`}
        tone="sage"
      >
        <ul>
          {original.map((s, i) => (
            <li key={i}>
              <b>{s.title}:</b> {s.content}
            </li>
          ))}
        </ul>
      </Accordion>
      <Accordion
        title="Pathway check"
        badge={`${signal.urgency} · ${signal.complete ? "complete" : "gap"}`}
        tone={signal.urgency === "routine" ? "sage" : "amber"}
      >
        <ul>
          {signal.criteria.map((c) => (
            <li key={c.id}>
              {c.met ? "✓" : "✗"} {c.label}
              {c.required ? "" : " (optional)"}
            </li>
          ))}
          <li>
            Red flags:{" "}
            {signal.red_flags.length ? signal.red_flags.join("; ") : "none"}
          </li>
        </ul>
      </Accordion>
      <Accordion
        title="Referral draft"
        badge="deterministic template"
        tone="sage"
      >
        <pre
          className="mf-mono-block"
          style={{ maxHeight: 200, overflow: "auto" }}
        >
          {letterBody}
        </pre>
      </Accordion>

      <SectionLabel>Your decision</SectionLabel>
      <div className="mf-choice-row">
        {[
          [
            "approved",
            "Approve",
            "Extraction and draft are accurate — proceed to routing.",
          ],
          [
            "edited",
            "Approve with edits",
            "You corrected the extraction — the edits are recorded.",
          ],
          [
            "rejected",
            "Reject",
            "Send back for re-extraction or manual handling.",
          ],
        ].map(([k, t, s]) => (
          <button
            key={k}
            className={`mf-choice${decision === k ? " active" : ""}`}
            onClick={() => setDecision(k)}
          >
            <div className="mf-choice-title">{t}</div>
            <div className="mf-choice-sub">{s}</div>
          </button>
        ))}
      </div>

      <div className="mf-info-strip">
        <ScrollText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The decision is posted to <code>/v1/feedback</code> with the model +
        prompt version. The raw note is never stored — only a hash — so the
        dataset is de‑identified from the start.
      </div>

      <PageNav
        onBack={onBack}
        onNext={decision ? onNext : undefined}
        nextLabel={
          decision === "rejected" ? "Return case" : "Continue to routing"
        }
      />
      {!decision && (
        <p className="mf-tiny-note" style={{ textAlign: "right" }}>
          Choose a decision to continue.
        </p>
      )}
    </PageShell>
  );
}

/* ── Stage 6: Route & send ─────────────────────────────────────────────── */

function PageSend({
  letterBody,
  specialist,
  setSpecialist,
  channel,
  setChannel,
  attested,
  setAttested,
  sendState,
  setSendState,
  specialistOptions,
  routing,
  clinicTown,
  isTownOverridden,
  onChangeTown,
  onSent,
  onBack,
}) {
  const [open, setOpen] = useState(false);
  const [editingTown, setEditingTown] = useState(false);
  const selected = specialistOptions.find((s) => s.id === specialist);
  const canSend = attested && !!specialist && sendState === "idle";

  const applyTownChange = (value) => {
    onChangeTown(value || null);
    setSpecialist(""); // the hub may have changed — don't leave a stale clinic selected
    setEditingTown(false);
  };
  const resetTown = () => {
    onChangeTown(null);
    setSpecialist("");
    setEditingTown(false);
  };
  const send = () => {
    if (!canSend) return;
    setSendState("sending");
    window.setTimeout(() => {
      setSendState("sent");
      onSent();
    }, 1100);
  };

  if (sendState === "sent") {
    return (
      <PageShell title="Referral sent and logged" subhead="">
        <div className="mf-sent-card">
          <div className="mf-sent-icon">
            <Check size={18} />
          </div>
          <h3 className="mf-sent-title">Sent to {selected?.name}</h3>
          <p className="mf-sent-body">
            {selected?.practice}. The full pipeline trace — extraction, rules,
            draft, and your authorisation — is attached to the case's immutable
            audit log.
          </p>
          <div className="mf-sent-meta">
            <div>
              <span>Case</span>
              <span>{CASE_ID}</span>
            </div>
            <div>
              <span>Channel</span>
              <span>
                {channel === "fax"
                  ? "Secure e-fax"
                  : channel === "message"
                    ? "Encrypted message"
                    : "REST API"}
              </span>
            </div>
            {selected?.fax && (
              <div>
                <span>Fax</span>
                <span>{selected.fax}</span>
              </div>
            )}
            <div>
              <span>Status</span>
              <span>Awaiting delivery confirmation</span>
            </div>
          </div>
        </div>
        <PageNav
          onBack={onBack}
          onNext={onSent}
          nextLabel="View feedback & audit"
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Route & send"
      subhead="Pick the specialist and channel. The Communication Engine transmits the approved package — the referral is not editable past this point."
    >
      <SectionLabel>Draft (approved)</SectionLabel>
      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <pre
          className="mf-letter-body"
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          {letterBody}
        </pre>
      </div>

      <SectionLabel>Specialist</SectionLabel>
      <div
        className="mf-info-strip"
        style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {routing ? (
            <MapPin size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <span>
            {routing ? (
              <>
                {isTownOverridden
                  ? "Routed for this referral from"
                  : "Auto-routed from your clinic in"}{" "}
                <b>{clinicTown}</b> → <b>{routing.hub}</b> ({routing.zone}).
              </>
            ) : (
              "Set a clinic town to auto-route to the correct AHS referral hub — showing a generic directory for now."
            )}{" "}
            <button
              type="button"
              className="mf-toggle-link"
              style={{ display: "inline", padding: 0 }}
              onClick={() => setEditingTown((v) => !v)}
            >
              {editingTown ? "Cancel" : routing ? "Change" : "Set a town"}
            </button>
            {isTownOverridden && !editingTown && (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  className="mf-toggle-link"
                  style={{ display: "inline", padding: 0 }}
                  onClick={resetTown}
                >
                  Use my profile town
                </button>
              </>
            )}
          </span>
        </div>
        {editingTown && (
          <div className="mf-select-wrap" style={{ maxWidth: 360 }}>
            <select
              className="mf-select"
              value={ALL_ALBERTA_TOWNS.includes(clinicTown) ? clinicTown : ""}
              onChange={(e) => applyTownChange(e.target.value)}
              autoFocus
            >
              <option value="" disabled>
                Select a town — grouped by AHS referral hub
              </option>
              {ALBERTA_REFERRAL_HUBS.map((hub) => (
                <optgroup key={hub.id} label={`${hub.name} — ${hub.zone}`}>
                  {hub.towns.map((entry) => {
                    const name = typeof entry === "string" ? entry : entry.name;
                    const rawNote =
                      typeof entry === "string" ? null : entry.note;
                    const resolved = resolveReferralHub(name);
                    // A town split across hubs (e.g. Camrose) is listed once,
                    // under its actual primary hub — not duplicated with a
                    // different label under the alternate hub too.
                    if (resolved.hub !== hub.name) return null;
                    const hint = rawNote || resolved.alternates[0]?.condition;
                    return (
                      <option key={name} value={name}>
                        {hint ? `${name} — ${hint}` : name}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={16} className="mf-select-icon" />
          </div>
        )}
      </div>
      <div className="mf-specialist-wrap">
        <button
          className={`mf-specialist-trigger${!selected ? " placeholder" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          {selected
            ? `${selected.name} — ${selected.practice}`
            : "Select a specialist"}{" "}
          <ChevronDown size={15} />
        </button>
        {open && (
          <div className="mf-specialist-menu">
            {specialistOptions.map((s) => (
              <button
                key={s.id}
                className="mf-specialist-option"
                onClick={() => {
                  setSpecialist(s.id);
                  setOpen(false);
                }}
              >
                <div>
                  {s.name} <span className="mf-match-chip">{s.match}</span>
                </div>
                <div className="mf-specialist-meta">
                  {s.practice} ·{" "}
                  {s.fax ? `fax ${s.fax}` : `accepts ${s.accepts}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionLabel>Channel</SectionLabel>
      <div className="mf-channel-row">
        {["fax", "message", "api"].map((c) => (
          <button
            key={c}
            className={`mf-channel-btn${channel === c ? " active" : ""}`}
            onClick={() => setChannel(c)}
          >
            {c === "fax"
              ? "Secure e-fax"
              : c === "message"
                ? "Encrypted message"
                : "REST API"}
          </button>
        ))}
      </div>

      <div className="mf-attest-box">
        <label className="mf-attest-row">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          I have reviewed this referral against the original note and authorise
          it to be sent.
        </label>
      </div>

      <div className="mf-page-nav">
        <button className="mf-ghost-btn" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <button className="mf-primary-btn" disabled={!canSend} onClick={send}>
          {sendState === "sending" ? (
            <>
              <RefreshCw size={14} className="mf-spin" /> Sending…
            </>
          ) : (
            <>
              Send referral <Send size={15} />
            </>
          )}
        </button>
      </div>
    </PageShell>
  );
}

/* ── Stage 7: Feedback & audit ─────────────────────────────────────────── */

function PageFeedback({ decision, channel, specialist, onBack }) {
  const fb = { ...FEEDBACK_RECORD, decision: decision || "approved" };
  return (
    <PageShell
      title="Feedback & audit trail"
      subhead="The case is closed. The physician's decision is now a de-identified training example, and every step is on the immutable audit log."
    >
      <SectionLabel>Continuous-learning record</SectionLabel>
      <Card>
        <SummaryRow
          k="Decision"
          v={
            <StatusPillSmall
              color={fb.decision === "rejected" ? "amber" : "sage"}
            >
              {fb.decision}
            </StatusPillSmall>
          }
        />
        <SummaryRow k="Model" v={fb.model_id} />
        <SummaryRow k="Prompt version" v={fb.prompt_version} />
        <SummaryRow k="Reviewer" v={fb.reviewer} />
        <SummaryRow
          k="Note"
          v={
            <span className="mf-grounded-phrase">
              hash {fb.note_hash.slice(0, 16)}… (raw note not stored)
            </span>
          }
        />
        {fb.decision === "edited" && <SummaryRow k="Comment" v={fb.comment} />}
      </Card>

      {fb.decision === "edited" && (
        <>
          <SectionLabel>What the physician changed</SectionLabel>
          <div className="mf-feedback-diff">
            Aggravating Factors:{"\n"}
            <span className="del"> Climbing stairs, prolonged standing</span>
            {"\n"}
            <span className="add">
              {" "}
              Climbing stairs; prolonged standing at work
            </span>
          </div>
        </>
      )}

      <div className="mf-info-strip">
        <GitBranch size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Edits feed the pipeline{" "}
        <b>
          physician edits → anonymisation → dataset → evaluation → fine-tuning
        </b>
        . No automatic retraining — the dataset is built for human-reviewed
        evaluation first.
      </div>

      <SectionLabel>Case audit log</SectionLabel>
      <Card>
        {[
          ["15:19", "Case created", `${CASE_ID} · knee pathway`],
          [
            "15:20",
            "AI extraction queued",
            "POST /api/v1/ai/extractions → 202",
          ],
          [
            "15:20",
            "Extraction completed",
            "8 sections, all grounded · medgemma-1.5-4b",
          ],
          [
            "15:21",
            "Rules evaluated",
            `pathway=knee urgency=${PATHWAY_SIGNAL.urgency}`,
          ],
          ["15:21", "Draft generated", "Knee referral template"],
          ["15:24", `Physician ${fb.decision}`, `${fb.reviewer}`],
          [
            "15:25",
            "Referral sent",
            `${channel} → ${specialist?.name ?? "specialist"}`,
          ],
        ].map(([t, ev, d], i) => (
          <div className="mf-summary-row" key={i}>
            <span className="mf-summary-key">
              {t} · {ev}
            </span>
            <span
              className="mf-summary-val"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11.5,
              }}
            >
              {d}
            </span>
          </div>
        ))}
      </Card>

      <SectionLabel>Where this sits in the platform</SectionLabel>
      <Card>
        {MODULES.map((m) => (
          <div className="mf-summary-row" key={m.n}>
            <span className="mf-summary-key">
              {m.here ? "▸ " : ""}Module {m.n} — {m.name}
            </span>
            <span
              className="mf-summary-val"
              style={{
                color: m.here ? "var(--blue)" : "var(--ink-soft)",
                fontSize: 12,
              }}
            >
              {m.here ? "shown in this demo" : m.role}
            </span>
          </div>
        ))}
      </Card>

      <PageNav onBack={onBack} />
    </PageShell>
  );
}

/* ── Reusable bits ─────────────────────────────────────────────────────── */

function PrincipleBanner() {
  return (
    <div className="mf-principle-banner">
      <ShieldCheck
        size={17}
        style={{ flexShrink: 0, marginTop: 1, color: "var(--blue)" }}
      />
      <span>
        <b>Guiding principle.</b> {GUIDING_PRINCIPLE}
      </span>
    </div>
  );
}

function PageShell({ title, subhead, headerRight, children }) {
  return (
    <div className="mf-page">
      <div className="mf-page-head">
        <h1 className="mf-page-title">{title}</h1>
        {headerRight}
      </div>
      {subhead && <p className="mf-page-subhead">{subhead}</p>}
      {children}
    </div>
  );
}

function PageNav({ onBack, onNext, nextLabel }) {
  return (
    <div className="mf-page-nav">
      {onBack ? (
        <button className="mf-ghost-btn" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button className="mf-primary-btn" onClick={onNext}>
          {nextLabel} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mf-field">
      <label className="mf-label">{label}</label>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return <p className="mf-section-label">{children}</p>;
}
function Card({ children, style }) {
  return (
    <div className="mf-card" style={style}>
      {children}
    </div>
  );
}

function RuleRow({ label, detail, met }) {
  return (
    <div className="mf-rule-row">
      <span className={`mf-rule-dot ${met ? "pass" : "fail"}`}>
        {met ? (
          <Check size={11} strokeWidth={3} />
        ) : (
          <AlertTriangle size={10} />
        )}
      </span>
      <span className="mf-rule-text">
        {label}
        {detail && <span className="mf-rule-detail">{detail}</span>}
      </span>
    </div>
  );
}

function SummaryCard({ title, children }) {
  return (
    <div className="mf-summary-card">
      <p className="mf-summary-title">{title}</p>
      {children}
    </div>
  );
}
function SummaryRow({ k, v }) {
  return (
    <div className="mf-summary-row">
      <span className="mf-summary-key">{k}</span>
      <span className="mf-summary-val">{v}</span>
    </div>
  );
}
function StatusPillSmall({ children, color }) {
  return (
    <span className={`mf-status-pill-sm mf-status-pill-${color}`}>
      {children}
    </span>
  );
}
function MetaPill({ k, v }) {
  return (
    <span className="mf-meta-pill">
      {k} <b>{v}</b>
    </span>
  );
}

function Accordion({ title, badge, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mf-accordion">
      <button className="mf-accordion-head" onClick={() => setOpen((v) => !v)}>
        <span className="mf-accordion-title">
          {title}
          <span className={`mf-accordion-badge mf-tone-${tone}`}>{badge}</span>
        </span>
        <ChevronDown
          size={16}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .15s",
          }}
        />
      </button>
      {open && <div className="mf-accordion-body">{children}</div>}
    </div>
  );
}
