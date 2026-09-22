import { useState, useEffect } from "react";
import {
  Check, AlertTriangle, Eye, EyeOff, Pencil, RefreshCw, Info, ShieldCheck, ArrowRight,
} from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { Card } from "../../components/Card.jsx";
import { Field } from "../../components/Field.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { getExtraction, isTerminal, retryExtraction } from "../../lib/api.js";
import { sectionsFromItems } from "../../lib/wizardState.js";
import { AI_REQUEST, GROUNDED, SAMPLE_NOTE } from "../../data/mockData.js";

/* ── Stage 2a: AI extraction ───────────────────────────────────────────── */

export function PageExtraction({
  extraction, setExtraction, sections, setSections, imagingJob,
  formFillJob, formFillResult, pathwayDefinition,
  combinedExtractedText, extractedDocText,
  onCompleted, onNext, onBack,
}) {
  const [showNote, setShowNote] = useState(false);
  const [mode, setMode] = useState("extraction"); // extraction | imaging | form_fill | doc_extraction
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasImaging = Boolean(imagingJob); // Only show tab if we have an actual job
  const imagingPending = Boolean(imagingJob && !isTerminal(imagingJob.status));
  const imagingReady = Boolean(imagingJob?.status === "completed" && imagingJob.result);
  const imagingFailed = imagingJob?.status === "failed";
  const imagingErrorMessage = imagingFailed
    ? (imagingJob.error?.code === "unsupported_modality"
      ? "The AI model currently loaded can't analyze images yet — an admin needs to switch it to a vision-capable model."
      : (imagingJob.error?.message || "Imaging analysis failed."))
    : null;

  // Pathway-form extraction: the model's own per-field answers for the
  // selected pathway, alongside the generic grounded extraction above. See
  // GET /v1/pathway-form-extractions/{id} (ai-service) via
  // AutoFillController — formFillResult only carries {code, field_type,
  // value}, so field names/option labels are resolved from
  // pathwayDefinition (fetched once at case creation) by code.
  const hasFormFill = Boolean(formFillJob); // Only show tab if we have an actual job
  const formFillPending = Boolean(formFillJob && !isTerminal(formFillJob.status));
  const formFillReady = Boolean(formFillJob?.status === "completed" && formFillResult);
  const formFillFailed = formFillJob?.status === "failed";
  const formFillErrorMessage = formFillFailed ? (formFillJob.error?.message || "Pathway form extraction failed.") : null;
  const fieldMetaByCode = {};
  (pathwayDefinition?.sections || []).forEach((s) => s.fields.forEach((f) => { fieldMetaByCode[f.code] = f; }));
  const formatFieldValue = (field, value) => {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (field.field_type === "select") {
      return fieldMetaByCode[field.code]?.options?.find((o) => o.value === value)?.label ?? value;
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
          <p className="mf-note-box-title">Combined clinical text (notes + documents)</p>
          <pre className="mf-mono-block">{combinedExtractedText || SAMPLE_NOTE}</pre>
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
          {r.error?.code === 'empty_not'
            ? "The clinical note appears to be empty or too short. Please ensure you've entered a detailed clinical note before extraction."
            : r.error?.code === 'ai_reject' || r.error?.code === 'ai_rejected'
            ? "The AI service rejected the extraction request. This may be due to content policy, service configuration, or rate limiting. Please contact your system administrator to check the AI service configuration."
            : (r.error?.message || "The AI request could not be completed. Please try again or contact support if the issue persists.")
          }
          {r.error?.code && r.error?.code !== 'empty_not' && r.error?.code !== 'ai_reject' && r.error?.code !== 'ai_rejected' && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-soft)" }}>Error code: {r.error.code}</span>
          )}
          {r.error?.code !== 'ai_reject' && r.error?.code !== 'ai_rejected' && (
            <button className="mf-inline-link" onClick={handleRetry} disabled={retrying} style={{ marginLeft: 8 }}>
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
            <button className="mf-inline-link" onClick={handleRetry} disabled={retrying} style={{ marginLeft: 8 }}>
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {!pending && !failed && !missingResult && (
        <>
          {(hasImaging || hasFormFill || extractedDocText) && (
            <div className="mf-tabs">
              <button className={`mf-tab${mode === "extraction" ? " active" : ""}`} onClick={() => setMode("extraction")}>Extraction</button>
              {extractedDocText && (
                <button className={`mf-tab${mode === "doc_extraction" ? " active" : ""}`} onClick={() => setMode("doc_extraction")}>Document extraction</button>
              )}
              {hasImaging && (
                <button className={`mf-tab${mode === "imaging" ? " active" : ""}`} onClick={() => setMode("imaging")}>Imaging findings</button>
              )}
              {hasFormFill && (
                <button className={`mf-tab${mode === "form_fill" ? " active" : ""}`} onClick={() => setMode("form_fill")}>Pathway form</button>
              )}
            </div>
          )}

          {mode === "form_fill" ? (
            <>
              {formFillPending && (
                <div className="mf-info-strip">
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  Answering this pathway's form fields from the note… this can take up to a minute on CPU.
                </div>
              )}
              {formFillErrorMessage && (
                <div className="mf-info-strip">
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {formFillErrorMessage}
                </div>
              )}
              {formFillReady && (
                <>
                  <div className="mf-provenance">
                    <span className="mf-prov-pill">pathway <b>{formFillResult.pathway?.name}</b></span>
                    {(() => {
                      const allFields = formFillResult.sections.flatMap((s) => s.fields);
                      const answeredCount = allFields.filter((f) => f.value !== null && f.value !== undefined).length;
                      return (
                        <span className="mf-prov-pill"><b>{answeredCount}</b> of {allFields.length} fields answered by AI</span>
                      );
                    })()}
                  </div>
                  {formFillResult.sections.map((s) => (
                    <Card key={s.code} style={{ marginTop: 8 }}>
                      <p className="mf-section-title">{s.name}</p>
                      {s.fields.map((f) => {
                        const answered = f.value !== null && f.value !== undefined;
                        return (
                          <div key={f.code} className="mf-summary-row" style={{ opacity: answered ? 1 : 0.6 }}>
                            <span className="mf-summary-key">{fieldMetaByCode[f.code]?.name || f.code}</span>
                            {answered ? (
                              <span className="mf-summary-val">{formatFieldValue(f, f.value)}</span>
                            ) : (
                              <span className="mf-verbatim-chip unverified" style={{ fontSize: 11 }}>Not stated</span>
                            )}
                          </div>
                        );
                      })}
                    </Card>
                  ))}
                  <div className="mf-info-strip" style={{ marginTop: 12 }}>
                    <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    Every answer here is re-validated against the field's own type/options before it reaches this page —
                    it also pre-fills Clinical Assessment, but a physician must confirm each value there before it counts.
                    Fields marked "Not stated" were not found in the note.
                  </div>
                </>
              )}
            </>
          ) : mode === "imaging" ? (
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

                  {/* Convert imaging findings to structured items format */}
                  {imagingJob.result.findings?.length ? (
                    <div className="mf-section-list">
                      {imagingJob.result.findings.map((finding, i) => (
                        <div className="mf-section-item" key={i}>
                          <p className="mf-section-title">Finding {i + 1}</p>
                          <p className="mf-section-content">{finding}</p>
                          <span className="mf-verbatim-chip unverified">
                            <AlertTriangle size={11} />
                            AI-assisted interpretation — verify against actual image
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Card style={{ marginTop: 8 }}>
                      <p className="mf-section-content" style={{ color: "var(--ink-soft)" }}>
                        No findings identified from this image.
                      </p>
                    </Card>
                  )}

                  {imagingJob.result.impression && (
                    <div className="mf-section-item" style={{ marginTop: 8 }}>
                      <p className="mf-section-title">Impression</p>
                      <p className="mf-section-content">{imagingJob.result.impression}</p>
                      <span className="mf-verbatim-chip unverified">
                        <AlertTriangle size={11} />
                        AI-assisted interpretation — verify against actual image
                      </span>
                    </div>
                  )}

                  <div className="mf-info-strip" style={{ marginTop: 12 }}>
                    <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    AI-assisted description, not a diagnosis — verify against the actual image before this informs any decision.
                  </div>
                </>
              )}
            </>
          ) : mode === "doc_extraction" ? (
            <>
              <div className="mf-info-strip" style={{ marginTop: 0 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Raw text extracted from your uploaded documents (PDF / DOCX) before it was sent to the AI. This is what the AI read from the attachments.
              </div>
              <div className="mf-note-box" style={{ marginTop: 8 }}>
                <p className="mf-note-box-title">Extracted document text</p>
                <pre className="mf-mono-block" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {extractedDocText}
                </pre>
              </div>
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
            <button className="mf-primary-btn" onClick={onNext}>Continue to clinical assessment <ArrowRight size={15} /></button>
          </div>
        </>
      )}
      <PageNav onBack={onBack} onNext={pending || failed || missingResult ? undefined : onNext} nextLabel="Continue to clinical assessment" />
    </PageShell>
  );
}
