import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Sparkles, ShieldCheck, FileSignature, UserCheck, User, Send,
  Check, X, AlertTriangle, ChevronDown, UploadCloud, Menu, ArrowRight, ArrowLeft,
  Eye, EyeOff, Pencil, RefreshCw, Info, Paperclip, GitBranch, ScrollText, LogOut,
  Settings, MapPin, ClipboardList, BookOpen,
} from "lucide-react";
import { GlobalStyle } from "./styles.jsx";
import { resolveReferralHub, ALL_ALBERTA_TOWNS, ALBERTA_REFERRAL_HUBS } from "./albertaReferralRouting.js";
import { CONDITION_GROUPS, emptyMskInput, runMskTriage } from "./mskTriage.js";
import { inferMskFieldsFromSections } from "./mskAutoFill.js";
import { inferPathwayFieldsFromSections } from "./pathwayAutoFill.js";
import { PATHWAY_FORMS } from "./pathwayForms.js";
import {
  getCurrentUser, listCaseTypes, listWorkflowTemplates, createPatient, createCase,
  submitExtraction, getExtraction, retryExtraction, isTerminal, evaluateRules,
  submitPathwayValidation, analyzeAttachment,
} from "./api.js";
import {
  ORG, CASE_ID, GUIDING_PRINCIPLE, PATIENT_DEFAULTS, SAMPLE_NOTE,
  AI_REQUEST, GROUNDED, SECTIONS_AFTER_EDIT, PATHWAY_SIGNAL, RULE_SIGNALS,
  REFERRAL_DRAFT, FEEDBACK_RECORD, SPECIALISTS, MODULES, urgencyCopy,
} from "./mockData.js";

/* ────────────────────────────────────────────────────────────────────────
   MedFlow — static walkthrough of the referral workflow.

   Nothing here calls a server. Every AI / rules / draft object is shaped
   exactly like the real backend + ai-service contract (see mockData.js) so
   the UI is faithful to the pipeline without a model behind it.
──────────────────────────────────────────────────────────────────────── */

const NAV = [
  { id: "patient", label: "Patient", icon: User, stage: "1 · Case creation" },
  { id: "intake", label: "Case intake", icon: FileText, stage: "1 · Case creation" },
  { id: "extraction", label: "AI extraction", icon: Sparkles, stage: "2 · AI ingestion & extraction" },
  { id: "msk-triage", label: "MSK triage", icon: ClipboardList, stage: "3 · Clinical validation & rule check" },
  { id: "pathway-reference", label: "Clinical pathway", icon: BookOpen, stage: "3 · Clinical validation & rule check" },
  { id: "validation", label: "Validation & rules", icon: ShieldCheck, stage: "3 · Clinical validation & rule check" },
  { id: "referral", label: "Referral draft", icon: FileSignature, stage: "4 · Draft generation" },
  { id: "review", label: "Physician review", icon: UserCheck, stage: "5 · Review & authorisation" },
  { id: "send", label: "Route & send", icon: Send, stage: "6 · Communication" },
  { id: "feedback", label: "Feedback & audit", icon: GitBranch, stage: "7 · Tracking & learning" },
];

// The case's referral pathway (set on Case intake, before the note exists —
// just an initial guess) maps onto an MSK triage condition group where one
// exists; "hip" has no dedicated overlay yet, so it's left for the physician
// to pick manually. The reverse map feeds the *confirmed* condition group
// (chosen post-extraction, against the real note) back into `pathway`, which
// is what Validation & rules actually evaluates against — "cts" has no
// intake-pathway/ai-service equivalent yet, so it's left unmapped.
const CONDITION_GROUP_BY_PATHWAY = { knee: "knee", shoulder: "shoulder", spine: "lumbar" };
const PATHWAY_BY_CONDITION_GROUP = { knee: "knee", shoulder: "shoulder", lumbar: "spine" };

const STATUS_BY_PAGE = {
  patient: "Draft", intake: "Draft",
  extraction: "Extracting",
  "msk-triage": "Triaging", "pathway-reference": "Triaging", validation: "Validating",
  referral: "Draft ready", review: "Pending review",
  send: "Pending review", feedback: "Completed",
};

// Demo-only fax number (555 prefix, same fictional convention as the rest of
// mockData.js) — the routing map has no real per-clinic directory yet.
const FAX_AREA_CODE_BY_HUB = {
  Edmonton: "780", "Grande Prairie": "780", "Fort McMurray": "780",
  Calgary: "403", "Red Deer": "403", Lethbridge: "403", "Medicine Hat": "403",
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
  NAV.forEach((n, i) => { if (i <= idx) v[n.id] = true; });
  return v;
}

// Whether each step's own data/action requirement is satisfied — the gate
// that stops sidebar clicks, deep-link URLs, and browser back/forward from
// skipping past a step that hasn't actually been completed. It does NOT gate
// the in-page Next buttons — those already validate before calling next().
function computeStepOk({ patientOk, extraction, validationOk, decision, sendState }) {
  const extractionOk = Boolean(extraction && isTerminal(extraction.status) && extraction.status !== "failed" && extraction.result?.items);
  return {
    patient: patientOk,
    intake: Boolean(extraction),
    extraction: extractionOk,
    "msk-triage": extractionOk,
    "pathway-reference": extractionOk,
    validation: extractionOk,
    referral: Boolean(validationOk),
    review: Boolean(decision),
    send: sendState === "sent",
    feedback: sendState === "sent",
  };
}

// Applies a flat { "a.b": value } map onto a (deep-cloned) copy of `obj`,
// only where the target leaf is still at its default/empty value — an AI
// suggestion never overwrites something the physician (or a prior run) has
// already set.
function applyAiSuggestions(obj, fieldMap) {
  const next = structuredClone(obj);
  for (const [path, value] of Object.entries(fieldMap)) {
    const keys = path.split(".");
    let node = next;
    for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
    const leaf = keys[keys.length - 1];
    const current = node[leaf];
    const isEmpty = current === "" || current === false || current === null || current === undefined;
    if (isEmpty) node[leaf] = value;
    else delete fieldMap[path]; // don't badge a field we didn't actually touch
  }
  return next;
}

function frontierOf(stepOk) {
  const i = NAV.findIndex((n) => !stepOk[n.id]);
  return i === -1 ? NAV.length - 1 : i;
}

const INITIAL_STEP_OK = computeStepOk({
  patientOk: Boolean(PATIENT_DEFAULTS.firstName.trim() && PATIENT_DEFAULTS.lastName.trim() && PATIENT_DEFAULTS.dob.trim()),
  extraction: null,
  validationOk: false,
  decision: null,
  sendState: "idle",
});
const INITIAL_FRONTIER = frontierOf(INITIAL_STEP_OK);

function initialPage() {
  const idx = Math.max(0, NAV.findIndex((n) => n.id === pageFromUrl()));
  return NAV[Math.min(idx, INITIAL_FRONTIER)].id;
}

