import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Sparkles, Database, ShieldCheck, Scale, FileSignature, UserCheck, User,
  Check, X, AlertTriangle, ChevronDown, ChevronRight, UploadCloud, Loader2, Send,
  Menu, ArrowRight, ArrowLeft, Eye, EyeOff, Pencil, RefreshCw, Info, Paperclip, Plus,
} from "lucide-react";
import { submitExtraction, getExtraction, isTerminal } from "./api";
import { LiveExtract, LiveData } from "./LiveExtraction";
import { syntaxHighlight, flattenSchema } from "./format";

/* ────────────────────────────────────────────────────────────────────────
   Demo case data — one continuous scenario across every stage.
   In production, everything from "extraction" onward is produced by the
   backend pipeline; here it's fixed so the whole flow is coherent to click
   through without a live NLP service behind it.
──────────────────────────────────────────────────────────────────────── */

const CASE_ID = "MED-2026-4821";
const ORG = "Riverside Orthopedic Group";

const EXAMPLE_NOTE = `52-year-old female presents with right knee pain for 3 months. Came on
gradually, no specific injury that she can recall. Pain is worse when
climbing stairs and after she's been on her feet a while at work, better
with rest. Some morning stiffness that loosens up after a few minutes.
Says it's about a 4 out of 10 sitting here, up to 7 when she's active,
and it's starting to get in the way of walking any distance. No fevers,
no giving way or locking, hasn't noticed the knee swelling up at home,
no other joints bothering her. Patient denies trauma. On exam the right
knee is not warm or swollen, tender along the inner joint line, moves
through a full range but uncomfortable at the end, ligaments feel stable,
walks with a slight limp on that side. X-ray shows moderate osteoarthritis
of the right knee with some narrowing of the inner joint space and a few
small spurs, no fracture. Will send her to orthopedics to take a look at
the chronic right knee pain.`;

const EXTRACTED = {
  patient: { age: 52, gender: "female", evidence: "52-year-old female" },
  symptom: { name: "knee pain", location: "right knee", duration: "3 months", evidence: "right knee pain for 3 months" },
  aggravating: { value: "climbing stairs", evidence: "worse when climbing stairs" },
  imaging: { type: "X-ray", finding: "moderate osteoarthritis", evidence: "X-ray shows moderate osteoarthritis" },
  trauma: { value: false, evidence: "Patient denies trauma" },
};

const CLASSIFICATION = {
  bodySystem: "Orthopedic",
  bodyPart: "Knee",
  workflow: "Orthopedic Referral — Knee pathway",
};

const COMPLETENESS_CHECKS = [
  { label: "Imaging finding documented", met: true, detail: "X-ray: moderate osteoarthritis" },
  { label: "Symptom duration documented", met: true, detail: "3 months" },
  { label: "Trauma status documented", met: true, detail: "Denied by patient" },
  { label: "Conservative therapy documented", met: false, detail: "Not mentioned anywhere in the note" },
];

const RED_FLAGS = [
  { label: "Fever or signs of infection" },
  { label: "Locking or inability to bear weight" },
  { label: "Suspected fracture or acute trauma", note: "Trauma explicitly denied" },
  { label: "Sudden or severe swelling" },
];

const PRIORITY_RULES = [
  { condition: "IF red flags detected → priority = Urgent", matched: false },
  { condition: "IF duration ≥ 3 months AND imaging present → priority = Routine", matched: true },
  { condition: "ELSE → priority = Routine (default)", matched: false },
];

const ELIGIBILITY_RULE = {
  label: "Conservative therapy documentation required before elective referral",
  met: false,
  detail: "Payer policy on file for this pathway requires documented conservative management.",
};

const SPECIALISTS = [
  { id: "s1", name: "Dr. Elena Marsh", practice: "Northside Orthopedic Institute", match: "Knee & sports medicine" },
  { id: "s2", name: "Dr. Priya Nandan", practice: "Harborview Joint Center", match: "Adult reconstruction, knee" },
  { id: "s3", name: "Dr. Raymond Cho", practice: "Bayview Sports Medicine", match: "General orthopedics" },
];

const LETTER_TEMPLATE = (gap) => `RE: Referral for a 52-year-old female — right knee pain evaluation

Patient reports knee pain in the right knee, present for 3 months, worse with climbing stairs. Trauma denied.

X-ray findings: moderate osteoarthritis.
${gap ? "\nNote: conservative therapy history is not documented in the source note. Per current payer policy, this may affect authorization — please confirm with the patient or chart before this referral is finalized.\n" : ""}
Requesting orthopedic evaluation and recommendations.`;

/* ────────────────────────────────────────────────────────────────────────
   Navigation
──────────────────────────────────────────────────────────────────────── */

