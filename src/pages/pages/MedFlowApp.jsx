import { useState, useRef, useCallback, useEffect } from "react";
import { Check } from "lucide-react";
import { TopBar } from "../components/TopBar.jsx";
import { Sidebar } from "../components/Sidebar.jsx";
import { PagePatient } from "./wizard/PagePatient.jsx";
import { PageIntake } from "./wizard/PageIntake.jsx";
import { PageExtraction } from "./wizard/PageExtraction.jsx";
import { PageClinicalAssessment } from "./wizard/PageClinicalAssessment.jsx";
import { PageReferralRouting } from "./wizard/PageReferralRouting.jsx";
import { PageValidation } from "./wizard/PageValidation.jsx";
import { PageReferral } from "./wizard/PageReferral.jsx";
import { PageReview } from "./wizard/PageReview.jsx";
import { PageSend } from "./wizard/PageSend.jsx";
import { PageFeedback } from "./wizard/PageFeedback.jsx";
import {
  NAV, fakeFax, sectionsFromItems, pageFromUrl, visitedThrough,
  computeStepOk, frontierOf, initialPage,
} from "../lib/wizardState.js";
import { resolveReferralHub } from "../lib/albertaReferralRouting.js";
import {
  getCurrentUser, listCaseTypes, listWorkflowTemplates, createPatient, createCase, getCase,
  submitExtraction, submitPathwayFormExtraction, getAutoFill, getExtraction, listExtractions,
  isTerminal, evaluateRules, submitPathwayValidation, analyzeAttachment, extractDocument,
  listPathways, getPathwayDefinition, getReferralRoutingCatalog,
} from "../lib/api.js";
import {
  AI_REQUEST, PATHWAY_SIGNAL, PATIENT_DEFAULTS, RULE_SIGNALS, REFERRAL_DRAFT, SPECIALISTS,
} from "../data/mockData.js";

/* ────────────────────────────────────────────────────────────────────────
   MedFlow — static walkthrough of the referral workflow.

   Nothing here calls a server. Every AI / rules / draft object is shaped
   exactly like the real backend + ai-service contract (see mockData.js) so
   the UI is faithful to the pipeline without a model behind it.
──────────────────────────────────────────────────────────────────────── */

