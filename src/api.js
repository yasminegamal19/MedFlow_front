/* Thin client for the MedFlow Laravel backend.
 *
 * The frontend talks ONLY to the backend. It never knows the AI service URL,
 * never holds AI credentials, never sees AI-provider error detail.
 *
 *   submitExtraction({ note, pathway, caseId }) -> POST /api/v1/ai/extractions   (202)
 *   getExtraction(id)                           -> GET  /api/v1/ai/extractions/{id}
 *   retryExtraction(id)                         -> POST /api/v1/ai/extractions/{id}/retry
 *   listExtractions({ caseId, status })         -> GET  /api/v1/ai/extractions
 *
 * All routes require a Sanctum bearer token (VITE_API_TOKEN in dev, or set
 * setApiToken() after login). The backend forwards the note to the AI service,
 * receives the result via webhook, and this client just polls getExtraction()
 * until status is "completed" or "failed".
 */

const BASE = import.meta.env.VITE_API_BASE || "/api";

let apiToken = import.meta.env.VITE_API_TOKEN || null;

/** Call after login with the Sanctum personal-access token. */
export function setApiToken(token) {
  apiToken = token || null;
}

function headers(extra = {}) {
  const h = { accept: "application/json", ...extra };
  if (apiToken) h.authorization = `Bearer ${apiToken}`;
  return h;
}

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      body?.message ||
      body?.error?.message ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.code = body?.error?.code;
    err.errors = body?.errors; // 422 field errors
    throw err;
  }
  return body;
}

/**
 * Always requests a grounded extraction — the backend forwards this to the
 * ai-service's /v1/grounded-extractions job type (see AiRequestType::providerPath).
 *
 * @returns {Promise<{id: string, status: string}>} the queued AI request
 */
export function submitExtraction({ note, pathway, caseId }) {
  return fetch(`${BASE}/v1/ai/extractions`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      note,
      type: "grounded_extraction",
      ...(pathway ? { pathway } : {}),
      ...(caseId ? { case_id: caseId } : {}),
    }),
  })
    .then(parse)
    .then((b) => b.data);
}

/**
 * @returns {Promise<{
 *   id: string, status: string, type: string, case_id: string|null,
 *   model_id: string|null, prompt_version: string|null, token_count: number|null,
 *   duration_ms: number|null, result: object|null,
 *   error: {code: string, message: string}|null,
 *   created_at: string, completed_at: string|null, failed_at: string|null
 * }>}
 */
export function getExtraction(id) {
  return fetch(`${BASE}/v1/ai/extractions/${id}`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

export function retryExtraction(id) {
  return fetch(`${BASE}/v1/ai/extractions/${id}/retry`, {
    method: "POST",
    headers: headers(),
  })
    .then(parse)
    .then((b) => b.data);
}

export function listExtractions({ caseId, status } = {}) {
  const q = new URLSearchParams();
  if (caseId) q.set("case_id", caseId);
  if (status) q.set("status", status);
  const qs = q.toString();
  return fetch(`${BASE}/v1/ai/extractions${qs ? `?${qs}` : ""}`, {
    headers: headers(),
  }).then(parse); // { data: [...], meta, links }
}

export const isTerminal = (status) =>
  status === "completed" || status === "failed" || status === "cancelled";

export const isSucceeded = (status) => status === "completed";

/**
 * Runs the deterministic Clinical Rules Engine — synchronous, no polling.
 * `sections` is the (possibly physician-edited) extraction sections array.
 * Powers only the "Generic signals" panel; pathway criteria/red flags come
 * from the AI job below.
 *
 * @returns {Promise<{signals: object[], pathway: object|null}>}
 */
export function evaluateRules({ sections, pathway }) {
  return fetch(`${BASE}/v1/ai/rules/evaluate`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      extraction: { sections },
      ...(pathway ? { pathway } : {}),
    }),
  })
    .then(parse)
    .then((b) => b.data);
}