const PATIENT_DEFAULTS = {
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

const NAV = [
  { id: "patient", label: "Patient info", icon: User },
  { id: "intake", label: "Case intake", icon: FileText },
  { id: "ai", label: "AI extraction", icon: Sparkles },
  { id: "structured", label: "Structured data", icon: Database },
  { id: "validation", label: "Clinical validation", icon: ShieldCheck },
  { id: "rules", label: "Business rules", icon: Scale },
  { id: "referral", label: "Referral generation", icon: FileSignature },
  { id: "review", label: "Doctor review", icon: UserCheck },
  // Live tabs — the real backend/AI round trip. Always reachable, outside the
  // linear demo flow above.
  { id: "live-extract", label: "AI extraction · live", icon: Sparkles, always: true, live: true },
  { id: "live-data", label: "Structured JSON · live", icon: Database, always: true, live: true },
];

const STATUS_BY_PAGE = {
  patient: "Draft",
  intake: "Draft",
  ai: "Processing",
  structured: "Processing",
  validation: "Processing",
  rules: "Processing",
  referral: "Awaiting review",
  review: "Awaiting review",
  "live-extract": "Live",
  "live-data": "Live",
};

export default function MedFlowApp() {
  const [page, setPage] = useState("patient");
  const [visited, setVisited] = useState({ patient: true });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Shared case state
  const [patient, setPatient] = useState(PATIENT_DEFAULTS);
  const [pathway, setPathway] = useState("knee");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [priority, setPriority] = useState("routine");
  const [specialist, setSpecialist] = useState("");
  const [channel, setChannel] = useState("fax");
  const [letterBody, setLetterBody] = useState(LETTER_TEMPLATE(true));
  const [sendState, setSendState] = useState("idle"); // idle | sending | sent
  const [attested, setAttested] = useState(false);
  const [ackGap, setAckGap] = useState(false);

  // Live AI extraction (the "· live" nav tabs only — the mocked wizard above is
  // untouched). The id is persisted so a refresh during the 10–30 min job recovers.
  const [liveId, setLiveId] = useState(() => {
    try { return localStorage.getItem("mf_live_extraction_id"); } catch { return null; }
  });
  const [live, setLive] = useState(null);

  useEffect(() => {
    try {
      if (liveId) localStorage.setItem("mf_live_extraction_id", liveId);
      else localStorage.removeItem("mf_live_extraction_id");
    } catch { /* ignore */ }
  }, [liveId]);

  // Poll the backend while the live job is still in flight.
  useEffect(() => {
    if (!liveId) return;
    if (live && isTerminal(live.status)) return;
    let alive = true;
    const tick = async () => {
      try {
        const rec = await getExtraction(liveId);
        if (alive) setLive(rec);
      } catch {
        /* transient — keep polling */
      }
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [liveId, live?.status]);

  const submitLive = useCallback(async (note, pathway) => {
    const rec = await submitExtraction({ note, pathway });
    setLive(rec);
    setLiveId(rec.id);
  }, []);

  const resetLive = useCallback(() => {
    setLive(null);
    setLiveId(null);
  }, []);

  const hasGap = COMPLETENESS_CHECKS.some((c) => !c.met);
  const currentIndex = NAV.findIndex((n) => n.id === page);
  const maxVisitedIndex = Math.max(...NAV.map((n, i) => (visited[n.id] ? i : -1)));

  const showToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const goTo = useCallback((id) => {
    setPage(id);
    setVisited((v) => ({ ...v, [id]: true }));
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const next = () => {
    if (currentIndex < NAV.length - 1) goTo(NAV[currentIndex + 1].id);
  };
  const back = () => {
    if (currentIndex > 0) goTo(NAV[currentIndex - 1].id);
  };

  const statusLabel = sendState === "sent" ? "Sent" : (STATUS_BY_PAGE[page] || "Live");

  return (
    <div className="mf-app">
      <GlobalStyle />

      <TopBar
        statusLabel={statusLabel}
        stepIndex={currentIndex}
        stepTotal={NAV.length}
        onMenuClick={() => setSidebarOpen((v) => !v)}
      />

      <div className="mf-body">
        <Sidebar
          nav={NAV}
          page={page}
          visited={visited}
          maxVisitedIndex={maxVisitedIndex}
          goTo={goTo}
          open={sidebarOpen}
          patient={patient}
          pathway={pathway}
          priority={priority}
        />

        <main className="mf-main">
          <div key={page} className="mf-page-transition">
            {page === "patient" && (
              <PagePatient
                patient={patient} setPatient={setPatient}
                onNext={() => { showToast("Patient info saved"); next(); }}
              />
            )}
            {page === "intake" && (
              <PageIntake
                pathway={pathway} setPathway={setPathway}
                notes={notes} setNotes={setNotes}
                files={files} setFiles={setFiles}
                onCreate={() => { showToast(`Case ${CASE_ID} created`); next(); }}
                onBack={back}
              />
            )}
            {page === "ai" && <PageAI onNext={next} />}
            {page === "structured" && <PageStructured onNext={next} onBack={back} />}
            {page === "live-extract" && (
              <LiveExtract
                live={live}
                submitLive={submitLive}
                resetLive={resetLive}
                goData={() => goTo("live-data")}
              />
            )}
            {page === "live-data" && (
              <LiveData live={live} goExtract={() => goTo("live-extract")} />
            )}
            {page === "validation" && <PageValidation hasGap={hasGap} onNext={next} onBack={back} />}
            {page === "rules" && (
              <PageRules
                priority={priority} setPriority={setPriority}
                onNext={() => { showToast("Priority and routing confirmed"); next(); }}
                onBack={back}
              />
            )}
            {page === "referral" && (
              <PageReferral
                letterBody={letterBody} setLetterBody={setLetterBody}
                hasGap={hasGap}
                onNext={() => { showToast("Draft passed to Doctor Review"); next(); }}
                onBack={back}
              />
            )}
            {page === "review" && (
              <PageReview
                letterBody={letterBody}
                specialist={specialist} setSpecialist={setSpecialist}
                channel={channel} setChannel={setChannel}
                attested={attested} setAttested={setAttested}
                ackGap={ackGap} setAckGap={setAckGap}
                hasGap={hasGap}
                sendState={sendState} setSendState={setSendState}
                onBack={back}
                onSent={() => showToast("Referral sent and logged")}
              />
            )}
          </div>
        </main>
      </div>

      {toast && <div className="mf-toast"><Check size={14} /> {toast}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Shell: top bar + sidebar
──────────────────────────────────────────────────────────────────────── */

function TopBar({ statusLabel, stepIndex, stepTotal, onMenuClick }) {
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
          <span className="mf-step-count">Step {stepIndex + 1} <span className="mf-step-count-of">of {stepTotal}</span></span>
          <span className={`mf-status-pill mf-status-${statusLabel.replace(/\s/g, "-").toLowerCase()}`}>{statusLabel}</span>
          <span className="mf-org-badge">{ORG}</span>
        </div>
      </div>
      <div className="mf-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="mf-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function initials(patient) {
  const f = (patient.firstName || "").trim()[0] || "";
  const l = (patient.lastName || "").trim()[0] || "";
  return (f + l).toUpperCase() || "—";
}

function Sidebar({ nav, page, visited, maxVisitedIndex, goTo, open, patient, pathway, priority }) {
  const currentIdx = nav.findIndex((x) => x.id === page);
  const doneCount = nav.filter((n, i) => visited[n.id] && i < currentIdx).length;
  const pathwayLabel = pathway ? pathway[0].toUpperCase() + pathway.slice(1) : "—";
  const priorityLabel = priority ? priority[0].toUpperCase() + priority.slice(1) : "—";
  const nameValid = (patient.firstName || "").trim() && (patient.lastName || "").trim();

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
          <p className="mf-sidebar-case-meta">{pathwayLabel} · {priorityLabel}</p>
        </div>

        <div className="mf-nav-progress">
          <span>Progress</span>
          <span>{doneCount}/{nav.length}</span>
        </div>

        <nav className="mf-nav">
          {nav.map((n, i) => {
            const Icon = n.icon;
            const isCurrent = n.id === page;
            const isDone = visited[n.id] && i < currentIdx && !n.always;
            const reachable = n.always || i <= maxVisitedIndex + 1;
            const state = isCurrent ? "current" : isDone ? "done" : reachable ? "upcoming" : "locked";
            return (
              <button
                key={n.id}
                className={`mf-nav-item is-${state}`}
                onClick={() => reachable && goTo(n.id)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
              >
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

/* ────────────────────────────────────────────────────────────────────────
   Page: Patient main info
──────────────────────────────────────────────────────────────────────── */

function PagePatient({ patient, setPatient, onNext }) {
  const [touched, setTouched] = useState(false);
  const set = (key) => (e) => setPatient((p) => ({ ...p, [key]: e.target.value }));

  const nameValid = patient.firstName.trim() && patient.lastName.trim();
  const dobValid = patient.dob.trim().length > 0;
  const canContinue = nameValid && dobValid;
  const submit = () => { setTouched(true); if (canContinue) onNext(); };

  const age = (() => {
    const d = new Date(patient.dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a;
  })();

  return (
    <PageShell title="Patient main info" subhead="Core demographics and coverage for this patient. This travels with the case through every stage — extraction, rules, and the referral letter.">
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
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="unknown">Unknown</option>
                </select>
                <ChevronDown size={16} className="mf-select-icon" />
              </div>
            </div>
            {touched && !dobValid && <p className="mf-error">Date of birth is required.</p>}
          </Field>

          <Field label="Medical record number (MRN)">
            <input className="mf-input" placeholder="MRN" value={patient.mrn} onChange={set("mrn")} />
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

          <Field label="Primary care physician">
            <input className="mf-input" placeholder="Referring / primary care physician" value={patient.pcp} onChange={set("pcp")} />
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
          <p className="mf-tiny-note">You can come back and edit this any time before the referral is sent.</p>
        </SummaryCard>
      </div>

      <PageNav onNext={submit} nextLabel="Continue to case intake" />
    </PageShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Case intake
──────────────────────────────────────────────────────────────────────── */

const PATHWAY_REQUIREMENTS = {
  knee: [
    { key: "imaging", label: "Weight-bearing X-ray", keywords: ["xray", "x-ray", "weightbearing", "radiograph"] },
    { key: "conservative", label: "Conservative therapy record", keywords: ["pt", "therapy", "conservative", "nsaid"] },
  ],
};

function PageIntake({ pathway, setPathway, notes, setNotes, files, setFiles, onCreate, onBack }) {
  const [dragOver, setDragOver] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const requirements = PATHWAY_REQUIREMENTS[pathway] ?? [];
  const isMet = (req) => files.some((f) => req.keywords.some((kw) => f.name.toLowerCase().includes(kw)));
  const notesValid = notes.trim().length > 0;
  const canSubmit = notesValid && pathway;

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).map((f) => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, name: f.name, size: f.size }));
    setFiles((prev) => [...prev, ...incoming]);
  };
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const loadExample = () => setNotes(EXAMPLE_NOTE);

  return (
    <PageShell title="Start a new referral" subhead="Paste the visit notes below. MedFlow reads them, drafts a structured referral, and holds it for your review before anything is sent.">
      <div className="mf-two-col">
        <div>
          <Field label="Referral pathway">
            <div className="mf-select-wrap">
              <select className="mf-select" value={pathway} onChange={(e) => setPathway(e.target.value)}>
                <option value="knee">Orthopedic — Knee</option>
                <option value="hip">Orthopedic — Hip</option>
                <option value="shoulder">Orthopedic — Shoulder</option>
                <option value="spine">Orthopedic — Spine</option>
              </select>
              <ChevronDown size={16} className="mf-select-icon" />
            </div>
          </Field>

          <Field label="Clinical notes">
            <div className="mf-label-row">
              <span />
              <button className="mf-inline-link" onClick={loadExample}>Load example note</button>
            </div>
            <textarea
              className="mf-textarea"
              placeholder="Paste the visit note here: chief complaint, history, exam findings, prior treatment, imaging..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {touched && !notesValid && <p className="mf-error">Add the visit notes before creating the case.</p>}
          </Field>

          <Field label="Supporting documents">
            {requirements.length > 0 && (
              <div className="mf-checklist">
                <p className="mf-checklist-title">Recommended for this pathway</p>
                {requirements.map((req) => {
                  const met = isMet(req);
                  return (
                    <div className="mf-checklist-row" key={req.key}>
                      <span className={`mf-checklist-dot${met ? " met" : ""}`}>{met && <Check size={10} strokeWidth={3} />}</span>
                      <span className={met ? "mf-checklist-met" : ""}>{req.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div
              className={`mf-dropzone${dragOver ? " drag" : ""}`}
              role="button" tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
            >
              <UploadCloud size={20} color="var(--ink-soft)" />
              <div className="mf-dropzone-title">Drop imaging or lab results here</div>
              <div className="mf-dropzone-sub">or click to browse — PDF, JPG, PNG up to 10MB</div>
              <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="mf-filelist">
                {files.map((f) => (
                  <div className="mf-file" key={f.id}>
                    <FileText size={14} color="var(--ink-soft)" />
                    <span className="mf-file-name">{f.name}</span>
                    <button className="mf-file-remove" onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </div>

        <SummaryCard title="Case summary">
          <SummaryRow k="Pathway" v={pathway ? `Orthopedic — ${pathway[0].toUpperCase()}${pathway.slice(1)}` : "Not selected"} />
          <SummaryRow k="Notes" v={`${notes.trim() ? notes.trim().split(/\s+/).length : 0} words`} />
          <SummaryRow k="Attachments" v={files.length} />
          <SummaryRow k="Status" v={<StatusPillSmall color="amber">Draft</StatusPillSmall>} />
          <button className="mf-primary-btn full" disabled={!canSubmit} onClick={() => { setTouched(true); if (canSubmit) onCreate(); }}>
            Create case <ArrowRight size={15} />
          </button>
          <p className="mf-tiny-note">A physician reviews and approves everything before anything is sent.</p>
        </SummaryCard>
      </div>

      <PageNav onBack={onBack} onNext={() => { setTouched(true); if (canSubmit) onCreate(); }} nextLabel="Create case & run extraction" />
    </PageShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: AI extraction
──────────────────────────────────────────────────────────────────────── */

function PageAI({ onNext }) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <PageShell
      title="AI extraction result"
      subhead="What the AI/NLP layer pulled from the note, with the exact source phrase behind every value. Anything not stated stays null — nothing here is inferred."
      headerRight={
        <button className="mf-toggle-link" onClick={() => setShowOriginal((v) => !v)}>
          {showOriginal ? <EyeOff size={15} /> : <Eye size={15} />} {showOriginal ? "Hide" : "View"} original note
        </button>
      }
    >
      {showOriginal && (
        <div className="mf-note-box">
          <p className="mf-note-box-title">Original visit note, as pasted at intake</p>
          <pre className="mf-mono-block">{EXAMPLE_NOTE}</pre>
        </div>
      )}

      <div className="mf-field-grid">
        <ExtractField label="Patient" value={`${EXTRACTED.patient.age}-year-old ${EXTRACTED.patient.gender}`} evidence={EXTRACTED.patient.evidence} />
        <ExtractField label="Symptom" value={`${EXTRACTED.symptom.name} — ${EXTRACTED.symptom.location}, ${EXTRACTED.symptom.duration}`} evidence={EXTRACTED.symptom.evidence} />
        <ExtractField label="Aggravating factor" value={EXTRACTED.aggravating.value} evidence={EXTRACTED.aggravating.evidence} />
        <ExtractField label="Imaging" value={`${EXTRACTED.imaging.type}: ${EXTRACTED.imaging.finding}`} evidence={EXTRACTED.imaging.evidence} />
        <ExtractField label="Trauma" value={EXTRACTED.trauma.value ? "Reported" : "Denied"} evidence={EXTRACTED.trauma.evidence} />
        <ExtractField label="Medications" isNull />
        <ExtractField label="Previous treatments" isNull />
        <ExtractField label="Diagnosis" isNull />
      </div>

      <div className="mf-info-strip">
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        The AI never fills in a diagnosis, treatment need, or referral decision on its own. If it isn't written in the note, it stays null — a clinician decides what it means.
      </div>

      <div className="mf-actions">
        <button className="mf-primary-btn" onClick={onNext}>See structured data <ArrowRight size={15} /></button>
      </div>
    </PageShell>
  );
}

function ExtractField({ label, value, evidence, isNull }) {
  return (
    <div className={`mf-field-card${isNull ? " null" : ""}`}>
      <p className="mf-field-key">{label}</p>
      {isNull ? (
        <span className="mf-null">Not stated in note</span>
      ) : (
        <>
          <p className="mf-field-value">{value}</p>
          <span className="mf-evidence">&ldquo;{evidence}&rdquo;</span>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Structured data
──────────────────────────────────────────────────────────────────────── */

const STRUCTURED_JSON = {
  case_id: CASE_ID,
  patient: EXTRACTED.patient,
  symptoms: [EXTRACTED.symptom],
  aggravating_factors: [EXTRACTED.aggravating],
  imaging: [EXTRACTED.imaging],
  trauma: EXTRACTED.trauma,
  medications: null,
  previous_treatments: null,
  diagnosis: null,
  classification: { body_system: CLASSIFICATION.bodySystem, body_part: CLASSIFICATION.bodyPart, suggested_workflow: CLASSIFICATION.workflow },
};

// Blank item templates for the "Editable fields" tab — the shapes the clinician
// can add when the AI missed something.
const BLANK_ITEM = {
  symptoms: { name: "", location: "", duration: "", evidence: "" },
  aggravating_factors: { value: "", evidence: "" },
  imaging: { type: "", finding: "", evidence: "" },
};

const LIST_FIELDS = {
  symptoms: [
    { key: "name", label: "Symptom" },
    { key: "location", label: "Location" },
    { key: "duration", label: "Duration" },
  ],
  aggravating_factors: [{ key: "value", label: "Factor" }],
  imaging: [
    { key: "type", label: "Modality" },
    { key: "finding", label: "Finding" },
  ],
};

function PageStructured({ onNext, onBack }) {
  const [tab, setTab] = useState("json");
  // One source of truth for all three tabs; starts from the AI/validation output.
  const [data, setData] = useState(() => JSON.parse(JSON.stringify(STRUCTURED_JSON)));
  const [dirty, setDirty] = useState(false);

  const edit = (mutate) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      mutate(next);
      return next;
    });
    setDirty(true);
  };

  const reset = () => { setData(JSON.parse(JSON.stringify(STRUCTURED_JSON))); setDirty(false); };

  const jsonString = JSON.stringify(data, null, 2);
  const schemaRows = flattenSchema(data);

  return (
    <PageShell
      title="Structured medical data"
      subhead="The exact output the AI hands to Clinical Validation — the machine contract, not the narrative summary."
      headerRight={dirty ? <button className="mf-toggle-link" onClick={reset}><RefreshCw size={14} /> Reset to AI output</button> : null}
    >
      <div className="mf-tabs">
        <button className={`mf-tab${tab === "json" ? " active" : ""}`} onClick={() => setTab("json")}>Raw JSON</button>
        <button className={`mf-tab${tab === "schema" ? " active" : ""}`} onClick={() => setTab("schema")}>Schema table</button>
        <button className={`mf-tab${tab === "fields" ? " active" : ""}`} onClick={() => setTab("fields")}>
          Editable fields{dirty ? <span className="mf-tab-dot" /> : null}
        </button>
      </div>

      {tab === "json" && (
        <div className="mf-code-panel"><pre dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonString) }} /></div>
      )}

      {tab === "schema" && (
        <div className="mf-table-wrap">
          <table className="mf-table">
            <thead><tr><th>Field</th><th>Type</th><th>Value</th></tr></thead>
            <tbody>
              {schemaRows.map((r) => <SchemaRow key={r.path} {...r} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === "fields" && <StructuredFields data={data} edit={edit} />}

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Run clinical validation" />
    </PageShell>
  );
}

function SchemaRow({ path, type, value }) {
  const colorMap = { string: "blue", number: "amber", boolean: "sage", null: "muted", array: "muted" };
  const muted = type === "null" || type === "array";
  return (
    <tr className={muted ? "muted-row" : ""}>
      <td className="mf-path">{path}</td>
      <td><span className={`mf-type-badge mf-type-${colorMap[type]}`}>{type}</span></td>
      <td className="mf-value">{value}</td>
    </tr>
  );
}

/* The "Editable fields" tab: the AI's validated structured result rendered as
   inputs so a clinician can correct it before it goes to Clinical Validation.
   Every edit flows back into the same object behind Raw JSON / Schema table. */
function StructuredFields({ data, edit }) {
  const setField = (path, val) => edit((d) => {
    const keys = path.split(".");
    let ref = d;
    for (let i = 0; i < keys.length - 1; i++) ref = ref[keys[i]];
    ref[keys[keys.length - 1]] = val;
  });

  const setListField = (list, i, key, val) => edit((d) => { d[list][i][key] = val; });
  const addItem = (list) => edit((d) => { d[list] = [...(d[list] || []), { ...BLANK_ITEM[list] }]; });
  const removeItem = (list, i) => edit((d) => { d[list].splice(i, 1); });

  // string|null and string[]|null fields — empty input means null.
  const setNullable = (path, raw, asList) => {
    const trimmed = raw.trim();
    if (!trimmed) return setField(path, null);
    setField(path, asList ? trimmed.split(",").map((s) => s.trim()).filter(Boolean) : trimmed);
  };
  const nullableValue = (v) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : v);

  return (
    <div className="mf-fields-view">
      <div className="mf-info-strip">
        <Pencil size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Correct anything the AI got wrong here. This is the last point a clinician can edit the structured data — Clinical Validation runs on exactly what these fields contain.
      </div>

      <SectionLabel>Patient</SectionLabel>
      <Card>
        <div className="mf-input-grid">
          <Field label="Age">
            <input className="mf-input" type="number" value={data.patient.age ?? ""}
              onChange={(e) => setField("patient.age", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          <Field label="Gender">
            <input className="mf-input" value={data.patient.gender ?? ""}
              onChange={(e) => setField("patient.gender", e.target.value || null)} />
          </Field>
        </div>
        <Field label="Evidence (source phrase)">
          <input className="mf-input" value={data.patient.evidence ?? ""}
            onChange={(e) => setField("patient.evidence", e.target.value || null)} />
        </Field>
      </Card>

      {["symptoms", "aggravating_factors", "imaging"].map((list) => {
        const title = { symptoms: "Symptom", aggravating_factors: "Aggravating factor", imaging: "Imaging" }[list];
        const items = data[list] || [];
        return (
          <div key={list}>
            <div className="mf-fields-list-head">
              <SectionLabel>{title === "Imaging" ? "Imaging" : `${title}s`}</SectionLabel>
              <button className="mf-mini-btn" onClick={() => addItem(list)}><Plus size={12} /> Add</button>
            </div>
            {items.length === 0 && <Card><span className="mf-null">None extracted</span></Card>}
            {items.map((item, i) => (
              <Card key={i}>
                <div className="mf-fields-item-head">
                  <span className="mf-fields-item-label">{title} {i + 1}</span>
                  <button className="mf-mini-btn ghost" onClick={() => removeItem(list, i)}><X size={12} /> Remove</button>
                </div>
                <div className="mf-input-grid">
                  {LIST_FIELDS[list].map((f) => (
                    <Field key={f.key} label={f.label}>
                      <input className="mf-input" value={item[f.key] ?? ""}
                        onChange={(e) => setListField(list, i, f.key, e.target.value)} />
                    </Field>
                  ))}
                </div>
                <Field label="Evidence (source phrase)">
                  <input className="mf-input" value={item.evidence ?? ""}
                    onChange={(e) => setListField(list, i, "evidence", e.target.value)} />
                </Field>
              </Card>
            ))}
          </div>
        );
      })}

      <SectionLabel>Trauma</SectionLabel>
      <Card>
        <div className="mf-input-grid">
          <Field label="Status">
            <div className="mf-select-wrap">
              <select className="mf-select" value={String(data.trauma?.value ?? "null")}
                onChange={(e) => edit((d) => {
                  d.trauma = d.trauma || { value: null, evidence: null };
                  d.trauma.value = e.target.value === "null" ? null : e.target.value === "true";
                })}>
                <option value="false">Denied</option>
                <option value="true">Reported</option>
                <option value="null">Not stated</option>
              </select>
              <ChevronDown size={16} className="mf-select-icon" />
            </div>
          </Field>
          <Field label="Evidence (source phrase)">
            <input className="mf-input" value={data.trauma?.evidence ?? ""}
              onChange={(e) => edit((d) => { d.trauma = d.trauma || { value: null, evidence: null }; d.trauma.evidence = e.target.value || null; })} />
          </Field>
        </div>
      </Card>

      <SectionLabel>Not stated in the note</SectionLabel>
      <Card>
        <Field label="Medications (comma-separated)">
          <input className="mf-input" placeholder="null — add only if documented" value={nullableValue(data.medications)}
            onChange={(e) => setNullable("medications", e.target.value, true)} />
        </Field>
        <Field label="Previous treatments (comma-separated)">
          <input className="mf-input" placeholder="null — add only if documented" value={nullableValue(data.previous_treatments)}
            onChange={(e) => setNullable("previous_treatments", e.target.value, true)} />
        </Field>
        <Field label="Diagnosis">
          <input className="mf-input" placeholder="null — a clinician assigns this, not the AI" value={nullableValue(data.diagnosis)}
            onChange={(e) => setNullable("diagnosis", e.target.value, false)} />
        </Field>
      </Card>

      <SectionLabel>Classification</SectionLabel>
      <Card>
        <div className="mf-input-grid">
          <Field label="Body system">
            <input className="mf-input" value={data.classification.body_system ?? ""}
              onChange={(e) => setField("classification.body_system", e.target.value || null)} />
          </Field>
          <Field label="Body part">
            <input className="mf-input" value={data.classification.body_part ?? ""}
              onChange={(e) => setField("classification.body_part", e.target.value || null)} />
          </Field>
        </div>
        <Field label="Suggested workflow">
          <input className="mf-input" value={data.classification.suggested_workflow ?? ""}
            onChange={(e) => setField("classification.suggested_workflow", e.target.value || null)} />
        </Field>
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Clinical validation
──────────────────────────────────────────────────────────────────────── */

function PageValidation({ hasGap, onNext, onBack }) {
  return (
    <PageShell title="Clinical validation" subhead="Fixed rules check completeness and scan for red-flag terms. This runs independently of the AI model.">
      <SectionLabel>Pathway completeness</SectionLabel>
      <Card>
        {COMPLETENESS_CHECKS.map((c) => (
          <RuleRow key={c.label} label={c.label} detail={c.detail} met={c.met} />
        ))}
      </Card>

      <SectionLabel>Red-flag screening</SectionLabel>
      <Card>
        {RED_FLAGS.map((f) => (
          <RuleRow key={f.label} label={`${f.label} — not detected`} detail={f.note} met />
        ))}
        {hasGap ? (
          <Verdict tone="gap"><AlertTriangle size={16} /> No red flags detected, but a completeness gap (conservative therapy) is carried forward to Business Rules.</Verdict>
        ) : (
          <Verdict tone="clean"><ShieldCheck size={16} /> No red flags and all pathway requirements are documented.</Verdict>
        )}
      </Card>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to business rules" />
    </PageShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Business rules
──────────────────────────────────────────────────────────────────────── */

function PageRules({ priority, setPriority, onNext, onBack }) {
  return (
    <PageShell title="Business rules" subhead="Operational logic — not clinical judgment — decides priority, routing, and eligibility from the validated data.">
      <SectionLabel>Priority scoring</SectionLabel>
      <Card>
        {PRIORITY_RULES.map((r, i) => (
          <div className={`mf-trace-row${r.matched ? " matched" : ""}`} key={i}>
            <span className="mf-trace-mark">{r.matched ? "✓" : "·"}</span>{r.condition}
          </div>
        ))}
        <div className="mf-priority-result">
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>Assigned priority</span>
          <select className="mf-priority-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergent">Emergent</option>
          </select>
        </div>
      </Card>

      <SectionLabel>Workflow routing</SectionLabel>
      <Card>
        <SummaryRow k="Body system" v={CLASSIFICATION.bodySystem} />
        <SummaryRow k="Body part" v={CLASSIFICATION.bodyPart} />
        <SummaryRow k="Workflow" v={CLASSIFICATION.workflow} />
        <div className="mf-specialist-list">
          {SPECIALISTS.map((s) => (
            <div className="mf-specialist-item" key={s.id}>
              <div><div className="mf-specialist-name">{s.name}</div><div className="mf-specialist-meta">{s.practice}</div></div>
              <span className="mf-match-chip">{s.match}</span>
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel>Eligibility &amp; administrative checks</SectionLabel>
      <Card>
        <RuleRow label="No existing open referral in this pathway within 90 days" met />
        <RuleRow label={ELIGIBILITY_RULE.label} detail={ELIGIBILITY_RULE.detail} met={ELIGIBILITY_RULE.met} />
        <Verdict tone="gap"><AlertTriangle size={16} /> This referral may face payer delay without conservative-therapy documentation. Carried into the referral letter.</Verdict>
      </Card>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to referral generation" />
    </PageShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Referral generation
──────────────────────────────────────────────────────────────────────── */

function PageReferral({ letterBody, setLetterBody, hasGap, onNext, onBack }) {
  const [showTrace, setShowTrace] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <PageShell
      title="Referral generation"
      subhead="The Document Generation Engine merges validated fields into the pathway letter template — no free-form AI writing."
      headerRight={<button className="mf-toggle-link" onClick={() => setShowTrace((v) => !v)}>{showTrace ? "Hide" : "How was this built?"}</button>}
    >
      <div className="mf-meta-row">
        <MetaPill k="Template" v="Orthopedic Referral — Knee v2" />
        <MetaPill k="Priority" v="Routine" />
        <MetaPill k="Status" v="Unsent" />
      </div>

      {showTrace && (
        <div className="mf-trace-box">
          <TraceRow field="patient.age, patient.gender" into="Subject line" />
          <TraceRow field="symptoms[0], aggravating_factors[0]" into="Paragraph 1" />
          <TraceRow field="imaging[0]" into="Paragraph 2" />
          <TraceRow field="business_rules.eligibility_gap" into="Paragraph 3 (gap disclosure)" />
        </div>
      )}

      <div className="mf-toolbar">
        <button className="mf-tool-btn" onClick={() => setLetterBody(LETTER_TEMPLATE(hasGap))}><RefreshCw size={13} /> Regenerate</button>
        <button className="mf-tool-btn" onClick={() => setEditing((v) => !v)}><Pencil size={13} /> {editing ? "Preview" : "Edit letter"}</button>
      </div>

      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <div className="mf-letter-date">August 16, 2026</div>
        {editing ? (
          <textarea className="mf-edit-textarea" value={letterBody} onChange={(e) => setLetterBody(e.target.value)} />
        ) : (
          <div className="mf-letter-body">{letterBody}</div>
        )}
        <div className="mf-letter-attach"><Paperclip size={13} /> Knee_XRay_WeightBearing_Report.pdf</div>
      </div>

      <PageNav onBack={onBack} onNext={onNext} nextLabel="Continue to doctor review" />
    </PageShell>
  );
}

function TraceRow({ field, into }) {
  return <div className="mf-trace-item"><span className="mf-trace-field">{field}</span><span>→ {into}</span></div>;
}

/* ────────────────────────────────────────────────────────────────────────
   Page: Doctor review
──────────────────────────────────────────────────────────────────────── */

function PageReview({
  letterBody, specialist, setSpecialist, channel, setChannel,
  attested, setAttested, ackGap, setAckGap, hasGap,
  sendState, setSendState, onBack, onSent,
}) {
  const [specialistOpen, setSpecialistOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const selected = SPECIALISTS.find((s) => s.id === specialist);
  const canSend = attested && (!hasGap || ackGap) && !!specialist && sendState === "idle";

  const handleSend = () => {
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
          <p className="mf-sent-body">{selected?.practice}. The full pipeline trace — extraction, validation, business rules, and your approval — is attached to the case's audit log.</p>
          <div className="mf-sent-meta">
            <div><span>Case</span><span>{CASE_ID}</span></div>
            <div><span>Channel</span><span>{channel === "fax" ? "Secure e-fax" : channel === "message" ? "Encrypted message" : "API"}</span></div>
            <div><span>Status</span><span>Awaiting delivery confirmation</span></div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Final review before sending"
      subhead="Everything below is a proposal from the pipeline. Nothing is sent until you confirm it against the original note and approve it."
      headerRight={<button className="mf-toggle-link" onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? <EyeOff size={15} /> : <Eye size={15} />} {showOriginal ? "Hide" : "View"} original note</button>}
    >
      {showOriginal && (
        <div className="mf-note-box"><p className="mf-note-box-title">Original visit note</p><pre className="mf-mono-block">{EXAMPLE_NOTE}</pre></div>
      )}

      <Accordion title="AI extraction" badge="5/8 fields" tone="sage">
        <ul><li>Patient: 52-year-old female</li><li>Symptom: knee pain, right knee, 3 months</li><li>Imaging: X-ray — moderate osteoarthritis</li><li>Trauma: denied</li><li>Medications, previous treatments, diagnosis: not stated</li></ul>
      </Accordion>
      <Accordion title="Clinical validation" badge="1 gap flagged" tone="amber">
        <ul><li>Imaging, duration, trauma: documented</li><li>Conservative therapy: not documented</li><li>Red flags: none detected</li></ul>
      </Accordion>
      <Accordion title="Business rules" badge="Routine priority" tone="sage">
        <ul><li>Priority: Routine</li><li>Workflow: {CLASSIFICATION.workflow}</li><li>Eligibility flag: conservative therapy missing</li></ul>
      </Accordion>

      <SectionLabel>Draft referral letter</SectionLabel>
      <div className="mf-letter">
        <div className="mf-letter-org">{ORG}</div>
        <div className="mf-letter-date">August 16, 2026</div>
        <div className="mf-letter-body">{letterBody}</div>
      </div>

      <div className="mf-specialist-wrap">
        <button className={`mf-specialist-trigger${!selected ? " placeholder" : ""}`} onClick={() => setSpecialistOpen((v) => !v)}>
          {selected ? `${selected.name} — ${selected.practice}` : "Select a specialist"} <ChevronDown size={15} />
        </button>
        {specialistOpen && (
          <div className="mf-specialist-menu">
            {SPECIALISTS.map((s) => (
              <button key={s.id} className="mf-specialist-option" onClick={() => { setSpecialist(s.id); setSpecialistOpen(false); }}>
                <div>{s.name}</div><div className="mf-specialist-meta">{s.practice}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mf-channel-row">
        {["fax", "message", "api"].map((c) => (
          <button key={c} className={`mf-channel-btn${channel === c ? " active" : ""}`} onClick={() => setChannel(c)}>
            {c === "fax" ? "Secure e-fax" : c === "message" ? "Encrypted message" : "API"}
          </button>
        ))}
      </div>

      <div className="mf-attest-box">
        <label className="mf-attest-row">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          I have reviewed this referral against the original note and confirm it's accurate.
        </label>
        {hasGap && (
          <label className="mf-attest-row gap">
            <input type="checkbox" checked={ackGap} onChange={(e) => setAckGap(e.target.checked)} />
            I've confirmed the missing conservative-therapy history and want to proceed anyway.
          </label>
        )}
      </div>

      <div className="mf-info-strip">
        <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        Approving this referral logs your name, timestamp, and every change made in review, per HIPAA audit requirements.
      </div>

      <button className="mf-send-btn" disabled={!canSend} onClick={handleSend}>
        {sendState === "sending" ? <><Loader2 size={16} className="mf-spin" /> Sending</> : <><Send size={15} /> Approve &amp; send referral</>}
      </button>

      <PageNav onBack={onBack} />
    </PageShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Reusable primitives
──────────────────────────────────────────────────────────────────────── */

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

function SectionLabel({ children }) {
  return <p className="mf-section-label">{children}</p>;
}

function Card({ children }) {
  return <div className="mf-card">{children}</div>;
}

function RuleRow({ label, detail, met }) {
  return (
    <div className="mf-rule-row">
      <span className={`mf-rule-dot ${met ? "pass" : "fail"}`}>{met ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={10} />}</span>
      <span className="mf-rule-text">{label}{detail && <span className="mf-rule-detail">{detail}</span>}</span>
    </div>
  );
}

function Verdict({ tone, children }) {
  return <div className={`mf-verdict mf-verdict-${tone}`}>{children}</div>;
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

function MetaPill({ k, v }) {
  return <span className="mf-meta-pill">{k} <b>{v}</b></span>;
}

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

/* ────────────────────────────────────────────────────────────────────────
   Global styles
──────────────────────────────────────────────────────────────────────── */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

      .mf-app {
        --paper: #F4F6F5; --paper-raised: #FFFFFF; --ink: #14213D; --ink-soft: #59667A;
        --blue: #1D5C7A; --blue-dark: #164A63; --blue-soft: #E4EEF2;
        --sage: #4F7C6C; --sage-soft: #E7EFEC; --amber: #A8672E; --amber-soft: #F6ECDF;
        --clay: #A8433B; --clay-soft: #F5E7E5; --line: #DCE1E4; --line-soft: #E8ECEE;
        --r-xs: 5px; --r-sm: 7px; --r-md: 10px; --r-lg: 14px;
        --shadow-xs: 0 1px 2px rgba(20,33,61,0.05);
        --shadow-sm: 0 1px 3px rgba(20,33,61,0.06), 0 1px 2px rgba(20,33,61,0.04);
        --shadow-md: 0 4px 14px rgba(20,33,61,0.08), 0 1px 3px rgba(20,33,61,0.04);
        --shadow-lg: 0 12px 34px rgba(20,33,61,0.13);
        --ring: 0 0 0 3px rgba(29,92,122,0.22);
        --ease: cubic-bezier(0.32, 0.72, 0, 1);
        font-family: 'IBM Plex Sans', system-ui, sans-serif;
        background: var(--paper); color: var(--ink); min-height: 100vh;
        -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
      }
      .mf-app *, .mf-app *::before, .mf-app *::after { box-sizing: border-box; }
      .mf-app ::selection { background: var(--blue-soft); }
      .mf-app :focus-visible { outline: none; box-shadow: var(--ring); border-radius: var(--r-xs); }
      .mf-app button { transition: background .16s var(--ease), border-color .16s var(--ease), color .16s var(--ease), box-shadow .16s var(--ease), transform .12s var(--ease); }
      @media (prefers-reduced-motion: reduce) {
        .mf-app *, .mf-app *::before, .mf-app *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
      }

      .mf-topbar {
        border-bottom: 1px solid var(--line); background: rgba(255,255,255,0.86); backdrop-filter: saturate(180%) blur(8px);
        position: sticky; top: 0; z-index: 20;
      }
      .mf-topbar-inner {
        display: flex; align-items: center; justify-content: space-between;
        padding: 13px 20px; gap: 10px; flex-wrap: wrap; max-width: 1240px; margin: 0 auto;
      }
      .mf-topbar-left { display: flex; align-items: center; gap: 10px; }
      .mf-topbar-right { display: flex; align-items: center; gap: 10px; }
      .mf-menu-btn { display: none; background: none; border: none; cursor: pointer; color: var(--ink); padding: 2px; border-radius: var(--r-xs); }
      .mf-wordmark { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
      .mf-crumb { color: var(--ink-soft); font-size: 14px; font-family: 'IBM Plex Mono', monospace; }
      .mf-org-badge { font-size: 12.5px; color: var(--ink-soft); border: 1px solid var(--line); border-radius: 999px; padding: 3px 11px; }
      .mf-step-count { font-size: 12px; font-weight: 600; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; }
      .mf-step-count-of { color: var(--ink-soft); font-weight: 500; }
      @media (max-width: 560px) { .mf-step-count, .mf-org-badge { display: none; } }

      .mf-progress-track { height: 3px; background: var(--line-soft); overflow: hidden; }
      .mf-progress-fill { height: 100%; background: linear-gradient(90deg, var(--sage), var(--blue)); border-radius: 0 3px 3px 0; transition: width .5s var(--ease); }

      .mf-status-pill { font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
      .mf-status-draft { background: var(--line); color: var(--ink-soft); }
      .mf-status-processing { background: var(--blue-soft); color: var(--blue); }
      .mf-status-awaiting-review { background: var(--amber-soft); color: var(--amber); }
      .mf-status-sent { background: var(--sage-soft); color: var(--sage); }

      .mf-body { display: flex; max-width: 1240px; margin: 0 auto; }

      .mf-sidebar {
        width: 248px; flex-shrink: 0; padding: 22px 16px; border-right: 1px solid var(--line);
        position: sticky; top: 54px; height: calc(100vh - 54px); overflow-y: auto;
      }
      .mf-sidebar-case { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md); padding: 13px 14px; margin-bottom: 18px; box-shadow: var(--shadow-xs); }
      .mf-sidebar-case-head { display: flex; align-items: center; gap: 10px; }
      .mf-avatar {
        width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; background: var(--blue); color: #fff;
        display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
        font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.02em;
      }
      .mf-sidebar-case-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13.5px; margin: 0; line-height: 1.3; }
      .mf-sidebar-case-id { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); margin: 1px 0 0; }
      .mf-sidebar-case-meta { font-size: 11.5px; color: var(--ink-soft); margin: 10px 0 0; padding-top: 9px; border-top: 1px solid var(--line-soft); }

      .mf-nav-progress { display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); padding: 0 6px 8px; }

      .mf-nav { display: flex; flex-direction: column; }
      .mf-nav-item {
        position: relative; display: flex; align-items: center; gap: 11px; text-align: left; font-family: inherit; font-size: 13.5px;
        padding: 7px 10px; border-radius: var(--r-sm); border: none; background: none; color: var(--ink-soft); cursor: pointer;
        transition: background .16s var(--ease), color .16s var(--ease);
      }
      .mf-nav-item + .mf-nav-item::before {
        content: ""; position: absolute; left: 21px; top: -8px; width: 2px; height: 12px; background: var(--line);
      }
      .mf-nav-item.is-done::before, .mf-nav-item.is-current::before { background: var(--sage); }
      .mf-nav-marker {
        width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        border: 1.5px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); font-size: 11px; font-weight: 700;
        transition: all .16s var(--ease);
      }
      .mf-nav-label { line-height: 1.3; }
      .mf-nav-item:hover:not(:disabled) { background: var(--line-soft); color: var(--ink); }
      .mf-nav-item.is-current { background: var(--blue-soft); color: var(--blue); font-weight: 600; }
      .mf-nav-item.is-current .mf-nav-marker { border-color: var(--blue); color: var(--blue); background: var(--paper-raised); box-shadow: var(--ring); }
      .mf-nav-item.is-done { color: var(--ink); }
      .mf-nav-item.is-done .mf-nav-marker { background: var(--sage); border-color: var(--sage); color: #fff; }
      .mf-nav-item.is-locked { opacity: 0.45; cursor: not-allowed; }
      .mf-sidebar-overlay { display: none; }

      .mf-main { flex: 1; min-width: 0; padding: 32px 40px 90px; }
      .mf-page { max-width: 940px; }
      .mf-page-transition { animation: mf-fade-in 0.3s var(--ease); }
      @keyframes mf-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

      .mf-page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
      .mf-page-title { font-family: 'Space Grotesk', sans-serif; font-size: 25px; font-weight: 600; margin: 0 0 7px; letter-spacing: -0.015em; }
      .mf-page-subhead { color: var(--ink-soft); font-size: 14.5px; margin: 0 0 24px; max-width: 64ch; line-height: 1.6; }

      .mf-toggle-link { display: flex; align-items: center; gap: 6px; background: none; border: none; color: var(--blue); font-size: 13.5px; font-weight: 500; cursor: pointer; padding: 4px 0; white-space: nowrap; }
      .mf-toggle-link:hover { text-decoration: underline; }
      .mf-inline-link { background: none; border: none; padding: 0; font-family: inherit; font-size: 12.5px; font-weight: 500; color: var(--blue); cursor: pointer; }
      .mf-inline-link:hover { text-decoration: underline; }

      .mf-two-col { display: grid; grid-template-columns: 1fr 300px; gap: 28px; align-items: start; }
      @media (max-width: 860px) { .mf-two-col { grid-template-columns: 1fr; } }

      .mf-field { margin-bottom: 22px; }
      .mf-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.005em; }
      .mf-label-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
      .mf-select-wrap { position: relative; max-width: 300px; }
      .mf-select, .mf-input, .mf-textarea {
        width: 100%; font-family: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: var(--r-sm);
        background: var(--paper-raised); color: var(--ink); transition: border-color .16s var(--ease), box-shadow .16s var(--ease);
      }
      .mf-select { appearance: none; padding: 9px 32px 9px 12px; cursor: pointer; }
      .mf-input { padding: 9px 12px; }
      .mf-textarea { min-height: 170px; line-height: 1.55; padding: 12px; resize: vertical; }
      .mf-select:hover, .mf-input:hover, .mf-textarea:hover { border-color: #C3CBD0; }
      .mf-select:focus, .mf-input:focus, .mf-textarea:focus { outline: none; border-color: var(--blue); box-shadow: var(--ring); }
      .mf-select-icon { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--ink-soft); }
      .mf-input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      @media (max-width: 620px) { .mf-input-grid { grid-template-columns: 1fr; } }
      .mf-error { font-size: 12.5px; color: var(--clay); margin-top: 6px; display: flex; align-items: center; gap: 5px; }
      .mf-error::before { content: "⚠"; font-size: 11px; }

      .mf-checklist { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper-raised); padding: 10px 13px; margin-bottom: 10px; box-shadow: var(--shadow-xs); }
      .mf-checklist-title { font-size: 12px; color: var(--ink-soft); margin: 0 0 6px; }
      .mf-checklist-row { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 0; color: var(--ink-soft); }
      .mf-checklist-dot { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--line); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
      .mf-checklist-dot.met { background: var(--sage); border-color: var(--sage); }
      .mf-checklist-met { color: var(--ink); }

      .mf-dropzone { border: 1.5px dashed #C6CED3; border-radius: var(--r-md); background: var(--paper-raised); padding: 24px 20px; text-align: center; cursor: pointer; transition: border-color .16s var(--ease), background .16s var(--ease); }
      .mf-dropzone:hover { border-color: var(--blue); background: var(--blue-soft); }
      .mf-dropzone.drag { border-color: var(--blue); background: var(--blue-soft); }
      .mf-dropzone-title { font-size: 13.5px; font-weight: 600; margin-top: 6px; }
      .mf-dropzone-sub { font-size: 12.5px; color: var(--ink-soft); }
      .mf-filelist { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
      .mf-file { display: flex; align-items: center; gap: 8px; font-size: 13px; border: 1px solid var(--line); border-radius: var(--r-xs); padding: 8px 10px; background: var(--paper-raised); box-shadow: var(--shadow-xs); }
      .mf-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mf-file-remove { background: none; border: none; cursor: pointer; color: var(--ink-soft); display: flex; }
      .mf-file-remove:hover { color: var(--clay); }

      .mf-summary-card { background: var(--paper-raised); border: 1px solid var(--line); border-top: 3px solid var(--blue); border-radius: var(--r-md); padding: 18px 20px; position: sticky; top: 78px; box-shadow: var(--shadow-md); }
      .mf-summary-title { font-family: 'Space Grotesk', sans-serif; font-size: 14.5px; font-weight: 600; margin: 0 0 12px; }
      .mf-summary-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
      .mf-summary-row:last-of-type { border-bottom: none; }
      .mf-summary-key { color: var(--ink-soft); }
      .mf-summary-val { font-weight: 500; text-align: right; }
      .mf-tiny-note { font-size: 11.5px; color: var(--ink-soft); text-align: center; margin-top: 10px; line-height: 1.5; }

      .mf-status-pill-sm { font-size: 11px; font-weight: 500; padding: 2px 9px; border-radius: 999px; }
      .mf-status-pill-amber { background: var(--amber-soft); color: var(--amber); }
      .mf-status-pill-sage { background: var(--sage-soft); color: var(--sage); }

      .mf-primary-btn, .mf-ghost-btn, .mf-send-btn {
        font-family: inherit; font-size: 14px; font-weight: 600; padding: 10px 17px; border-radius: var(--r-sm); cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 7px;
      }
      .mf-primary-btn { background: var(--blue); border: 1px solid var(--blue); color: white; box-shadow: var(--shadow-sm); }
      .mf-primary-btn:hover:not(:disabled) { background: var(--blue-dark); border-color: var(--blue-dark); box-shadow: var(--shadow-md); transform: translateY(-1px); }
      .mf-primary-btn:active:not(:disabled) { transform: translateY(0); box-shadow: var(--shadow-xs); }
      .mf-primary-btn:disabled { background: var(--line); border-color: var(--line); color: var(--ink-soft); cursor: not-allowed; box-shadow: none; }
      .mf-primary-btn.full { width: 100%; margin-top: 14px; }
      .mf-ghost-btn { background: var(--paper-raised); border: 1px solid var(--line); color: var(--ink); }
      .mf-ghost-btn:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); }
      .mf-ghost-btn:active { transform: translateY(1px); }
      .mf-send-btn { width: 100%; background: var(--blue); border: 1px solid var(--blue); color: white; font-size: 14.5px; padding: 12px 14px; margin: 18px 0 4px; box-shadow: var(--shadow-sm); }
      .mf-send-btn:hover:not(:disabled) { background: var(--blue-dark); border-color: var(--blue-dark); box-shadow: var(--shadow-md); transform: translateY(-1px); }
      .mf-send-btn:active:not(:disabled) { transform: translateY(0); }
      .mf-send-btn:disabled { background: var(--line); border-color: var(--line); color: var(--ink-soft); cursor: not-allowed; box-shadow: none; }

      .mf-page-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--line); }

      .mf-info-strip { display: flex; gap: 9px; align-items: flex-start; background: var(--blue-soft); border: 1px solid #CFE0E7; border-radius: var(--r-sm); padding: 12px 14px; margin: 18px 0; font-size: 12.5px; color: var(--blue-dark); line-height: 1.55; }
      .mf-note-box { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 14px 16px; margin-bottom: 20px; box-shadow: var(--shadow-xs); }
      .mf-note-box-title { font-size: 12px; font-weight: 600; color: var(--ink-soft); margin: 0 0 8px; }
      .mf-mono-block { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; line-height: 1.6; color: var(--ink-soft); white-space: pre-wrap; margin: 0; }

      .mf-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; }
      @media (max-width: 620px) { .mf-field-grid { grid-template-columns: 1fr; } }
      .mf-field-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 13px 15px; box-shadow: var(--shadow-xs); transition: box-shadow .16s var(--ease), border-color .16s var(--ease); }
      .mf-field-card:hover { box-shadow: var(--shadow-sm); border-color: #C7CFD4; }
      .mf-field-card.null { border-style: dashed; box-shadow: none; background: transparent; }
      .mf-field-key { font-size: 12px; font-weight: 600; color: var(--ink-soft); margin: 0 0 5px; }
      .mf-field-value { font-size: 14px; margin: 0 0 6px; line-height: 1.45; }
      .mf-evidence { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--blue); }
      .mf-null { font-size: 13.5px; color: var(--ink-soft); font-style: italic; }

      .mf-tabs { display: flex; gap: 18px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
      .mf-tab { font-family: inherit; font-size: 13.5px; font-weight: 500; padding: 8px 0; background: none; border: none; border-bottom: 2px solid transparent; color: var(--ink-soft); cursor: pointer; }
      .mf-tab.active { color: var(--ink); border-bottom-color: var(--blue); font-weight: 600; }
      .mf-code-panel { background: #101826; border-radius: var(--r-md); padding: 16px 18px; overflow-x: auto; margin-bottom: 6px; box-shadow: var(--shadow-md); }
      .mf-code-panel pre { margin: 0; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; line-height: 1.7; color: #C9D3DF; }
      .mf-json-key { color: #7FB0C9; } .mf-json-string { color: #A7C980; } .mf-json-number { color: #E0A468; } .mf-json-boolean { color: #C99BE0; } .mf-json-null { color: #7A879C; font-style: italic; }
      .mf-table-wrap { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; margin-bottom: 6px; box-shadow: var(--shadow-sm); }
      .mf-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .mf-table th { text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--paper); }
      .mf-table td { padding: 10px 14px; border-bottom: 1px solid var(--line-soft); }
      .mf-table tr:last-child td { border-bottom: none; }
      .mf-table tbody tr { transition: background .12s var(--ease); }
      .mf-table tbody tr:hover { background: var(--line-soft); }
      .mf-path { font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
      .muted-row td { color: var(--ink-soft); }
      .mf-type-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
      .mf-type-blue { background: var(--blue-soft); color: var(--blue); }
      .mf-type-amber { background: var(--amber-soft); color: var(--amber); }
      .mf-type-sage { background: var(--sage-soft); color: var(--sage); }
      .mf-type-muted { background: var(--paper); color: var(--ink-soft); border: 1px dashed var(--line); }
      .mf-tab { display: inline-flex; align-items: center; gap: 6px; }
      .mf-tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); }

      .mf-fields-view { margin-bottom: 6px; }
      .mf-fields-list-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .mf-fields-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line-soft); }
      .mf-fields-item-label { font-size: 12px; font-weight: 600; color: var(--ink-soft); letter-spacing: 0.02em; }
      .mf-fields-view .mf-field { margin-bottom: 14px; }
      .mf-fields-view .mf-field:last-child { margin-bottom: 0; }
      .mf-mini-btn { display: inline-flex; align-items: center; gap: 5px; font-family: inherit; font-size: 12px; font-weight: 500; padding: 5px 10px; border-radius: var(--r-xs); border: 1px solid var(--line); background: var(--paper-raised); color: var(--blue); cursor: pointer; }
      .mf-mini-btn:hover { border-color: var(--blue); background: var(--blue-soft); }
      .mf-mini-btn.ghost { color: var(--ink-soft); }
      .mf-mini-btn.ghost:hover { color: var(--clay); border-color: var(--clay); background: var(--clay-soft); }

      .mf-section-label { font-size: 13.5px; font-weight: 600; color: var(--ink-soft); margin: 22px 0 10px; }
      .mf-card { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-md); padding: 17px 19px; margin-bottom: 8px; box-shadow: var(--shadow-sm); }
      .mf-rule-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
      .mf-rule-row:last-child { border-bottom: none; }
      .mf-rule-dot { width: 17px; height: 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; color: white; }
      .mf-rule-dot.pass { background: var(--sage); } .mf-rule-dot.fail { background: var(--amber); }
      .mf-rule-detail { display: block; font-size: 12px; color: var(--ink-soft); margin-top: 1px; }
      .mf-verdict { margin-top: 12px; padding: 12px 14px; border-radius: 4px; font-size: 13.5px; display: flex; gap: 9px; align-items: flex-start; }
      .mf-verdict-gap { background: var(--amber-soft); color: var(--amber); }
      .mf-verdict-clean { background: var(--sage-soft); color: var(--sage); }

      .mf-trace-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--ink-soft); }
      .mf-trace-row.matched { color: var(--ink); font-weight: 500; }
      .mf-trace-mark { width: 14px; text-align: center; }
      .mf-priority-result { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
      .mf-priority-select { font-family: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); cursor: pointer; }
      .mf-specialist-list { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; }
      .mf-specialist-item { display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); border-radius: 4px; padding: 9px 12px; font-size: 13px; }
      .mf-specialist-name { font-weight: 600; }
      .mf-specialist-meta { font-size: 11.5px; color: var(--ink-soft); }
      .mf-match-chip { font-size: 11px; color: var(--blue); background: var(--blue-soft); padding: 2px 8px; border-radius: 999px; }

      .mf-meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
      .mf-meta-pill { font-size: 12px; color: var(--ink-soft); border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px; background: var(--paper-raised); }
      .mf-meta-pill b { color: var(--ink); }
      .mf-trace-box { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; margin-bottom: 16px; }
      .mf-trace-item { display: flex; justify-content: space-between; font-size: 12.5px; padding: 5px 0; border-bottom: 1px solid var(--line); }
      .mf-trace-item:last-child { border-bottom: none; }
      .mf-trace-field { font-family: 'IBM Plex Mono', monospace; color: var(--blue); }
      .mf-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
      .mf-tool-btn { display: flex; align-items: center; gap: 6px; font-family: inherit; font-size: 12.5px; font-weight: 500; padding: 6px 11px; border-radius: 4px; border: 1px solid var(--line); background: var(--paper-raised); cursor: pointer; }
      .mf-tool-btn:hover { border-color: var(--blue); color: var(--blue); }

      .mf-letter { background: var(--paper-raised); border: 1px solid var(--line); border-top: 3px solid var(--blue); border-radius: var(--r-md); padding: 24px; margin-bottom: 16px; box-shadow: var(--shadow-md); }
      .mf-letter-org { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; }
      .mf-letter-date { font-size: 12px; color: var(--ink-soft); margin-bottom: 14px; }
      .mf-letter-body { font-size: 13.5px; line-height: 1.65; white-space: pre-wrap; }
      .mf-letter-attach { display: flex; align-items: center; gap: 7px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink-soft); }
      .mf-edit-textarea { width: 100%; min-height: 200px; font-family: inherit; font-size: 13.5px; line-height: 1.6; padding: 11px; border: 1px solid var(--blue); border-radius: 4px; background: var(--paper); resize: vertical; }

      .mf-accordion { background: var(--paper-raised); border: 1px solid var(--line); border-radius: var(--r-sm); margin-bottom: 8px; overflow: hidden; box-shadow: var(--shadow-xs); }
      .mf-accordion-head { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: none; border: none; cursor: pointer; font-family: inherit; transition: background .14s var(--ease); }
      .mf-accordion-head:hover { background: var(--line-soft); }
      .mf-accordion-title { font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
      .mf-accordion-badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; }
      .mf-tone-sage { background: var(--sage-soft); color: var(--sage); }
      .mf-tone-amber { background: var(--amber-soft); color: var(--amber); }
      .mf-accordion-body { padding: 0 15px 12px; font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; border-top: 1px solid var(--line); padding-top: 10px; }
      .mf-accordion-body ul { margin: 0; padding-left: 18px; }

      .mf-specialist-wrap { position: relative; margin-bottom: 12px; }
      .mf-specialist-trigger { width: 100%; display: flex; justify-content: space-between; align-items: center; font-family: inherit; font-size: 13.5px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper-raised); cursor: pointer; text-align: left; }
      .mf-specialist-trigger.placeholder { color: var(--ink-soft); }
      .mf-specialist-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5; background: var(--paper-raised); border: 1px solid var(--line); border-radius: 4px; box-shadow: 0 6px 16px rgba(20,33,61,0.08); overflow: hidden; }
      .mf-specialist-option { width: 100%; text-align: left; padding: 10px 12px; background: none; border: none; cursor: pointer; border-bottom: 1px solid var(--line); font-size: 13px; }
      .mf-specialist-option:last-child { border-bottom: none; }
      .mf-specialist-option:hover { background: var(--blue-soft); }

      .mf-channel-row { display: flex; gap: 8px; margin-bottom: 16px; }
      .mf-channel-btn { flex: 1; font-family: inherit; font-size: 12.5px; padding: 8px; border-radius: 4px; border: 1px solid var(--line); background: var(--paper-raised); color: var(--ink-soft); cursor: pointer; }
      .mf-channel-btn.active { border-color: var(--blue); color: var(--blue); background: var(--blue-soft); font-weight: 600; }

      .mf-attest-box { background: var(--paper-raised); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; margin-bottom: 12px; }
      .mf-attest-row { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; padding: 5px 0; }
      .mf-attest-row input { margin-top: 3px; }
      .mf-attest-row.gap { color: var(--amber); }

      .mf-sent-card { background: var(--paper-raised); border: 1px solid var(--line); border-top: 3px solid var(--sage); border-radius: var(--r-lg); padding: 28px; max-width: 520px; box-shadow: var(--shadow-lg); }
      .mf-sent-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--sage-soft); color: var(--sage); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
      .mf-sent-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 600; margin: 0 0 6px; }
      .mf-sent-body { font-size: 13.5px; color: var(--ink-soft); line-height: 1.55; margin: 0 0 16px; }
      .mf-sent-meta { font-size: 12.5px; color: var(--ink-soft); border-top: 1px solid var(--line); padding-top: 12px; }
      .mf-sent-meta div { display: flex; justify-content: space-between; padding: 3px 0; }

      .mf-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: var(--ink); color: white; font-size: 13.5px; padding: 12px 18px; border-radius: 999px;
        display: flex; align-items: center; gap: 8px; box-shadow: var(--shadow-lg); z-index: 50;
        animation: mf-toast-in 0.24s var(--ease);
      }
      @keyframes mf-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

      @keyframes mf-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .mf-spin { animation: mf-spin 0.8s linear infinite; }

      @media (max-width: 860px) {
        .mf-menu-btn { display: flex; }
        .mf-sidebar {
          position: fixed; left: -280px; top: 54px; bottom: 0; width: 262px; background: var(--paper);
          transition: left 0.24s var(--ease); z-index: 40; box-shadow: var(--shadow-lg);
        }
        .mf-sidebar.open { left: 0; }
        .mf-sidebar-overlay { display: block; position: fixed; inset: 54px 0 0 0; background: rgba(20,33,61,0.28); z-index: 30; animation: mf-fade-in .2s var(--ease); }
        .mf-main { padding: 22px 18px 70px; }
      }
    `}</style>
  );
}