// `pathway` is the ai-service-facing name used by Validation & rules
// (app/services/pathways/{knee,shoulder,spine}.yaml — only these 3 packs
// exist today); `clinicalCondition` is the Clinical Assessment condition
// group (16 values, matches CONDITION_GROUPS). This map feeds the
// confirmed/selected condition group into the ai-service name where one
// exists; conditions with no YAML pack yet are left unmapped, and
// Validation & rules falls back to its generic rules for them.
const PATHWAY_BY_CONDITION_GROUP = { knee: "knee", shoulder: "shoulder", lumbar: "spine" };

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
  patient: "Draft", intake: "Draft",
  extraction: "Extracting",
  "clinical-assessment": "Triaging", "referral-routing": "Routing", validation: "Validating",
  referral: "Draft ready", review: "Pending review",
  send: "Pending review", feedback: "Completed",
};

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
      .then((list) => setPathways(list.map((p) => ({ ...p, conditionGroup: PATHWAY_CODE_TO_CONDITION_GROUP[p.code] }))))
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
  const [sections, setSections] = useState(() => JSON.parse(JSON.stringify(AI_REQUEST.result.sections)));
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
    window.history.replaceState(window.history.state, "", `?${params.toString()}`);
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
    if (!urlCaseId || caseId || resumingRef.current || pathways.length === 0) return;
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
          getPathwayDefinition(casePathwayId).then(setPathwayDefinition).catch(() => {});
        }

        const requests = await listExtractions({ caseId: c.id })
          .then((body) => body.data)
          .catch(() => []);
        const latestOfType = (type) => requests
          .filter((r) => r.type === type)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        const extractionReq = latestOfType("grounded_extraction") || latestOfType("extraction");
        if (extractionReq) {
          const full = await getExtraction(extractionReq.id).catch(() => extractionReq);
          setExtraction(full);
          if (full.result?.items) setSections(sectionsFromItems(full.result.items));
        }

        const formFillReq = latestOfType("pathway_form_extraction");
        if (formFillReq) setFormFillJob(await getExtraction(formFillReq.id).catch(() => formFillReq));

        const imagingReq = latestOfType("imaging_analysis");
        if (imagingReq) setImagingJob(await getExtraction(imagingReq.id).catch(() => imagingReq));

        const validationReq = latestOfType("pathway_validation");
        if (validationReq) setPathwayJob(await getExtraction(validationReq.id).catch(() => validationReq));
      } catch (err) {
        setIntakeError(err.message || "Could not resume this case from its link.");
      }
    })();
  }, [pathways, caseId]);
  // The referral-routing catalog fetched from the backend (GET
  // /referral-routing/catalog); null falls back to the static
  // referralPathwayCatalog.js import (see PageReferralRouting).
  const [referralCatalog, setReferralCatalog] = useState(null);
  useEffect(() => {
    getReferralRoutingCatalog().then(setReferralCatalog).catch(() => {});
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
  const pathwayReady = Boolean(pathwayJob?.status === "completed" && pathwayJob.result);

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
  const maxVisitedIndex = Math.max(...NAV.map((n, i) => (visited[n.id] ? i : -1)));

  const patientOk = Boolean(patient.firstName.trim() && patient.lastName.trim() && patient.dob.trim());
  const stepOk = computeStepOk({ patientOk, extraction, validationOk: pathwayReady, decision, sendState });
  // The furthest tab reachable by clicking/URL/back-forward: one past the
  // tabs already visited, but never past the first tab that isn't OK yet.
  const maxReachableIndex = Math.min(maxVisitedIndex + 1, frontierOf(stepOk));
  const maxReachableIndexRef = useRef(maxReachableIndex);
  useEffect(() => { maxReachableIndexRef.current = maxReachableIndex; });

  const showToast = useCallback((m) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);
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
  const next = () => currentIndex < NAV.length - 1 && goTo(NAV[currentIndex + 1].id);
  const back = () => currentIndex > 0 && goTo(NAV[currentIndex - 1].id);
  // Guarded — for sidebar clicks: refuses to open a tab past one that isn't OK yet.
  const jump = useCallback((id) => {
    const idx = NAV.findIndex((n) => n.id === id);
    if (idx < 0 || idx > maxReachableIndexRef.current) return;
    goTo(id);
  }, [goTo]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("page") !== page) {
      params.set("page", page);
      window.history.replaceState({ page }, "", `?${params.toString()}`);
    }
    const onPopState = () => {
      const id = pageFromUrl();
      const idx = Math.max(0, NAV.findIndex((n) => n.id === id));
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
      if (!caseType) throw new Error("No case type configured on the backend — seed one first.");
      const templates = await listWorkflowTemplates();
      const template = templates.find((t) => t.case_type_id === caseType.id) || templates[0];
      if (!template) throw new Error("No workflow template configured on the backend — seed one first.");

      const newPatient = await createPatient({
        organization_id: user.organization_id,
        mrn_token: patient.mrn || `MRN-${Date.now()}`,
        name: `${patient.firstName} ${patient.lastName}`.trim(),
        dob: patient.dob || null,
        ...(patient.sex === "male" || patient.sex === "female" ? { sex: patient.sex } : {}),
        contact: patient.phone || patient.email || null,
      }).catch((err) => {
        console.error('Patient creation error:', err);
        console.error('Patient data being sent:', {
          organization_id: user.organization_id,
          mrn_token: patient.mrn || `MRN-${Date.now()}`,
          name: `${patient.firstName} ${patient.lastName}`.trim(),
          dob: patient.dob || null,
          sex: patient.sex === "male" || patient.sex === "female" ? patient.sex : undefined,
          contact: patient.phone || patient.email || null,
        });
        throw err;
      });

      const hasNotes = Boolean(notes && notes.trim().length >= 10);
      const hasFiles = Boolean(files && files.length > 0);

      if (!hasNotes && !hasFiles) {
        throw new Error("Please provide either a clinical note (at least 10 characters) or upload at least one supporting document.");
      }

      const newCase = await createCase({
        organization_id: user.organization_id,
        patient_id: newPatient.id,
        created_by: user.id,
        case_type_id: caseType.id,
        workflow_template_id: template.id,
        ...(selectedPathwayId ? { pathway_id: selectedPathwayId } : {}),
        status: "created",
        raw_notes: notes || null,
        documents: hasFiles ? {
          extracted_text: null,
          file_count: files.length,
        } : null,
      }, files.map((f) => f.file));
      setCaseId(newCase.id);

      // If document attachments were uploaded, extract text from documents (PDF / DOCX)
      let localExtractedDocText = newCase.documents?.[0]?.extracted_text || "";
      const docAttachments = (newCase.attachments || []).filter((a) =>
        a.mime_type === "application/pdf" ||
        a.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        a.original_filename?.endsWith(".pdf") ||
        a.original_filename?.endsWith(".docx") ||
        a.original_filename?.endsWith(".doc")
      );

      if (!localExtractedDocText && docAttachments.length > 0) {
        // Trigger document extraction for the document attachments.
        // The backend processes the document synchronously (PDF/DOCX -> text)
        // and returns the extracted_text in the same response as the AI job.
        const docExtractions = await Promise.allSettled(
          docAttachments.map((att) => extractDocument(newCase.id, att.id))
        );
        console.log("Document extraction responses:", docExtractions);
        // Collect successfully extracted texts from the response
        const extractedTexts = docExtractions
          .filter((r) => r.status === "fulfilled" && r.value?.extracted_text)
          .map((r) => r.value.extracted_text)
          .join("\n\n");
        if (extractedTexts) {
          localExtractedDocText = extractedTexts;
          console.log(`Document text extracted (${extractedTexts.length} chars)`);
        } else {
          console.warn("Document extraction returned no text — backend may not support extracted_text yet, or document is not text-based.", docExtractions);
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
            : trimmedNotes
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
          ? `[Awaiting text extraction from: ${files.map(f => f.name).join(", ")}]`
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
            const fieldCount = def.sections.reduce((n, s) => n + s.fields.length, 0);
            console.log(`Pathway definition loaded: ${def.pathway.name} — ${def.sections.length} sections, ${fieldCount} fields`, def);
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

      const imageAttachment = newCase.attachments?.find((a) => a.mime_type?.startsWith("image/"));
      if (imageAttachment) {
        analyzeAttachment(newCase.id, imageAttachment.id)
          .then(setImagingJob)
          .catch((err) => {
            console.log(`Image analysis not available:`, err.message);
          });
      }

      showToast(files.length
        ? `Case created — ${files.length} document${files.length > 1 ? "s" : ""} attached, extraction queued`
        : "Case created — extraction queued");
      next();
    } catch (err) {
      setIntakeError(err.message || "Something went wrong creating the case.");
    } finally {
      setIntakeSubmitting(false);
    }
  }, [patient, pathway, notes, files, next, showToast]);

  const runValidation = useCallback((secs) => {
    // Generic signals: best-effort — a failure here just keeps the RULE_SIGNALS
    // fallback, since the pathway job below is the part that gates progress.
    evaluateRules({ sections: secs, pathway })
      .then((r) => setDeterministicSignals(r.signals))
      .catch(() => {});

    setPathwayJob(null);
    setPathwaySubmitError(null);
    submitPathwayValidation({ sections: secs, pathway })
      .then(setPathwayJob)
      .catch((err) => setPathwaySubmitError(err.message || "Could not start AI pathway validation."));
  }, [pathway]);

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
    return () => { cancelled = true; clearInterval(t); };
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
    return () => { cancelled = true; clearInterval(t); };
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
    return () => { cancelled = true; clearInterval(t); };
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
        data.sections.forEach((s) => s.fields.forEach((f) => {
          if (f.value !== null && f.value !== undefined) flat[f.code] = f.value;
        }));
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

  const statusLabel = sendState === "sent" ? "Sent" : (STATUS_BY_PAGE[page] || "Draft");

  return (
    <div className="mf-app">
      <TopBar statusLabel={statusLabel} stepIndex={currentIndex} stepTotal={NAV.length}
        stage={NAV[currentIndex]?.stage} onMenuClick={() => setSidebarOpen((v) => !v)}
        user={user} onLogout={onLogout} onOpenDashboard={onOpenDashboard} />

      <div className="mf-body">
        <Sidebar nav={NAV} page={page} visited={visited} maxReachableIndex={maxReachableIndex}
          goTo={jump} open={sidebarOpen} patient={patient} pathway={pathway} urgency={pathwaySignal.urgency} />

        <main className="mf-main">
          <div key={page} className="mf-page-transition">
            {page === "patient" && (
              <PagePatient patient={patient} setPatient={setPatient}
                onNext={() => { showToast("Patient info saved"); next(); }} />
            )}
            {page === "intake" && (
              <PageIntake pathways={pathways} clinicalCondition={clinicalCondition}
                onChangePathway={(id, conditionGroup) => { setSelectedPathwayId(id); setClinicalCondition(conditionGroup); }}
                notes={notes} setNotes={setNotes}
                files={files} setFiles={setFiles}
                onCreate={handleCreateCase} submitting={intakeSubmitting} error={intakeError}
                onBack={back} />
            )}
            {page === "extraction" && (
              <PageExtraction extraction={extraction} setExtraction={setExtraction}
                sections={sections} setSections={setSections}
                imagingJob={imagingJob}
                formFillJob={formFillJob} formFillResult={formFillResult} pathwayDefinition={pathwayDefinition}
                combinedExtractedText={combinedExtractedText}
                extractedDocText={extractedDocText}
                onCompleted={handleExtractionCompleted} onNext={next} onBack={back} />
            )}
            {page === "clinical-assessment" && (
              <PageClinicalAssessment conditionGroup={clinicalCondition} pathways={pathways} sections={sections}
                aiFieldValues={aiFieldValues} formFillStatus={formFillJob?.status}
                prefetchedDefinition={pathwayDefinition}
                onChangeConditionGroup={setClinicalCondition}
                onNext={() => { runValidation(sections); next(); }} onBack={back} />
            )}
            {page === "referral-routing" && (
              <PageReferralRouting catalog={referralCatalog} caseId={caseId} onNext={next} onBack={back} />
            )}
            {page === "validation" && (
              <PageValidation signal={pathwaySignal} genericSignals={genericSignals}
                loading={pathwayPending} ready={pathwayReady}
                error={pathwaySubmitError || (pathwayFailed ? (pathwayJob.error?.message || "AI pathway validation failed.") : null)}
                onRetry={() => runValidation(sections)}
                onNext={() => { showToast("Pathway validated — draft generation next"); next(); }} onBack={back} />
            )}
            {page === "referral" && (
              <PageReferral signal={pathwaySignal} letterBody={letterBody} setLetterBody={setLetterBody}
                onNext={() => { showToast("Draft passed to physician review"); next(); }} onBack={back} />
            )}
            {page === "review" && (
              <PageReview signal={pathwaySignal} letterBody={letterBody} sections={sections}
                decision={decision} setDecision={setDecision}
                onNext={() => { showToast("Extraction " + (decision || "approved") + " — routing next"); next(); }}
                onBack={back} />
            )}
            {page === "send" && (
              <PageSend letterBody={letterBody} specialist={specialist} setSpecialist={setSpecialist}
                channel={channel} setChannel={setChannel} attested={attested} setAttested={setAttested}
                sendState={sendState} setSendState={setSendState}
                specialistOptions={specialistOptions} routing={routing} clinicTown={clinicTownForRouting}
                isTownOverridden={routingTownOverride !== null} onChangeTown={setRoutingTownOverride}
                onSent={() => { showToast("Referral sent and logged"); next(); }} onBack={back} />
            )}
            {page === "feedback" && (
              <PageFeedback decision={decision} channel={channel}
                specialist={specialistOptions.find((s) => s.id === specialist)} onBack={back} />
            )}
          </div>
        </main>
      </div>

      {toast && <div className="mf-toast"><Check size={14} /> {toast}</div>}
    </div>
  );
}
