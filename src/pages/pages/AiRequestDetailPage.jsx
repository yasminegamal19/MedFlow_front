import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, LogOut, PenLine } from "lucide-react";
import { getExtraction } from "../lib/api.js";
import { TYPE_LABELS, StatusPill, formatDuration, formatDate } from "./AiRequestsBrowser.jsx";

/** Full provenance: which of the case's documents (if any) this result's
 * text actually came from, versus the ones just along for the ride. Falls
 * back to the plain note/document label when case_documents wasn't loaded
 * (e.g. an older cached response). */
function SourceSection({ request }) {
  const docs = request.case_documents;

  return (
    <div className="mf-info-strip" style={{ marginBottom: 16, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {request.source === "document" ? <FileText size={14} /> : <PenLine size={14} />}
        <span>
          {request.source === "document"
            ? <>Sourced from an uploaded document{request.source_document?.filename ? <> — <b>{request.source_document.filename}</b></> : ""}, OCR'd server-side.</>
            : "Sourced from a typed clinical note (Case Intake)."}
        </span>
      </div>
      {Array.isArray(docs) && docs.length > 0 && (
        <div>
          <p className="mf-tiny-note" style={{ margin: "4px 0" }}>
            {docs.length} document{docs.length > 1 ? "s" : ""} on this case:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {docs.map((d) => (
              <li key={d.id} style={{ fontSize: 13 }}>
                {d.filename}{d.version > 1 ? ` (v${d.version})` : ""}
                {d.is_source
                  ? <span className="mf-prov-pill" style={{ marginLeft: 6 }}>used for this result</span>
                  : <span className="mf-tiny-note" style={{ marginLeft: 6 }}>not used for this result</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatFieldValue(field, value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "—";
  if (field?.field_type === "select") {
    return field.options?.find((o) => o.value === value)?.label ?? value;
  }
  return String(value);
}

/** The complete form the AI was asked about, not just what it answered —
 * every field from the request's own recorded params.fields (the exact
 * list ExtractionController::store() sent to the ai-service), joined with
 * result.answers by code. A field with no answer shows "Not addressed in
 * note" rather than being dropped, same distinction the Clinical
 * Assessment page and the Extraction page's "Pathway form" tab make. */
function PathwayFormResult({ request }) {
  const fields = request.params?.fields || [];
  const answerByCode = Object.fromEntries((request.result?.answers || []).map((a) => [a.code, a]));

  if (fields.length === 0) {
    return <p className="mf-tiny-note">No field list was recorded for this request.</p>;
  }

  return (
    <>
      {request.params?.pathway && (
        <div className="mf-provenance" style={{ marginBottom: 10 }}>
          <span className="mf-prov-pill">pathway <b>{request.params.pathway}</b></span>
          <span className="mf-prov-pill">{fields.length} fields asked · {Object.keys(answerByCode).length} answered</span>
        </div>
      )}
      <table className="db-table">
        <thead><tr><th>Field</th><th>Type</th><th>Value</th><th>Source phrase</th></tr></thead>
        <tbody>
          {fields.map((f) => {
            const a = answerByCode[f.code];
            const hasValue = a && a.value !== null && a.value !== undefined;
            return (
              <tr key={f.code}>
                <td>
                  <span className="db-ptable-strong">{f.name}</span>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{f.code}</div>
                </td>
                <td>{f.field_type}</td>
                <td style={hasValue ? undefined : { color: "var(--ink-soft)", fontStyle: "italic" }}>
                  {hasValue ? formatFieldValue(f, a.value) : "Not addressed in note"}
                </td>
                <td style={{ color: "var(--ink-soft)" }}>{a?.source_phrase ? `"${a.source_phrase}"` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Renders `result` (AiResult.payload — see ProviderResult::fromEnvelope on
 * the backend, which strips reasoning/token_count/etc. off the ai-service's
 * top-level result before storing it) according to the request's own
 * `type`, since each type's payload shape is different. */
function AiResultBody({ request }) {
  const { type, result } = request;

  if (type === "pathway_form_extraction") {
    return <PathwayFormResult request={request} />;
  }

  if (!result) return <p className="mf-tiny-note">No result payload.</p>;

  if (type === "grounded_extraction" || type === "extraction") {
    return (
      <>
        <table className="db-table">
          <thead><tr><th>Label</th><th>Value</th><th>Source phrase</th><th>Verbatim</th></tr></thead>
          <tbody>
            {(result.items || []).map((it, i) => (
              <tr key={i}>
                <td><span className="db-ptable-strong">{it.label}</span></td>
                <td>{it.value}</td>
                <td style={{ color: "var(--ink-soft)" }}>{it.source_phrase ? `"${it.source_phrase}"` : "—"}</td>
                <td>{it.verbatim ? <Check size={13} /> : <AlertTriangle size={13} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.not_stated?.length > 0 && (
          <p className="mf-tiny-note" style={{ marginTop: 8 }}>Not stated: {result.not_stated.join(" · ")}</p>
        )}
      </>
    );
  }

  if (type === "pathway_validation") {
    return (
      <>
        <div className="mf-provenance" style={{ marginBottom: 10 }}>
          <span className="mf-prov-pill">pathway <b>{result.title || result.pathway}</b></span>
          <span className="mf-prov-pill">urgency <b>{result.urgency}</b></span>
          <span className="mf-prov-pill">{result.complete ? "complete" : "incomplete"}</span>
        </div>
        <table className="db-table">
          <thead><tr><th>Criterion</th><th>Required</th><th>Met</th><th>Evidence</th></tr></thead>
          <tbody>
            {(result.criteria || []).map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>{c.required ? "Yes" : "No"}</td>
                <td>{c.met ? <Check size={13} /> : <AlertTriangle size={13} />}</td>
                <td style={{ color: "var(--ink-soft)" }}>{c.evidence ? `"${c.evidence}"` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.red_flags?.length > 0 && (
          <p className="mf-tiny-note" style={{ marginTop: 8 }}>Red flags met: {result.red_flags.join(" · ")}</p>
        )}
      </>
    );
  }

  if (type === "imaging_analysis") {
    return (
      <div>
        <div className="mf-provenance" style={{ marginBottom: 10 }}>
          <span className="mf-prov-pill">modality <b>{result.modality || "unknown"}</b></span>
          <span className="mf-prov-pill">region <b>{result.body_region || "unknown"}</b></span>
        </div>
        <p className="mf-summary-title">Findings</p>
        {result.findings?.length
          ? <ul style={{ margin: "4px 0 10px", paddingLeft: 18 }}>{result.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
          : <p className="mf-tiny-note">None identified.</p>}
        {result.impression && <p className="mf-section-content">{result.impression}</p>}
      </div>
    );
  }

  return <pre className="mf-mono-block">{JSON.stringify(result, null, 2)}</pre>;
}

/** Standalone page (?page=ai-request&id=...) for one AiRequest's full
 * record — metadata, the field list it was asked about, and everything the
 * AI answered, in one place. Reached by clicking a row in the Dashboard's
 * "AI requests" tab (AiRequestsBrowser.jsx). */
export default function AiRequestDetailPage({ id, onLogout, onBack }) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRequest(null);
    setError(null);
    getExtraction(id)
      .then(setRequest)
      .catch((err) => setError(err.message || "Could not load this AI request."));
  }, [id]);

  return (
    <div className="mf-app">
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "14px 24px", borderBottom: "1px solid var(--line)", background: "var(--paper-raised)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mf-wordmark">MedFlow</span>
          <span className="mf-crumb">/ AI request</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button className="mf-mini-btn ghost" onClick={onBack}>‹ Back to AI requests</button>}
          {onLogout && (
            <button className="mf-mini-btn ghost" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <LogOut size={13} /> Sign out
            </button>
          )}
        </div>
      </div>

      <div className="mf-page" style={{ margin: "0 auto", padding: "32px 24px 64px" }}>
        <div className="mf-page-head">
          <h1 className="mf-page-title">AI request</h1>
        </div>
        <p className="mf-page-subhead" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{id}</p>

        {error && (
          <div className="db-empty"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>
        )}
        {!error && !request && <p className="mf-tiny-note">Loading…</p>}
        {!error && request && (
          <>
            <div className="mf-provenance" style={{ marginBottom: 16 }}>
              <span className="mf-prov-pill">{TYPE_LABELS[request.type] || request.type}</span>
              <StatusPill status={request.status} />
              {request.case_id && <span className="mf-prov-pill">case <b>{request.case_id.slice(0, 8)}…</b></span>}
              {request.model_id && <span className="mf-prov-pill">model <b>{request.model_id}</b></span>}
              {request.prompt_version && <span className="mf-prov-pill">prompt <b>{request.prompt_version}</b></span>}
              {request.token_count != null && <span className="mf-prov-pill">{request.token_count} tokens</span>}
              <span className="mf-prov-pill">{formatDuration(request.duration_ms)}</span>
              <span className="mf-prov-pill">queued {formatDate(request.created_at)}</span>
              {request.completed_at && <span className="mf-prov-pill">completed {formatDate(request.completed_at)}</span>}
            </div>

            <SourceSection request={request} />

            {request.status === "failed" ? (
              <div className="db-empty">
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                {request.error?.code ? `${request.error.code}: ` : ""}{request.error?.message || "Extraction failed."}
              </div>
            ) : request.status !== "completed" ? (
              <p className="mf-tiny-note">Still {request.status} — no result yet.</p>
            ) : (
              <AiResultBody request={request} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