/**
 * Queues an AI pathway-validation job — the model judges each of the
 * pathway's criteria and red flags against `sections` (unlike
 * evaluateRules(), which keyword-matches deterministically). Poll the
 * returned record with getExtraction()/isTerminal(), same as an extraction.
 *
 * @returns {Promise<{id: string, status: string}>} the queued AI request
 */
export function submitPathwayValidation({ sections, pathway, caseId }) {
  return fetch(`${BASE}/v1/ai/extractions`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      note: JSON.stringify({ sections }),
      type: "pathway_validation",
      pathway,
      ...(caseId ? { case_id: caseId } : {}),
    }),
  })
    .then(parse)
    .then((b) => b.data);
}

/**
 * Queues an AI-assisted description of an already-uploaded case attachment
 * (e.g. an X-ray) — never a diagnosis. Fails with error.code
 * "unsupported_modality" if the ai-service's loaded model can't see images.
 * Poll the returned record with getExtraction()/isTerminal(), same as an
 * extraction.
 *
 * @returns {Promise<{id: string, status: string}>} the queued AI request
 */
export function analyzeAttachment(caseId, attachmentId) {
  return fetch(`${BASE}/cases/${caseId}/attachments/${attachmentId}/analyze`, {
    method: "POST",
    headers: headers(),
  })
    .then(parse)
    .then((b) => b.data);
}

/* ── Auth ───────────────────────────────────────────────────────────────── */

/** @returns {Promise<{user: object, token: string}>} */
export function login({ email, password }) {
  return fetch(`${BASE}/login`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ email, password }),
  })
    .then(parse)
    .then((b) => b.data);
}

export function logout() {
  return fetch(`${BASE}/logout`, { method: "POST", headers: headers() }).then(parse);
}

/* ── Case intake (organizations / users / case types / patients / cases) ── */

export function getCurrentUser() {
  return fetch(`${BASE}/user`, { headers: headers() }).then(parse);
}

/** @param {{clinic_town: string|null}} data */
export function updateProfile(data) {
  return fetch(`${BASE}/user`, {
    method: "PUT",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(data),
  }).then(parse);
}

export function listCaseTypes() {
  return fetch(`${BASE}/case-types`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

export function listWorkflowTemplates() {
  return fetch(`${BASE}/workflow-templates`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

export function createPatient(data) {
  return fetch(`${BASE}/patients`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(data),
  })
    .then(parse)
    .then((b) => b.data);
}

/**
 * @param {object} data - case fields (organization_id, patient_id, ...)
 * @param {File[]} [files] - supporting documents (e.g. an X-ray) to attach.
 *   Switches the request to multipart/form-data; omit for the plain JSON path.
 */
export function createCase(data, files = []) {
  if (files.length > 0) {
    const body = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v != null) body.append(k, v);
    });
    files.forEach((f) => body.append("attachments[]", f));
    return fetch(`${BASE}/cases`, {
      method: "POST",
      headers: headers(), // no content-type — the browser sets the multipart boundary
      body,
    })
      .then(parse)
      .then((b) => b.data);
  }

  return fetch(`${BASE}/cases`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(data),
  })
    .then(parse)
    .then((b) => b.data);
}

/* ── Generic table CRUD (admin data dashboard) ─────────────────────────────
 * Organizations, case-types and workflow-templates all follow the identical
 * {success, data} envelope — one factory instead of near-identical client
 * modules per resource.
 */
function resource(path) {
  return {
    list: () => fetch(`${BASE}${path}`, { headers: headers() }).then(parse).then((b) => b.data),
    create: (data) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: headers({ "content-type": "application/json" }),
        body: JSON.stringify(data),
      }).then(parse).then((b) => b.data),
    update: (id, data) =>
      fetch(`${BASE}${path}/${id}`, {
        method: "PUT",
        headers: headers({ "content-type": "application/json" }),
        body: JSON.stringify(data),
      }).then(parse).then((b) => b.data),
    remove: (id) => fetch(`${BASE}${path}/${id}`, { method: "DELETE", headers: headers() }).then(parse),
  };
}

export const tableResources = {
  organizations: resource("/organizations"),
  case_types: resource("/case-types"),
  workflow_templates: resource("/workflow-templates"),
};
