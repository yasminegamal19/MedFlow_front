import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { listExtractions } from "../lib/api.js";

export const TYPE_LABELS = {
  extraction: "Extraction",
  grounded_extraction: "Grounded extraction",
  pathway_form_extraction: "Pathway form",
  pathway_validation: "Pathway validation",
  imaging_analysis: "Imaging analysis",
};

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_TONE = {
  queued: "neutral", processing: "blue", completed: "sage", failed: "clay", cancelled: "neutral",
};

export function StatusPill({ status }) {
  return <span className={`mf-status-pill-sm mf-status-pill-${STATUS_TONE[status] || "neutral"}`}>{status}</span>;
}

/** Where the request's (never-exposed) input text actually came from — see
 * AiRequestResource::toArray()'s `source`/`source_document` fields on the
 * backend. A document means it was OCR'd (CaseController::store()'s
 * referral_document handling); note means it was typed at Case Intake. */
export function SourceLabel({ request }) {
  if (request.source !== "document") return <span className="mf-tiny-note">Typed note</span>;
  return (
    <span className="mf-tiny-note" title={request.source_document?.filename}>
      Document{request.source_document?.filename ? `: ${request.source_document.filename}` : ""}
    </span>
  );
}

export function formatDuration(ms) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

/** Read-only browse of AiRequest rows — every AI job the backend has queued
 * (extraction, pathway form fill, pathway validation, imaging), across the
 * whole org, for spotting stuck/failed jobs without needing DB access.
 * Click a row to open its full result on its own page
 * (?page=ai-request&id=..., see AiRequestDetailPage.jsx). */
export default function AiRequestsBrowser() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setRequests(null);
    setError(null);
    listExtractions({ status: status || undefined })
      .then((body) => setRequests(body.data))
      .catch((err) => setError(err.message || "Could not load AI requests."));
  }, [status, reloadKey]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((f) => (
            <button type="button" key={f.key || "all"}
              className={`mf-mini-btn${status === f.key ? "" : " ghost"}`}
              onClick={() => setStatus(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="mf-mini-btn ghost" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Refresh
        </button>
      </div>

      {error && (
        <div className="db-empty"><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</div>
      )}
      {!error && requests === null && <p className="mf-tiny-note">Loading AI requests…</p>}
      {!error && requests !== null && requests.length === 0 && (
        <p className="mf-tiny-note">No AI requests{status ? ` with status "${status}"` : ""} yet.</p>
      )}
      {!error && requests !== null && requests.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="db-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Source</th>
                <th>Case</th>
                <th>Model</th>
                <th>Duration</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} onClick={() => { window.location.search = `?page=ai-request&id=${r.id}`; }}
                  style={{ cursor: "pointer" }}>
                  <td>{TYPE_LABELS[r.type] || r.type}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td><SourceLabel request={r} /></td>
                  <td>{r.case_id ? r.case_id.slice(0, 8) + "…" : "—"}</td>
                  <td>{r.model_id || "—"}</td>
                  <td>{formatDuration(r.duration_ms)}</td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