export default function MedFlowApp({ user, onLogout, onOpenProfile } = {}) {
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
  const [mskInput, setMskInput] = useState(() => emptyMskInput(CONDITION_GROUP_BY_PATHWAY[pathway] || "cts"));
  // Dot-paths (e.g. "symptoms.painPattern") currently holding a value the AI
  // suggestion engine filled in and the physician hasn't touched yet — drives
  // the "AI suggested" badges in PageMskTriage. Cleared per-field the moment
  // the physician edits that field (see PageMskTriage's `set`).
  const [mskAiFilled, setMskAiFilled] = useState({});
  // The condition group physicians confirm at MSK Triage (post-extraction,
  // against the real note) overrides the pre-note intake guess.
  useEffect(() => {
    const mapped = PATHWAY_BY_CONDITION_GROUP[mskInput.conditionGroup];
    if (mapped) setPathway(mapped);
  }, [mskInput.conditionGroup]);
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

  // AI-assisted description of an uploaded image attachment (e.g. an X-ray) —
  // never a diagnosis. Only the first image-type attachment is analyzed.
  // Polled like an extraction, so it keeps progressing regardless of page.
  const [imagingJob, setImagingJob] = useState(null);
  const [imagingSubmitError, setImagingSubmitError] = useState(null);

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
  // resolves to a hub (set on the Profile settings page), route to that
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
      });

      const newCase = await createCase({
        organization_id: user.organization_id,
        patient_id: newPatient.id,
        created_by: user.id,
        case_type_id: caseType.id,
        workflow_template_id: template.id,
        status: "created",
        raw_notes: notes,
      }, files.map((f) => f.file));

      const queued = await submitExtraction({ note: notes, pathway, caseId: newCase.id });
      setExtraction(queued);

      const imageAttachment = newCase.attachments?.find((a) => a.mime_type?.startsWith("image/"));
      if (imageAttachment) {
        analyzeAttachment(newCase.id, imageAttachment.id)
          .then(setImagingJob)
          .catch((err) => setImagingSubmitError(err.message || "Could not start imaging analysis."));
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

  const handleExtractionCompleted = useCallback((secs) => {
    setSections(secs);
    // Pre-fill MSK Triage from the extraction text — heuristic, frontend-only,
    // never overwrites a field the physician (or a prior run) already set.
    // Red flags are deliberately excluded; see mskAutoFill.js.
    const suggestions = inferMskFieldsFromSections(secs);
    setMskInput((prev) => applyAiSuggestions(prev, suggestions));
    setMskAiFilled((prev) => ({ ...prev, ...suggestions }));
    // AI pathway validation now runs once the physician leaves MSK Triage
    // (see the "msk-triage" page below) — not here — so it evaluates
    // against the condition confirmed post-extraction, not a pre-note guess.
  }, []);

  const statusLabel = sendState === "sent" ? "Sent" : (STATUS_BY_PAGE[page] || "Draft");

  return (
    <div className="mf-app">
      <GlobalStyle />
      <TopBar statusLabel={statusLabel} stepIndex={currentIndex} stepTotal={NAV.length}
        stage={NAV[currentIndex]?.stage} onMenuClick={() => setSidebarOpen((v) => !v)}
        user={user} onLogout={onLogout} onOpenProfile={onOpenProfile} />

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
              <PageIntake pathway={pathway} setPathway={setPathway} notes={notes} setNotes={setNotes}
                files={files} setFiles={setFiles}
                onCreate={handleCreateCase} submitting={intakeSubmitting} error={intakeError}
                onBack={back} />
            )}
            {page === "extraction" && (
              <PageExtraction extraction={extraction} setExtraction={setExtraction}
                sections={sections} setSections={setSections}
                imagingJob={imagingJob} imagingSubmitError={imagingSubmitError}
                onCompleted={handleExtractionCompleted} onNext={next} onBack={back} />
            )}
            {page === "msk-triage" && (
              <PageMskTriage sections={sections} input={mskInput} setInput={setMskInput}
                aiFilled={mskAiFilled} setAiFilled={setMskAiFilled}
                onNext={next} onBack={back} />
            )}
            {page === "pathway-reference" && (
              <PageClinicalPathway conditionGroup={mskInput.conditionGroup} sections={sections}
                onChangeConditionGroup={(id) => setMskInput((prev) => ({ ...prev, conditionGroup: id }))}
                onNext={() => { runValidation(sections); next(); }} onBack={back} />
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

/* ── Shell ──────────────────────────────────────────────────────────────── */

function TopBar({ statusLabel, stepIndex, stepTotal, stage, onMenuClick, user, onLogout, onOpenProfile }) {
  const pct = Math.round(((stepIndex + 1) / stepTotal) * 100);
  return (
    <div className="mf-topbar">
      <div className="mf-topbar-inner">
        <div className="mf-topbar-left">
          <button className="mf-menu-btn" onClick={onMenuClick} aria-label="Toggle navigation"><Menu size={18} /></button>
          <span className="mf-wordmark">MedFlow</span>
          <span className="mf-crumb">/ {CASE_ID}</span>
        </div>
        <div className="mf-topbar-right">
          <span className="mf-step-count">Stage {stage?.[0]} <span className="mf-step-count-of">of 7</span></span>
          <span className={`mf-status-pill mf-status-${statusLabel.replace(/\s/g, "-").toLowerCase()}`}>{statusLabel}</span>
          <span className="mf-org-badge">{user?.name || ORG}</span>
          {onOpenProfile && (
            <button className="mf-mini-btn ghost" onClick={onOpenProfile} aria-label="Profile settings" title="Profile settings">
              <Settings size={13} /> Profile
            </button>
          )}
          {onLogout && (
            <button className="mf-mini-btn ghost" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
      </div>
      <div className="mf-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="mf-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function initials(p) {
  return ((p.firstName?.trim()[0] || "") + (p.lastName?.trim()[0] || "")).toUpperCase() || "—";
}

function Sidebar({ nav, page, visited, maxReachableIndex, goTo, open, patient, pathway, urgency }) {
  const currentIdx = nav.findIndex((x) => x.id === page);
  const doneCount = nav.filter((n, i) => visited[n.id] && i < currentIdx).length;
  const nameValid = patient.firstName?.trim() && patient.lastName?.trim();
  return (
    <>
      <aside className={`mf-sidebar${open ? " open" : ""}`}>
        <div className="mf-sidebar-case">
          <div className="mf-sidebar-case-head">
            <span className="mf-avatar">{initials(patient)}</span>
            <div>
              <p className="mf-sidebar-case-name">{nameValid ? `${patient.firstName} ${patient.lastName}` : "New patient"}</p>
              <p className="mf-sidebar-case-id">{CASE_ID}</p>
            </div>
          </div>
          <p className="mf-sidebar-case-meta">
            {pathway[0].toUpperCase() + pathway.slice(1)} pathway ·{" "}
            <span className={`mf-urgency mf-urgency-${urgency}`} style={{ fontSize: 10, padding: "2px 7px" }}>{urgency}</span>
          </p>
        </div>
        <div className="mf-nav-progress"><span>Workflow</span><span>{doneCount}/{nav.length}</span></div>
        <nav className="mf-nav">
          {nav.map((n, i) => {
            const Icon = n.icon;
            const isCurrent = n.id === page;
            const isDone = visited[n.id] && i < currentIdx;
            const reachable = i <= maxReachableIndex;
            const state = isCurrent ? "current" : isDone ? "done" : reachable ? "upcoming" : "locked";
            return (
              <button key={n.id} className={`mf-nav-item is-${state}`} onClick={() => reachable && goTo(n.id)}
                disabled={!reachable} aria-current={isCurrent ? "step" : undefined}>
                <span className="mf-nav-marker">
                  {isDone ? <Check size={13} strokeWidth={3} /> : isCurrent ? <Icon size={14} /> : <span className="mf-nav-num">{i + 1}</span>}
                </span>
                <span className="mf-nav-label">{n.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      {open && <div className="mf-sidebar-overlay" onClick={() => goTo(page)} />}
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
  const submit = () => { setTouched(true); if (canContinue) onNext(); };
  const age = (() => {
    const d = new Date(patient.dob);
    if (Number.isNaN(d.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return a;
  })();

  return (
    <PageShell title="Patient information"
      subhead="Core demographics and coverage. This travels with the case through extraction, the rules engine, and the referral letter — the AI never invents it.">
      <PrincipleBanner />
      <div className="mf-two-col">
        <div>
          <Field label="Patient name">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="First name" value={patient.firstName} onChange={set("firstName")} />
              <input className="mf-input" placeholder="Last name" value={patient.lastName} onChange={set("lastName")} />
            </div>
            {touched && !nameValid && <p className="mf-error">Enter the patient's first and last name.</p>}
          </Field>
          <Field label="Date of birth">
            <div className="mf-input-grid">
              <input className="mf-input" type="date" value={patient.dob} onChange={set("dob")} />
              <div className="mf-select-wrap">
                <select className="mf-select" value={patient.sex} onChange={set("sex")}>
                  <option value="female">Female</option><option value="male">Male</option>
                  <option value="other">Other</option><option value="unknown">Unknown</option>
                </select>
                <ChevronDown size={16} className="mf-select-icon" />
              </div>
            </div>
            {touched && !dobValid && <p className="mf-error">Date of birth is required.</p>}
          </Field>
          <Field label="Medical record number (MRN)">
            <input className="mf-input" value={patient.mrn} onChange={set("mrn")} />
          </Field>
          <Field label="Contact">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="Phone" value={patient.phone} onChange={set("phone")} />
              <input className="mf-input" type="email" placeholder="Email" value={patient.email} onChange={set("email")} />
            </div>
            <input className="mf-input" style={{ marginTop: 10 }} placeholder="Home address" value={patient.address} onChange={set("address")} />
          </Field>
          <Field label="Insurance">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="Payer / plan" value={patient.payer} onChange={set("payer")} />
              <input className="mf-input" placeholder="Member ID" value={patient.memberId} onChange={set("memberId")} />
            </div>
          </Field>
          <Field label="Referring / primary care physician">
            <input className="mf-input" value={patient.pcp} onChange={set("pcp")} />
          </Field>
        </div>
        <SummaryCard title="Patient">
          <SummaryRow k="Name" v={nameValid ? `${patient.firstName} ${patient.lastName}` : "Not entered"} />
          <SummaryRow k="Age" v={age != null ? `${age} yrs` : "—"} />
          <SummaryRow k="Sex" v={patient.sex ? patient.sex[0].toUpperCase() + patient.sex.slice(1) : "—"} />
          <SummaryRow k="MRN" v={patient.mrn || "—"} />
          <SummaryRow k="Payer" v={patient.payer || "—"} />
          <SummaryRow k="Status" v={<StatusPillSmall color="amber">Draft</StatusPillSmall>} />
          <button className="mf-primary-btn full" disabled={!canContinue} onClick={submit}>
            Continue to case intake <ArrowRight size={15} />
          </button>
          <p className="mf-tiny-note">Editable any time before the referral is sent.</p>
        </SummaryCard>
      </div>
      <PageNav onNext={submit} nextLabel="Continue to case intake" />
    </PageShell>
  );
}

/* ── Stage 1b: Case intake ─────────────────────────────────────────────── */

function PageIntake({ pathway, setPathway, notes, setNotes, files, setFiles, onCreate, submitting, error, onBack }) {
  const [dragOver, setDragOver] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const notesValid = notes.trim().length >= 10;
  const canSubmit = notesValid && pathway && !submitting;

  const addFiles = (list) => setFiles((prev) => [
    ...prev,
    ...Array.from(list).map((f) => ({ id: `${f.name}-${Math.random()}`, name: f.name, size: f.size, file: f })),
  ]);

  return (
    <PageShell title="Start a new referral"
      subhead="Paste the visit note. On “Create case” the backend queues an AI extraction job and returns immediately — the note never goes to the model from the browser.">
      <div className="mf-two-col">
        <div>
          <Field label="Referral pathway">
            <div className="mf-select-wrap">
              <select className="mf-select" value={pathway} onChange={(e) => setPathway(e.target.value)}>
                <option value="knee">Orthopaedics — Knee</option>
                <option value="hip">Orthopaedics — Hip</option>
                <option value="shoulder">Orthopaedics — Shoulder</option>
                <option value="spine">Orthopaedics — Spine</option>
              </select>
              <ChevronDown size={16} className="mf-select-icon" />
            </div>
          </Field>
          <Field label="Clinical notes">
            <div className="mf-label-row">
              <span />
              <button className="mf-inline-link" onClick={() => setNotes(SAMPLE_NOTE)}>Load example note</button>
            </div>
            <textarea className="mf-textarea"
              placeholder="Paste the visit note: chief complaint, history, exam findings, prior treatment, imaging…"
              value={notes} onChange={(e) => setNotes(e.target.value)} />
            {touched && !notesValid && <p className="mf-error">Add a visit note of at least 10 characters.</p>}
          </Field>
          <Field label="Supporting documents">
            <div className={`mf-dropzone${dragOver ? " drag" : ""}`} role="button" tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}>
              <UploadCloud size={20} color="var(--ink-soft)" />
              <div className="mf-dropzone-title">Drop imaging or lab results here</div>
              <div className="mf-dropzone-sub">or click to browse — PDF, JPG, PNG, WEBP up to 20MB</div>
              <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: "none" }}
                onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="mf-filelist">
                {files.map((f) => (
                  <div className="mf-file" key={f.id}>
                    <FileText size={14} color="var(--ink-soft)" />
                    <span className="mf-file-name">{f.name}</span>
                    <button className="mf-file-remove" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                      aria-label={`Remove ${f.name}`}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </div>
        <SummaryCard title="Case summary">
          <SummaryRow k="Pathway" v={`Orthopaedics — ${pathway[0].toUpperCase()}${pathway.slice(1)}`} />
          <SummaryRow k="Notes" v={`${notes.trim() ? notes.trim().split(/\s+/).length : 0} words`} />
          <SummaryRow k="Attachments" v={files.length} />
          <SummaryRow k="Status" v={<StatusPillSmall color="amber">Draft</StatusPillSmall>} />
          <button className="mf-primary-btn full" disabled={!canSubmit}
            onClick={() => { setTouched(true); if (canSubmit) onCreate(); }}>
            {submitting ? "Creating case…" : "Create case & queue extraction"} <ArrowRight size={15} />
          </button>
          {error && <p className="mf-error">{error}</p>}
          <p className="mf-tiny-note">
            <code>POST /api/v1/ai/extractions</code> → 202 {"{ id, status: \"queued\" }"}. A physician approves everything before it is sent.
          </p>
        </SummaryCard>
      </div>
      <PageNav onBack={onBack} onNext={() => { setTouched(true); if (canSubmit) onCreate(); }} nextLabel={submitting ? "Creating case…" : "Create case & queue extraction"} />
    </PageShell>
  );
}

/* ── Stage 2a: AI extraction ───────────────────────────────────────────── */

function PageExtraction({ extraction, setExtraction, sections, setSections, imagingJob, imagingSubmitError, onCompleted, onNext, onBack }) {
  const [showNote, setShowNote] = useState(false);
  const [mode, setMode] = useState("extraction"); // extraction | imaging
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasImaging = Boolean(imagingJob || imagingSubmitError);
  const imagingPending = Boolean(imagingJob && !isTerminal(imagingJob.status));
  const imagingReady = Boolean(imagingJob?.status === "completed" && imagingJob.result);
  const imagingFailed = imagingJob?.status === "failed";
  const imagingErrorMessage = imagingSubmitError || (
    imagingFailed
      ? (imagingJob.error?.code === "unsupported_modality"
        ? "The AI model currently loaded can't analyze images yet — an admin needs to switch it to a vision-capable model."
        : (imagingJob.error?.message || "Imaging analysis failed."))
      : null
  );
  const live = Boolean(extraction);
  const r = extraction || AI_REQUEST;
  const pending = live && !isTerminal(r.status);
  const failed = live && r.status === "failed";
  // Live requests are grounded extractions: { items, not_stated }, not the
  // { sections } shape the mock/demo fallback uses. Normalize both into the
  // same {title, content, source_phrase, verbatim} list — that normalized
  // list is exactly `sections` (lifted state), the single editable source of
  // truth used here and everything downstream (MSK triage, Review).
  const items = live ? r.result?.items : GROUNDED.items;
  const notStated = live ? r.result?.not_stated : GROUNDED.not_stated;
  // A terminal, non-failed request should always carry a result — but guard
  // against it anyway (e.g. a stale/deduped response) rather than crash.
  const missingResult = !pending && !failed && !items;

  const editSection = (i, key, val) => {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)));
    setDirty(true);
  };
  const resetSections = () => {
    setSections(live ? sectionsFromItems(items) : JSON.parse(JSON.stringify(AI_REQUEST.result.sections)));
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
    return () => { cancelled = true; clearInterval(t); };
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
    <PageShell title="AI extraction result"
      subhead="What the AI pulled from the note. It does not diagnose or infer — every value carries the exact source phrase, and the service (not the model) confirms that phrase is really in the note."
      headerRight={
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {dirty && (
            <button className="mf-toggle-link" onClick={resetSections}><RefreshCw size={14} /> Reset to AI output</button>
          )}
          <button className="mf-toggle-link" onClick={() => setEditing((v) => !v)}>
            <Pencil size={14} /> {editing ? "Preview" : "Edit"}
          </button>
          <button className="mf-toggle-link" onClick={() => setShowNote((v) => !v)}>
            {showNote ? <EyeOff size={15} /> : <Eye size={15} />} {showNote ? "Hide" : "View"} original note
          </button>
        </div>
      }>
      {showNote && (
        <div className="mf-note-box">
          <p className="mf-note-box-title">Original visit note, as pasted at intake</p>
          <pre className="mf-mono-block">{SAMPLE_NOTE}</pre>
        </div>
      )}

      <div className="mf-provenance">
        <span className="mf-prov-pill">request <b>{r.id.slice(0, 10)}…</b></span>
        {r.model_id && <span className="mf-prov-pill">model <b>{r.model_id}</b></span>}
        {r.prompt_version && <span className="mf-prov-pill">prompt <b>{r.prompt_version}</b></span>}
        {r.duration_ms != null && (
          <span className="mf-prov-pill">{r.token_count} tokens · {(r.duration_ms / 1000).toFixed(0)}s</span>
        )}
        <span className="mf-prov-pill"><b>{r.status}</b></span>
      </div>

      {pending && (
        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Extraction {r.status} on {r.model_id || "the model"}… this can take up to a minute on CPU. Checking every few seconds.
        </div>
      )}

      {failed && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {r.error?.message || "Extraction failed."}
          <button className="mf-inline-link" onClick={handleRetry} disabled={retrying} style={{ marginLeft: 8 }}>
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {missingResult && !failed && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          This extraction finished without a result. Try again.
          {live && (
            <button className="mf-inline-link" onClick={handleRetry} disabled={retrying} style={{ marginLeft: 8 }}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {!pending && !failed && !missingResult && (
        <>
          {hasImaging && (
            <div className="mf-tabs">
              <button className={`mf-tab${mode === "extraction" ? " active" : ""}`} onClick={() => setMode("extraction")}>Extraction</button>
              <button className={`mf-tab${mode === "imaging" ? " active" : ""}`} onClick={() => setMode("imaging")}>Imaging findings</button>
            </div>
          )}

          {mode === "imaging" ? (
            <>
              {imagingPending && (
                <div className="mf-info-strip">
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Analyzing the uploaded image… this can take up to a minute on CPU.
                </div>
              )}
              {imagingErrorMessage && (
                <div className="mf-info-strip">
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {imagingErrorMessage}
                </div>
              )}
              {imagingReady && (
                <>
                  <div className="mf-provenance">
                    <span className="mf-prov-pill">modality <b>{imagingJob.result.modality || "unknown"}</b></span>
                    <span className="mf-prov-pill">region <b>{imagingJob.result.body_region || "unknown"}</b></span>
                    {imagingJob.result.model_id && <span className="mf-prov-pill">model <b>{imagingJob.result.model_id}</b></span>}
                  </div>
                  <Card>
                    <p className="mf-section-title">Findings</p>
                    {imagingJob.result.findings?.length ? (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {imagingJob.result.findings.map((f, i) => (
                          <li key={i} className="mf-section-content" style={{ marginBottom: 4 }}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mf-section-content" style={{ color: "var(--ink-soft)" }}>No findings identified.</p>
                    )}
                  </Card>
                  {imagingJob.result.impression && (
                    <Card style={{ marginTop: 8 }}>
                      <p className="mf-section-title">Impression</p>
                      <p className="mf-section-content">{imagingJob.result.impression}</p>
                    </Card>
                  )}
                  <div className="mf-info-strip" style={{ marginTop: 12 }}>
                    <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    AI-assisted description, not a diagnosis — verify against the actual image before this informs any decision.
                  </div>
                </>
              )}
            </>
          ) : editing ? (
            <div className="mf-fields-view">
              <div className="mf-info-strip">
                <Pencil size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Correct anything the AI got wrong. This is the last edit point before the rules engine runs — every edit is
                captured for the feedback dataset.
              </div>
              {sections.map((s, i) => (
                <Card key={i}>
                  <Field label="Section title">
                    <input className="mf-input" value={s.title} onChange={(e) => editSection(i, "title", e.target.value)} />
                  </Field>
                  <Field label="Content">
                    <textarea className="mf-textarea" style={{ minHeight: 60 }} value={s.content}
                      onChange={(e) => editSection(i, "content", e.target.value)} />
                  </Field>
                  <Field label="Source phrase (from the note)">
                    <input className="mf-input" value={(s.source_phrase || "").replace(/\s+/g, " ")}
                      placeholder="No matching phrase in note"
                      onChange={(e) => editSection(i, "source_phrase", e.target.value)} />
                  </Field>
                  <span className={`mf-verbatim-chip${s.verbatim ? "" : " unverified"}`}>
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
                    <span className={`mf-verbatim-chip${s.verbatim ? "" : " unverified"}`}>
                      {s.verbatim ? <Check size={11} /> : <AlertTriangle size={11} />}
                      {s.source_phrase
                        ? <>{s.verbatim ? "verbatim" : "unverified"}: “{s.source_phrase.replace(/\s+/g, " ")}”</>
                        : "no matching phrase in note"}
                    </span>
                  </div>
                ))}
              </div>
              {notStated?.length > 0 && (
                <Card style={{ marginTop: 12 }}>
                  <p className="mf-section-title">Not stated in this note</p>
                  <p className="mf-section-content" style={{ color: "var(--ink-soft)" }}>{notStated.join(" · ")}</p>
                </Card>
              )}
              <p className="mf-tiny-note" style={{ marginTop: 12 }}>
                No fixed schema — the section titles are chosen by the model from this note's content. A note about a different
                complaint would produce different sections.
              </p>
            </>
          )}
        </>
      )}

      {!pending && !failed && (
        <>
          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Grounding is a trust signal, not a confidence score. An <b>unverified</b> phrase means the model rewrote it — the
            clinician should check that value against the note before it moves downstream.
          </div>

          <div className="mf-actions">
            <button className="mf-primary-btn" onClick={onNext}>Continue to MSK triage <ArrowRight size={15} /></button>
          </div>
        </>
      )}
      <PageNav onBack={onBack} onNext={pending || failed || missingResult ? undefined : onNext} nextLabel="Continue to MSK triage" />
    </PageShell>
  );
}

/* ── Stage 3a: MSK triage assistant (static, deterministic — no model) ──── */

// Small "AI suggested this — verify or change it" badge, shown next to a
// field's current value only until the physician interacts with that field.
function AiBadge() {
  return (
    <span className="mf-ai-tag" title="Suggested from the AI extraction — verify or change it">
      <Sparkles size={10} /> AI
    </span>
  );
}

function PillGroup({ label, value, onChange, options, aiValue }) {
  return (
    <Field label={label}>
      <div className="mf-channel-row">
        {options.map((o) => (
          <button type="button" key={o.value} className={`mf-channel-btn${value === o.value ? " active" : ""}`}
            onClick={() => onChange(o.value)}>
            {o.label}
            {aiValue === o.value && <AiBadge />}
          </button>
        ))}
      </div>
    </Field>
  );
}

function CheckField({ label, hint, checked, onChange, danger, ai }) {
  return (
    <label className={`mf-attest-row${danger ? " gap" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {ai && <AiBadge />}
        {hint && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{hint}</span>}
      </span>
    </label>
  );
}

const MSK_RESULT_TONE = {
  Mild: "sage", Moderate: "amber", Severe: "clay", "Red Flag": "clay", Atypical: "amber",
  Routine: "sage", Priority: "amber", Urgent: "clay",
};

function PageMskTriage({ sections, input, setInput, aiFilled, setAiFilled, onNext, onBack }) {
  const [showLegend, setShowLegend] = useState(false);
  const set = (path, value) => {
    setInput((prev) => {
      const next = structuredClone(prev);
      let obj = next;
      const keys = path.split(".");
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    // The physician has now made this field their own decision, whatever the
    // AI guessed — clear its "verify me" badge.
    setAiFilled((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };
  const clearAiSuggestions = () => {
    setInput((prev) => {
      const next = structuredClone(prev);
      for (const path of Object.keys(aiFilled)) {
        const keys = path.split(".");
        let obj = next;
        for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
        const leaf = keys[keys.length - 1];
        obj[leaf] = typeof obj[leaf] === "boolean" ? false : "";
      }
      return next;
    });
    setAiFilled({});
  };
  const aiCount = Object.keys(aiFilled).length;
  const result = runMskTriage(input);

  return (
    <PageShell title="MSK triage assistant"
      subhead="A deterministic rules engine — no model call, nothing sent anywhere. Fill in what the note and exam document; severity, urgency, and referral appropriateness update live.">
      {sections?.length > 0 && (
        <Accordion title="AI extraction (reference)" badge={`${sections.length} sections`} tone="sage">
          <ul>{sections.map((s, i) => <li key={i}><b>{s.title}:</b> {s.content}</li>)}</ul>
        </Accordion>
      )}

      {aiCount > 0 && (
        <div className="mf-ai-banner">
          <span><Sparkles size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            {aiCount} field{aiCount === 1 ? "" : "s"} pre-filled from the AI extraction — review each before continuing.</span>
          <button type="button" className="mf-mini-btn ghost" onClick={clearAiSuggestions}>Clear AI suggestions</button>
        </div>
      )}

      <div className="mf-two-col">
        <div>
          <Field label="Condition group">
            <div className="mf-channel-row">
              {CONDITION_GROUPS.map((c) => (
                <button type="button" key={c.id} className={`mf-channel-btn${input.conditionGroup === c.id ? " active" : ""}`}
                  onClick={() => set("conditionGroup", c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <SectionLabel>Symptoms & duration</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              <PillGroup label="Duration" value={input.duration} onChange={(v) => set("duration", v)} aiValue={aiFilled["duration"]}
                options={[{ value: "acute", label: "Acute (<6wk)" }, { value: "subacute", label: "Subacute (6–12wk)" }, { value: "chronic", label: "Chronic (>12wk)" }]} />
              <PillGroup label="Pain pattern" value={input.symptoms.painPattern} onChange={(v) => set("symptoms.painPattern", v)} aiValue={aiFilled["symptoms.painPattern"]}
                options={[{ value: "intermittent", label: "Intermittent" }, { value: "daily_frequent", label: "Daily / frequent" }, { value: "constant", label: "Constant" }]} />
              <PillGroup label="Functional impact" value={input.symptoms.functionalImpact} onChange={(v) => set("symptoms.functionalImpact", v)} aiValue={aiFilled["symptoms.functionalImpact"]}
                options={[{ value: "minimal", label: "Minimal" }, { value: "clear", label: "Clear (ADLs/work)" }, { value: "major", label: "Major" }]} />
              <PillGroup label="Sleep disruption" value={input.symptoms.sleepDisruption} onChange={(v) => set("symptoms.sleepDisruption", v)} aiValue={aiFilled["symptoms.sleepDisruption"]}
                options={[{ value: "none", label: "None" }, { value: "occasional", label: "Occasional" }, { value: "present", label: "Present" }, { value: "major", label: "Major" }]} />
            </div>
            <CheckField label="Numbness / tingling" checked={input.symptoms.numbnessTingling} onChange={(v) => set("symptoms.numbnessTingling", v)} ai={Boolean(aiFilled["symptoms.numbnessTingling"])} />
            <CheckField label="Mechanical symptoms" hint="Locking, catching, giving way, clicking" checked={input.symptoms.mechanicalSymptoms} onChange={(v) => set("symptoms.mechanicalSymptoms", v)} ai={Boolean(aiFilled["symptoms.mechanicalSymptoms"])} />
          </Card>

          <SectionLabel>Red flags — any one short-circuits triage to Urgent</SectionLabel>
          <Card style={{ background: "var(--clay-soft)", borderColor: "#E3B8B4" }}>
            <div className="mf-info-strip" style={{ margin: "0 0 12px", background: "transparent", border: "1px dashed #E3B8B4", color: "var(--clay)" }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Never auto-filled from the AI extraction — a keyword match on a negated mention (e.g. "no history of trauma") is easy to get wrong. Check these only from your own reading of the note and exam.
            </div>
            <CheckField danger label="Infection" hint="Fever, warmth, redness, severe pain" checked={input.redFlags.infection} onChange={(v) => set("redFlags.infection", v)} />
            <CheckField danger label="Trauma" hint="Suspected fracture/dislocation, deformity, inability to bear weight/use limb" checked={input.redFlags.trauma} onChange={(v) => set("redFlags.trauma", v)} />
            <CheckField danger label="Major neurological deficit" hint="Foot drop, saddle anesthesia, cauda equina, sudden weakness" checked={input.redFlags.neuroDeficit} onChange={(v) => set("redFlags.neuroDeficit", v)} />
            <CheckField danger label="Systemic disease signs" hint="RA, malignancy suspicion, unexplained weight loss" checked={input.redFlags.systemic} onChange={(v) => set("redFlags.systemic", v)} />
          </Card>

          <SectionLabel>Exam findings</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              <PillGroup label="Range of motion" value={input.exam.rom} onChange={(v) => set("exam.rom", v)} aiValue={aiFilled["exam.rom"]}
                options={[{ value: "normal", label: "Normal" }, { value: "reduced", label: "Reduced" }, { value: "major_loss", label: "Major loss" }]} />
              <PillGroup label="Strength deficit" value={input.exam.strengthDeficit} onChange={(v) => set("exam.strengthDeficit", v)} aiValue={aiFilled["exam.strengthDeficit"]}
                options={[{ value: "none", label: "None" }, { value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }]} />
            </div>
            <CheckField label="Deformity / atrophy" checked={input.exam.deformityAtrophy} onChange={(v) => set("exam.deformityAtrophy", v)} ai={Boolean(aiFilled["exam.deformityAtrophy"])} />
            {input.conditionGroup === "cts" && (
              <>
                <CheckField label="Thenar atrophy" checked={input.exam.thenarAtrophy} onChange={(v) => set("exam.thenarAtrophy", v)} />
                <CheckField label="Thumb weakness" checked={input.exam.thumbWeakness} onChange={(v) => set("exam.thumbWeakness", v)} />
              </>
            )}
            {input.conditionGroup === "shoulder" && (
              <CheckField label="Frozen shoulder" hint="Marked, global ROM loss" checked={input.exam.frozenShoulder} onChange={(v) => set("exam.frozenShoulder", v)} />
            )}
            {input.conditionGroup === "lumbar" && (
              <CheckField label="Motor deficit" hint="e.g. foot drop" checked={input.exam.motorDeficit} onChange={(v) => set("exam.motorDeficit", v)} />
            )}
          </Card>

          <SectionLabel>Investigations</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              <PillGroup label="Imaging" value={input.investigations.imaging} onChange={(v) => set("investigations.imaging", v)} aiValue={aiFilled["investigations.imaging"]}
                options={[{ value: "done", label: "Done" }, { value: "pending", label: "Ordered / pending" }, { value: "not_done", label: "Not done" }]} />
              <PillGroup label="Labs" value={input.investigations.labs} onChange={(v) => set("investigations.labs", v)} aiValue={aiFilled["investigations.labs"]}
                options={[{ value: "done", label: "Done" }, { value: "pending", label: "Ordered / pending" }, { value: "not_done", label: "Not done" }]} />
            </div>
          </Card>

          <SectionLabel>Management tried</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              <PillGroup label="Conservative management tried?" value={input.management.tried} onChange={(v) => set("management.tried", v)} aiValue={aiFilled["management.tried"]}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              <Field label={<>Duration (weeks) {aiFilled["management.weeks"] !== undefined && <AiBadge />}</>}>
                <input type="number" min="0" className="mf-input" style={{ width: 120 }}
                  value={input.management.weeks} onChange={(e) => set("management.weeks", e.target.value)} />
              </Field>
              <PillGroup label="Response" value={input.management.response} onChange={(v) => set("management.response", v)} aiValue={aiFilled["management.response"]}
                options={[{ value: "none", label: "None" }, { value: "partial", label: "Partial" }, { value: "good", label: "Good" }]} />
            </div>
          </Card>

          <SectionLabel>Comorbidities & medications</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              <Field label={<>Comorbidities {aiFilled["comorbidities"] !== undefined && <AiBadge />}</>}>
                <textarea className="mf-textarea" style={{ minHeight: 56 }} value={input.comorbidities} onChange={(e) => set("comorbidities", e.target.value)} />
              </Field>
              <Field label={<>Medications {aiFilled["medications"] !== undefined && <AiBadge />}</>}>
                <textarea className="mf-textarea" style={{ minHeight: 56 }} value={input.medications} onChange={(e) => set("medications", e.target.value)} />
              </Field>
            </div>
          </Card>

          <SectionLabel>Atypical pattern</SectionLabel>
          <Card>
            <CheckField label="Pattern is atypical for this condition group"
              hint="Overlaps with neuropathy, cervical radiculopathy, RA, hip OA, piriformis, etc."
              checked={input.atypical.present} onChange={(v) => set("atypical.present", v)} />
            {input.atypical.present && (
              <Field label="Suggested alternative assessment">
                <input type="text" className="mf-input" style={{ maxWidth: 320 }}
                  placeholder="e.g. neurology, rheumatology, spine, hip"
                  value={input.atypical.suggestion} onChange={(e) => set("atypical.suggestion", e.target.value)} />
              </Field>
            )}
          </Card>
        </div>

        <SummaryCard title={
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            Triage result
            <button type="button" className="mf-toggle-link" style={{ fontSize: 11, fontWeight: 500 }}
              onClick={() => setShowLegend((v) => !v)}>
              {showLegend ? "Hide legend" : "What do these mean?"}
            </button>
          </span>
        }>
          {showLegend && (
            <div style={{ textAlign: "left", fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "0 0 14px" }}>
              <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Urgency</p>
              <p style={{ margin: "0 0 8px" }}>
                <b>Routine</b> — mild/moderate, no red flags · <b>Priority</b> — severe, major functional impairment · <b>Urgent</b> — a red flag (infection, trauma, neuro deficit) is present.
              </p>
              <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Missing information</p>
              <p style={{ margin: "0 0 8px" }}>
                What this checks for: symptom duration, severity, functional impact, red flags, physical exam, investigations, management attempted, comorbidities, medications. A flag means that item hasn't been filled in yet.
              </p>
              <p style={{ fontWeight: 700, color: "var(--ink)", margin: "0 0 2px" }}>Referral appropriateness</p>
              <p style={{ margin: 0 }}>
                <b>Appropriate</b> — meets pathway criteria · <b>Not appropriate yet</b> — conservative management not yet tried · <b>Urgent referral required</b> — a red flag · <b>Consider alternative diagnosis</b> — pattern is atypical.
              </p>
            </div>
          )}
          <SummaryRow k="Condition" v={CONDITION_GROUPS.find((c) => c.id === result.conditionGroup)?.label} />
          <SummaryRow k="Severity" v={<StatusPillSmall color={MSK_RESULT_TONE[result.severity]}>{result.severity}</StatusPillSmall>} />
          <SummaryRow k="Urgency" v={<StatusPillSmall color={MSK_RESULT_TONE[result.urgency]}>{result.urgency}</StatusPillSmall>} />
          <SummaryRow k="Referral" v={result.referralAppropriateness} />
          {result.missingInfo.length > 0 && (
            <>
              <p className="mf-summary-title" style={{ marginTop: 14 }}>Missing information</p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.6, color: "var(--amber)", textAlign: "left" }}>
                {result.missingInfo.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </>
          )}
          <p className="mf-summary-title" style={{ marginTop: 14 }}>Suggested next steps</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-soft)", textAlign: "left" }}>
            {result.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </SummaryCard>
      </div>

      <div className="mf-info-strip">
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Deterministic decision support only — not a diagnosis. A physician must review every field and finding before proceeding.
      </div>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to clinical pathway" />
    </PageShell>
  );
}

/* ── Stage 3b: Clinical pathway assessment (structured, progressive) ────── */

function AlertBanner({ tone = "clay", title, children }) {
  return (
    <div className="mf-verdict mf-verdict-gap" style={tone === "clay" ? { background: "var(--clay-soft)", color: "var(--clay)" } : undefined}>
      <AlertTriangle size={16} />
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

function PageClinicalPathway({ conditionGroup, onChangeConditionGroup, sections, onNext, onBack }) {
  const form = PATHWAY_FORMS[conditionGroup];

  return (
    <PageShell title="Clinical pathway assessment"
      subhead={form
        ? `${form.title} — a structured walk-through pre-filled from the AI extraction where the note already says so; every value stays editable. Each section unlocks the next; nothing here blocks moving on.`
        : "A structured walk-through of the written primary-care pathway for the condition confirmed at MSK Triage."}>

      <Field label="Pathway">
        <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
          {CONDITION_GROUPS.map((c) => (
            <button type="button" key={c.id} className={`mf-channel-btn${conditionGroup === c.id ? " active" : ""}`}
              onClick={() => onChangeConditionGroup?.(c.id)} style={{ flex: "1 1 150px" }}>
              {c.label}
              {!PATHWAY_FORMS[c.id] && <span style={{ opacity: 0.6 }}> (soon)</span>}
            </button>
          ))}
        </div>
      </Field>

      {form ? (
        <ClinicalPathwayForm key={conditionGroup} conditionGroup={conditionGroup} sections={sections} onNext={onNext} onBack={onBack} />
      ) : (
        <>
          <div className="mf-info-strip">
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            No written pathway yet for {CONDITION_GROUPS.find((c) => c.id === conditionGroup)?.label || conditionGroup} —
            pick another tab above, or continue; the generic rules still apply.
          </div>
          <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to validation & rules" />
        </>
      )}
    </PageShell>
  );
}

function ClinicalPathwayForm({ conditionGroup, sections, onNext, onBack }) {
  const form = PATHWAY_FORMS[conditionGroup];

  // Computed once per mount — this component is remounted (via `key`) every
  // time the pathway tab changes, so there's no stale-suggestion risk.
  const [aiFilled, setAiFilled] = useState(() => inferPathwayFieldsFromSections(form, sections));
  const aiVal = (kind, sub) => aiFilled[sub !== undefined ? `${kind}::${sub}` : kind];
  const clearAiFlag = (kind, sub) => {
    const key = sub !== undefined ? `${kind}::${sub}` : kind;
    setAiFilled((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const clearAllAiSuggestions = () => {
    setSelectValues({});
    setRadioValue("");
    setSymptomsChecked({});
    setComorbidities("");
    setImagingChoice(null);
    setManagementChecked({});
    setAiFilled({});
  };

  const [eligible, setEligible] = useState(true);
  const [historyDone, setHistoryDone] = useState(false);
  const [selectValues, setSelectValues] = useState(() => {
    const out = {};
    for (const [k, v] of Object.entries(aiFilled)) if (k.startsWith("selectValues::")) out[k.slice(14)] = v;
    return out;
  });
  const [radioValue, setRadioValue] = useState(() => aiFilled["radioValue"] || "");
  const [symptomsChecked, setSymptomsChecked] = useState(() => {
    const out = {};
    for (const k of Object.keys(aiFilled)) if (k.startsWith("symptomsChecked::")) out[k.slice(17)] = true;
    return out;
  });
  const [comorbidities, setComorbidities] = useState(() => aiFilled["comorbidities"] || "");

  const [redFlagsDone, setRedFlagsDone] = useState(false);
  const [redFlagChecked, setRedFlagChecked] = useState({});

  const [anatomicalKey, setAnatomicalKey] = useState(null);
  const [imagingChoice, setImagingChoice] = useState(() => aiFilled["imagingChoice"] || null);
  const [managementChecked, setManagementChecked] = useState(() => {
    const out = {};
    for (const k of Object.keys(aiFilled)) if (k.startsWith("managementChecked::")) out[k.slice(19)] = true;
    return out;
  });
  const [injectionChecked, setInjectionChecked] = useState({});

  const aiCount = Object.keys(aiFilled).length;
  const redFlagSymptomChecked = form.history.redFlagSymptom && symptomsChecked[form.history.redFlagSymptom];
  const triggeredGroups = form.redFlagGroups.filter((g, gi) => g.items.some((_, i) => redFlagChecked[`${gi}::${i}`]));
  const anatomicalSelection = form.anatomical?.options.find((o) => o.key === anatomicalKey);
  const imagingRevealed = form.anatomical ? Boolean(anatomicalSelection) : redFlagsDone;

  return (
    <>
      {aiCount > 0 && (
        <div className="mf-ai-banner">
          <span><Sparkles size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            {aiCount} field{aiCount === 1 ? "" : "s"} pre-filled from the AI extraction — review each before continuing.</span>
          <button type="button" className="mf-mini-btn ghost" onClick={clearAllAiSuggestions}>Clear AI suggestions</button>
        </div>
      )}

      <SectionLabel>1. Initial eligibility</SectionLabel>
      <Card>
        <CheckField label={form.eligibility.label} checked={eligible} onChange={setEligible} />
        {!eligible && (
          <div className="mf-info-strip" style={{ marginTop: 10 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {form.eligibility.warning}
          </div>
        )}
      </Card>

      {eligible && (
        <>
          <SectionLabel>2. History & details</SectionLabel>
          <Card>
            <div className="mf-field-grid">
              {form.history.selects.map((s) => (
                <PillGroup key={s.key} label={s.label} value={selectValues[s.key]} aiValue={aiVal("selectValues", s.key)}
                  onChange={(v) => { setSelectValues((prev) => ({ ...prev, [s.key]: v })); clearAiFlag("selectValues", s.key); }}
                  options={s.options.map((o) => ({ value: o, label: o }))} />
              ))}
              {form.history.radio && (
                <PillGroup label={form.history.radio.label} value={radioValue} aiValue={aiVal("radioValue")}
                  onChange={(v) => { setRadioValue(v); clearAiFlag("radioValue"); }}
                  options={form.history.radio.options.map((o) => ({ value: o, label: o }))} />
              )}
            </div>
            <Field label="Symptoms — check all that apply">
              {form.history.symptoms.map((s) => (
                <CheckField key={s} label={s} danger={s === form.history.redFlagSymptom}
                  hint={s === form.history.redFlagSymptom ? "Alone warrants red-flag screening below" : undefined}
                  checked={Boolean(symptomsChecked[s])} ai={Boolean(aiVal("symptomsChecked", s))}
                  onChange={(v) => { setSymptomsChecked((prev) => ({ ...prev, [s]: v })); clearAiFlag("symptomsChecked", s); }} />
              ))}
            </Field>
            <Field label={<>Comorbidities {aiVal("comorbidities") !== undefined && <AiBadge />}</>}>
              <input type="text" className="mf-input" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box" }}
                placeholder={form.history.comorbiditiesPlaceholder} value={comorbidities}
                onChange={(e) => { setComorbidities(e.target.value); clearAiFlag("comorbidities"); }} />
            </Field>
            {!historyDone && (
              <button className="mf-primary-btn" onClick={() => setHistoryDone(true)} style={{ marginTop: 4 }}>
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
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 12px" }}>
              Check any that apply based on history and exam. Any selection triggers that category's pathway.
            </p>
            <div className="mf-info-strip" style={{ margin: "0 0 12px", background: "transparent", border: "1px dashed #E3B8B4", color: "var(--clay)" }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Never auto-filled from the AI extraction — check these only from your own reading of the note and exam.
            </div>
            {redFlagSymptomChecked && (
              <AlertBanner title={`${form.history.redFlagSymptom} reported in history`}>
                This symptom alone is a red flag — screen carefully below.
              </AlertBanner>
            )}
            <div className="mf-field-grid">
              {form.redFlagGroups.map((group, gi) => (
                <div key={group.label} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: "var(--ink)" }}>{group.label}</div>
                  {group.items.map((item, i) => (
                    <CheckField key={i} label={item} danger checked={Boolean(redFlagChecked[`${gi}::${i}`])}
                      onChange={(v) => setRedFlagChecked((prev) => ({ ...prev, [`${gi}::${i}`]: v }))} />
                  ))}
                </div>
              ))}
            </div>
            {triggeredGroups.map((g) => (
              <AlertBanner key={g.label} tone={g.tone || "clay"} title={`${g.label} — action required`}>
                {g.action}
              </AlertBanner>
            ))}
            {!redFlagsDone && (
              <button className="mf-primary-btn" onClick={() => setRedFlagsDone(true)} style={{ marginTop: 12 }}>
                {triggeredGroups.length > 0 ? "Acknowledged — continue anyway" : "No red flags — continue"} <ArrowRight size={15} />
              </button>
            )}
          </Card>
        </>
      )}

      {redFlagsDone && form.anatomical && (
        <>
          <SectionLabel>4. {form.anatomical.label}</SectionLabel>
          <Card>
            <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
              {form.anatomical.options.map((o) => (
                <button type="button" key={o.key} className={`mf-channel-btn${anatomicalKey === o.key ? " active" : ""}`}
                  onClick={() => setAnatomicalKey(o.key)} style={{ flex: "1 1 140px" }}>
                  {o.label}
                </button>
              ))}
            </div>
            {anatomicalSelection && (
              <div style={{ marginTop: 14 }}>
                <p className="mf-section-title">Differential diagnoses — {anatomicalSelection.label}</p>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                  {anatomicalSelection.differentials.map((d) => <li key={d}>{d}</li>)}
                </ul>
                {anatomicalSelection.warning && (
                  <div className="mf-info-strip" style={{ marginTop: 10 }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {anatomicalSelection.warning}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {imagingRevealed && (
        <>
          <SectionLabel>{form.anatomical ? "5" : "4"}. Imaging & management plan</SectionLabel>
          <Card>
            <p className="mf-section-title">Diagnostic imaging</p>
            <div className="mf-channel-row" style={{ flexWrap: "wrap", marginBottom: 10 }}>
              {form.imaging.options.map((o) => (
                <button type="button" key={o.label} className={`mf-channel-btn${imagingChoice === o.label ? " active" : ""}`}
                  onClick={() => { setImagingChoice(o.label); clearAiFlag("imagingChoice"); }} style={{ flex: "1 1 160px" }} title={o.detail}>
                  {o.label}
                  {aiVal("imagingChoice") === o.label && <AiBadge />}
                </button>
              ))}
            </div>
            <div className="mf-info-strip" style={{ marginBottom: 16 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {form.imaging.note}
            </div>

            <p className="mf-section-title">Conservative / non-operative plan</p>
            <div className="mf-field-grid">
              {form.management.items.map((item) => (
                <CheckField key={item} label={item} checked={Boolean(managementChecked[item])} ai={Boolean(aiVal("managementChecked", item))}
                  onChange={(v) => { setManagementChecked((prev) => ({ ...prev, [item]: v })); clearAiFlag("managementChecked", item); }} />
              ))}
            </div>

            <p className="mf-section-title" style={{ marginTop: 14 }}>Injection considerations</p>
            {form.management.injections.map((inj) => (
              <div key={inj.label}>
                <CheckField label={inj.label} checked={Boolean(injectionChecked[inj.label])}
                  onChange={(v) => setInjectionChecked((prev) => ({ ...prev, [inj.label]: v }))} />
                {inj.warning && injectionChecked[inj.label] && (
                  <div className="mf-verdict mf-verdict-gap" style={{ background: "var(--clay-soft)", color: "var(--clay)", marginTop: 4, marginBottom: 8 }}>
                    <AlertTriangle size={14} /> {inj.warning}
                  </div>
                )}
              </div>
            ))}

            <div className="mf-info-strip" style={{ marginTop: 16 }}>
              <ScrollText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {form.followUp}
            </div>

            <button className="mf-ghost-btn" onClick={() => window.print()} style={{ marginTop: 12 }}>
              Print summary
            </button>
          </Card>
        </>
      )}

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to validation & rules" />
    </>
  );
}

/* ── Stage 3c: Clinical validation + Rules Engine ───────────────────────── */

function PageValidation({ signal, genericSignals, loading, error, ready, onRetry, onNext, onBack }) {
  return (
    <PageShell title="Clinical validation & rules"
      subhead="AI-assisted pathway check. A language model reads the extraction and judges it against the knee referral pathway's criteria and red flags (app/services/pathways/knee.yaml) — not keyword matching, an actual reading of each item. Urgency and missing criteria are still derived deterministically from those judgments. Generic signals below stay keyword-based. A physician must verify every finding before proceeding.">
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
          <button className="mf-inline-link" onClick={onRetry} style={{ marginLeft: 8 }}>Retry</button>
        </div>
      )}
      <div className="mf-provenance">
        <span className="mf-prov-pill">pathway <b>{signal.title}</b></span>
        <span className="mf-prov-pill">matched pack <b>{String(signal.matched)}</b></span>
        {ready && signal.model_id && <span className="mf-prov-pill">model <b>{signal.model_id}</b></span>}
        {ready && signal.duration_seconds != null && (
          <span className="mf-prov-pill">{signal.token_count} tokens · {Math.round(signal.duration_seconds)}s</span>
        )}
        <span className={`mf-urgency mf-urgency-${signal.urgency}`}>{signal.urgency}</span>
      </div>

      <div className={`mf-verdict mf-verdict-${signal.urgency === "routine" ? "clean" : "gap"}`}>
        {signal.urgency === "routine" ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
        {urgencyCopy[signal.urgency]}
      </div>

      <SectionLabel>Referral criteria for this pathway</SectionLabel>
      <Card>
        {signal.criteria.map((c) => (
          <div className="mf-criterion-row" key={c.id}>
            <span className={`mf-criterion-mark ${c.met ? "met" : c.required ? "missing" : "optional"}`}>
              {c.met ? "✓" : c.required ? "!" : "–"}
            </span>
            <div className="mf-criterion-body">
              <span className="mf-criterion-label">{c.label}</span>
              {!c.required && <span className="mf-criterion-req">optional</span>}
              {c.required && !c.met && <span className="mf-criterion-req" style={{ color: "var(--clay)" }}>required — missing</span>}
              {c.evidence && <span className="mf-criterion-ev">matched: “{c.evidence}”</span>}
            </div>
          </div>
        ))}
      </Card>

      <SectionLabel>Red-flag screening</SectionLabel>
      <Card>
        {["Locked knee / true mechanical locking", "Unable to weight-bear", "Possible septic joint (hot, swollen, febrile)", "Acute significant trauma / suspected fracture"].map((rf) => {
          const hit = signal.red_flags.some((x) => x.toLowerCase().includes(rf.split(" ")[0].toLowerCase()));
          return (
            <div className="mf-redflag-row" key={rf}>
              <span className={hit ? "mf-redflag-hit" : ""}>{hit ? "⚠" : "○"}</span>
              <span className={hit ? "mf-redflag-hit" : ""}>{rf} — {hit ? "PRESENT" : "not detected"}</span>
            </div>
          );
        })}
      </Card>

      <SectionLabel>Generic signals</SectionLabel>
      <Card>
        {genericSignals.map((s) => (
          <RuleRow key={s.rule} met={s.outcome}
            label={`${s.rule}: ${s.outcome ? "yes" : "no"}`} detail={s.detail} />
        ))}
      </Card>

      {signal.missing.length > 0 && (
        <div className="mf-verdict mf-verdict-gap">
          <AlertTriangle size={16} />
          <span>Missing before referral: <b>{signal.missing.join("; ")}</b> — the specialist is likely to return this without it.</span>
        </div>
      )}

      <PageNav onBack={onBack} onNext={ready && !loading ? onNext : undefined} nextLabel="Generate referral draft" />
    </PageShell>
  );
}

/* ── Stage 4: Referral draft ───────────────────────────────────────────── */

function PageReferral({ signal, letterBody, setLetterBody, onNext, onBack }) {
  const [editing, setEditing] = useState(false);
  return (
    <PageShell title="Referral draft"
      subhead="The Document Generation Engine renders the approved extraction into the pathway template — a deterministic Jinja2 render, no free-form AI writing. Nothing here is a clinical decision."
      headerRight={
        <button className="mf-toggle-link" onClick={() => setEditing((v) => !v)}>
          <Pencil size={14} /> {editing ? "Preview" : "Edit draft"}
        </button>
      }>
      <div className="mf-meta-row">
        <MetaPill k="Template" v="Knee — orthopaedic referral" />
        <MetaPill k="Urgency" v={signal.urgency} />
        <MetaPill k="Status" v="For review" />
      </div>

      <div className="mf-toolbar">
        <button className="mf-tool-btn" onClick={() => setLetterBody(REFERRAL_DRAFT)}><RefreshCw size={13} /> Regenerate from approved data</button>
      </div>

      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <div className="mf-letter-date">10 September 2026</div>
        {editing
          ? <textarea className="mf-edit-textarea" value={letterBody} onChange={(e) => setLetterBody(e.target.value)} />
          : <pre className="mf-letter-body" style={{ whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{letterBody}</pre>}
        <div className="mf-letter-attach"><Paperclip size={13} /> Knee_XRay_WeightBearing_Report.pdf</div>
      </div>

      <div className="mf-info-strip">
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The <b>PATHWAY CHECK</b> block is the rules‑engine output embedded verbatim — the specialist sees exactly which
        criteria were met and which (if any) are missing.
      </div>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Send to physician review" />
    </PageShell>
  );
}

/* ── Stage 5: Physician review & authorisation ─────────────────────────── */

function PageReview({ signal, letterBody, sections, decision, setDecision, onNext, onBack }) {
  const [showNote, setShowNote] = useState(false);
  const original = sections || AI_REQUEST.result.sections;

  return (
    <PageShell title="Physician review & authorisation"
      subhead="Everything below is a proposal from the pipeline. The physician confirms it against the source note, then approves, edits, or rejects — and that decision seeds the feedback dataset."
      headerRight={
        <button className="mf-toggle-link" onClick={() => setShowNote((v) => !v)}>
          {showNote ? <EyeOff size={15} /> : <Eye size={15} />} {showNote ? "Hide" : "View"} original note
        </button>
      }>
      {showNote && (
        <div className="mf-note-box"><p className="mf-note-box-title">Original visit note</p><pre className="mf-mono-block">{SAMPLE_NOTE}</pre></div>
      )}

      <Accordion title="AI extraction" badge={`${original.length} sections · all grounded`} tone="sage">
        <ul>{original.map((s, i) => <li key={i}><b>{s.title}:</b> {s.content}</li>)}</ul>
      </Accordion>
      <Accordion title="Pathway check" badge={`${signal.urgency} · ${signal.complete ? "complete" : "gap"}`}
        tone={signal.urgency === "routine" ? "sage" : "amber"}>
        <ul>
          {signal.criteria.map((c) => <li key={c.id}>{c.met ? "✓" : "✗"} {c.label}{c.required ? "" : " (optional)"}</li>)}
          <li>Red flags: {signal.red_flags.length ? signal.red_flags.join("; ") : "none"}</li>
        </ul>
      </Accordion>
      <Accordion title="Referral draft" badge="deterministic template" tone="sage">
        <pre className="mf-mono-block" style={{ maxHeight: 200, overflow: "auto" }}>{letterBody}</pre>
      </Accordion>

      <SectionLabel>Your decision</SectionLabel>
      <div className="mf-choice-row">
        {[
          ["approved", "Approve", "Extraction and draft are accurate — proceed to routing."],
          ["edited", "Approve with edits", "You corrected the extraction — the edits are recorded."],
          ["rejected", "Reject", "Send back for re-extraction or manual handling."],
        ].map(([k, t, s]) => (
          <button key={k} className={`mf-choice${decision === k ? " active" : ""}`} onClick={() => setDecision(k)}>
            <div className="mf-choice-title">{t}</div>
            <div className="mf-choice-sub">{s}</div>
          </button>
        ))}
      </div>

      <div className="mf-info-strip">
        <ScrollText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The decision is posted to <code>/v1/feedback</code> with the model + prompt version. The raw note is never stored —
        only a hash — so the dataset is de‑identified from the start.
      </div>

      <PageNav onBack={onBack} onNext={decision ? onNext : undefined}
        nextLabel={decision === "rejected" ? "Return case" : "Continue to routing"} />
      {!decision && <p className="mf-tiny-note" style={{ textAlign: "right" }}>Choose a decision to continue.</p>}
    </PageShell>
  );
}

/* ── Stage 6: Route & send ─────────────────────────────────────────────── */

function PageSend({ letterBody, specialist, setSpecialist, channel, setChannel, attested, setAttested, sendState, setSendState, specialistOptions, routing, clinicTown, isTownOverridden, onChangeTown, onSent, onBack }) {
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
    window.setTimeout(() => { setSendState("sent"); onSent(); }, 1100);
  };

  if (sendState === "sent") {
    return (
      <PageShell title="Referral sent and logged" subhead="">
        <div className="mf-sent-card">
          <div className="mf-sent-icon"><Check size={18} /></div>
          <h3 className="mf-sent-title">Sent to {selected?.name}</h3>
          <p className="mf-sent-body">{selected?.practice}. The full pipeline trace — extraction, rules, draft, and your
            authorisation — is attached to the case's immutable audit log.</p>
          <div className="mf-sent-meta">
            <div><span>Case</span><span>{CASE_ID}</span></div>
            <div><span>Channel</span><span>{channel === "fax" ? "Secure e-fax" : channel === "message" ? "Encrypted message" : "REST API"}</span></div>
            {selected?.fax && <div><span>Fax</span><span>{selected.fax}</span></div>}
            <div><span>Status</span><span>Awaiting delivery confirmation</span></div>
          </div>
        </div>
        <PageNav onBack={onBack} onNext={onSent} nextLabel="View feedback & audit" />
      </PageShell>
    );
  }

  return (
    <PageShell title="Route & send" subhead="Pick the specialist and channel. The Communication Engine transmits the approved package — the referral is not editable past this point.">
      <SectionLabel>Draft (approved)</SectionLabel>
      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <pre className="mf-letter-body" style={{ whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{letterBody}</pre>
      </div>

      <SectionLabel>Specialist</SectionLabel>
      <div className="mf-info-strip" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {routing ? <MapPin size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>
            {routing
              ? <>{isTownOverridden ? "Routed for this referral from" : "Auto-routed from your clinic in"} <b>{clinicTown}</b> → <b>{routing.hub}</b> ({routing.zone}).</>
              : "Set a clinic town to auto-route to the correct AHS referral hub — showing a generic directory for now."}
            {" "}
            <button type="button" className="mf-toggle-link" style={{ display: "inline", padding: 0 }}
              onClick={() => setEditingTown((v) => !v)}>
              {editingTown ? "Cancel" : routing ? "Change" : "Set a town"}
            </button>
            {isTownOverridden && !editingTown && (
              <> · <button type="button" className="mf-toggle-link" style={{ display: "inline", padding: 0 }} onClick={resetTown}>Use my profile town</button></>
            )}
          </span>
        </div>
        {editingTown && (
          <div className="mf-select-wrap" style={{ maxWidth: 360 }}>
            <select className="mf-select" value={ALL_ALBERTA_TOWNS.includes(clinicTown) ? clinicTown : ""}
              onChange={(e) => applyTownChange(e.target.value)} autoFocus>
              <option value="" disabled>Select a town — grouped by AHS referral hub</option>
              {ALBERTA_REFERRAL_HUBS.map((hub) => (
                <optgroup key={hub.id} label={`${hub.name} — ${hub.zone}`}>
                  {hub.towns.map((entry) => {
                    const name = typeof entry === "string" ? entry : entry.name;
                    const rawNote = typeof entry === "string" ? null : entry.note;
                    const resolved = resolveReferralHub(name);
                    // A town split across hubs (e.g. Camrose) is listed once,
                    // under its actual primary hub — not duplicated with a
                    // different label under the alternate hub too.
                    if (resolved.hub !== hub.name) return null;
                    const hint = rawNote || resolved.alternates[0]?.condition;
                    return <option key={name} value={name}>{hint ? `${name} — ${hint}` : name}</option>;
                  })}
                </optgroup>
              ))}
            </select>
            <ChevronDown size={16} className="mf-select-icon" />
          </div>
        )}
      </div>
      <div className="mf-specialist-wrap">
        <button className={`mf-specialist-trigger${!selected ? " placeholder" : ""}`} onClick={() => setOpen((v) => !v)}>
          {selected ? `${selected.name} — ${selected.practice}` : "Select a specialist"} <ChevronDown size={15} />
        </button>
        {open && (
          <div className="mf-specialist-menu">
            {specialistOptions.map((s) => (
              <button key={s.id} className="mf-specialist-option" onClick={() => { setSpecialist(s.id); setOpen(false); }}>
                <div>{s.name} <span className="mf-match-chip">{s.match}</span></div>
                <div className="mf-specialist-meta">{s.practice} · {s.fax ? `fax ${s.fax}` : `accepts ${s.accepts}`}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionLabel>Channel</SectionLabel>
      <div className="mf-channel-row">
        {["fax", "message", "api"].map((c) => (
          <button key={c} className={`mf-channel-btn${channel === c ? " active" : ""}`} onClick={() => setChannel(c)}>
            {c === "fax" ? "Secure e-fax" : c === "message" ? "Encrypted message" : "REST API"}
          </button>
        ))}
      </div>

      <div className="mf-attest-box">
        <label className="mf-attest-row">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          I have reviewed this referral against the original note and authorise it to be sent.
        </label>
      </div>

      <div className="mf-page-nav">
        <button className="mf-ghost-btn" onClick={onBack}><ArrowLeft size={15} /> Back</button>
        <button className="mf-primary-btn" disabled={!canSend} onClick={send}>
          {sendState === "sending" ? <><RefreshCw size={14} className="mf-spin" /> Sending…</> : <>Send referral <Send size={15} /></>}
        </button>
      </div>
    </PageShell>
  );
}

/* ── Stage 7: Feedback & audit ─────────────────────────────────────────── */

function PageFeedback({ decision, channel, specialist, onBack }) {
  const fb = { ...FEEDBACK_RECORD, decision: decision || "approved" };
  return (
    <PageShell title="Feedback & audit trail"
      subhead="The case is closed. The physician's decision is now a de-identified training example, and every step is on the immutable audit log.">
      <SectionLabel>Continuous-learning record</SectionLabel>
      <Card>
        <SummaryRow k="Decision" v={<StatusPillSmall color={fb.decision === "rejected" ? "amber" : "sage"}>{fb.decision}</StatusPillSmall>} />
        <SummaryRow k="Model" v={fb.model_id} />
        <SummaryRow k="Prompt version" v={fb.prompt_version} />
        <SummaryRow k="Reviewer" v={fb.reviewer} />
        <SummaryRow k="Note" v={<span className="mf-grounded-phrase">hash {fb.note_hash.slice(0, 16)}… (raw note not stored)</span>} />
        {fb.decision === "edited" && <SummaryRow k="Comment" v={fb.comment} />}
      </Card>

      {fb.decision === "edited" && (
        <>
          <SectionLabel>What the physician changed</SectionLabel>
          <div className="mf-feedback-diff">
            Aggravating Factors:{"\n"}
            <span className="del">  Climbing stairs, prolonged standing</span>{"\n"}
            <span className="add">  Climbing stairs; prolonged standing at work</span>
          </div>
        </>
      )}

      <div className="mf-info-strip">
        <GitBranch size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Edits feed the pipeline <b>physician edits → anonymisation → dataset → evaluation → fine-tuning</b>. No automatic
        retraining — the dataset is built for human-reviewed evaluation first.
      </div>

      <SectionLabel>Case audit log</SectionLabel>
      <Card>
        {[
          ["15:19", "Case created", `${CASE_ID} · knee pathway`],
          ["15:20", "AI extraction queued", "POST /api/v1/ai/extractions → 202"],
          ["15:20", "Extraction completed", "8 sections, all grounded · medgemma-1.5-4b"],
          ["15:21", "Rules evaluated", `pathway=knee urgency=${PATHWAY_SIGNAL.urgency}`],
          ["15:21", "Draft generated", "Knee referral template"],
          ["15:24", `Physician ${fb.decision}`, `${fb.reviewer}`],
          ["15:25", "Referral sent", `${channel} → ${specialist?.name ?? "specialist"}`],
        ].map(([t, ev, d], i) => (
          <div className="mf-summary-row" key={i}>
            <span className="mf-summary-key">{t} · {ev}</span>
            <span className="mf-summary-val" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>{d}</span>
          </div>
        ))}
      </Card>

      <SectionLabel>Where this sits in the platform</SectionLabel>
      <Card>
        {MODULES.map((m) => (
          <div className="mf-summary-row" key={m.n}>
            <span className="mf-summary-key">{m.here ? "▸ " : ""}Module {m.n} — {m.name}</span>
            <span className="mf-summary-val" style={{ color: m.here ? "var(--blue)" : "var(--ink-soft)", fontSize: 12 }}>
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
      <ShieldCheck size={17} style={{ flexShrink: 0, marginTop: 1, color: "var(--blue)" }} />
      <span><b>Guiding principle.</b> {GUIDING_PRINCIPLE}</span>
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
      {onBack ? <button className="mf-ghost-btn" onClick={onBack}><ArrowLeft size={15} /> Back</button> : <span />}
      {onNext && <button className="mf-primary-btn" onClick={onNext}>{nextLabel} <ArrowRight size={15} /></button>}
    </div>
  );
}

function Field({ label, children }) {
  return <div className="mf-field"><label className="mf-label">{label}</label>{children}</div>;
}
function SectionLabel({ children }) { return <p className="mf-section-label">{children}</p>; }
function Card({ children, style }) { return <div className="mf-card" style={style}>{children}</div>; }

function RuleRow({ label, detail, met }) {
  return (
    <div className="mf-rule-row">
      <span className={`mf-rule-dot ${met ? "pass" : "fail"}`}>{met ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={10} />}</span>
      <span className="mf-rule-text">{label}{detail && <span className="mf-rule-detail">{detail}</span>}</span>
    </div>
  );
}

function SummaryCard({ title, children }) {
  return <div className="mf-summary-card"><p className="mf-summary-title">{title}</p>{children}</div>;
}
function SummaryRow({ k, v }) {
  return <div className="mf-summary-row"><span className="mf-summary-key">{k}</span><span className="mf-summary-val">{v}</span></div>;
}
function StatusPillSmall({ children, color }) {
  return <span className={`mf-status-pill-sm mf-status-pill-${color}`}>{children}</span>;
}
function MetaPill({ k, v }) { return <span className="mf-meta-pill">{k} <b>{v}</b></span>; }

function Accordion({ title, badge, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mf-accordion">
      <button className="mf-accordion-head" onClick={() => setOpen((v) => !v)}>
        <span className="mf-accordion-title">{title}<span className={`mf-accordion-badge mf-tone-${tone}`}>{badge}</span></span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && <div className="mf-accordion-body">{children}</div>}
    </div>
  );
}
