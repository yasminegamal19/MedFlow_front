import { useState, useRef } from "react";
import { ChevronDown, FileText, UploadCloud, X, ArrowRight } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { Field } from "../../components/Field.jsx";
import { SummaryCard, SummaryRow } from "../../components/SummaryCard.jsx";
import { StatusPillSmall } from "../../components/StatusPillSmall.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { CONDITION_GROUPS } from "../../lib/mskTriage.js";
import { SAMPLE_NOTE } from "../../data/mockData.js";

/* ── Stage 1b: Case intake ─────────────────────────────────────────────── */

export function PageIntake({ pathways, clinicalCondition, onChangePathway, notes, setNotes, files, setFiles, onCreate, submitting, error, onBack }) {
  const [dragOver, setDragOver] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const canSubmit = clinicalCondition && !submitting;

  // Sourced from the database (GET /pathways) once loaded; falls back to
  // the static condition-group list (no real pathway_id yet) so intake
  // still works if the backend is unreachable.
  const fromDb = pathways.length > 0;
  const options = fromDb
    ? pathways.map((p) => ({ value: p.id, label: p.name, conditionGroup: p.conditionGroup }))
    : CONDITION_GROUPS.map((c) => ({ value: c.id, label: c.label, conditionGroup: c.id }));
  const selectedValue = fromDb
    ? (pathways.find((p) => p.conditionGroup === clinicalCondition)?.id || "")
    : clinicalCondition;

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
              <select className="mf-select" value={selectedValue} onChange={(e) => {
                const opt = options.find((o) => o.value === e.target.value);
                if (opt) onChangePathway(fromDb ? opt.value : null, opt.conditionGroup);
              }}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

          </Field>
          <Field label="Supporting documents">
            <div className={`mf-dropzone${dragOver ? " drag" : ""}`} role="button" tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}>
              <UploadCloud size={20} color="var(--ink-soft)" />
              <div className="mf-dropzone-title">Drop imaging, lab results, or clinical documents here</div>
              <div className="mf-dropzone-sub">or click to browse — PDF, DOCX, JPG, PNG, WEBP up to 20MB</div>
              <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp" style={{ display: "none" }}
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
          <SummaryRow k="Pathway" v={options.find((o) => o.value === selectedValue)?.label || "—"} />
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
