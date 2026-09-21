/* Thin client for the MedFlow Laravel backend.
 *
 * The frontend talks ONLY to the backend. It never knows the AI service URL,
 * never holds AI credentials, never sees AI-provider error detail.
 *
 *   submitExtraction({ note, pathway, caseId })           -> POST /api/v1/ai/extractions   (202)
 *   submitPathwayFormExtraction({ note, pathwayId, caseId }) -> POST /api/v1/ai/extractions (202)
 *   getExtraction(id)                                     -> GET  /api/v1/ai/extractions/{id}
 *   getAutoFill(extractionId, pathwayId)                  -> GET  /api/v1/ai/extractions/{id}/autofill
 *   retryExtraction(id)                                   -> POST /api/v1/ai/extractions/{id}/retry
 *   listExtractions({ caseId, status })                   -> GET  /api/v1/ai/extractions
 *
 * All routes require a Sanctum bearer token (VITE_API_TOKEN in dev, or set
 * setApiToken() after login). The backend forwards the note to the AI service,
 * receives the result via webhook, and this client just polls getExtraction()
 * until status is "completed" or "failed".
 */

export const BASE = import.meta.env.VITE_API_BASE || "/api";

let apiToken = import.meta.env.VITE_API_TOKEN || null;

/** Call after login with the Sanctum personal-access token. */
export function setApiToken(token) {
  apiToken = token || null;
}

export function headers(extra = {}) {
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
 * Queues a pathway-form-extraction job — the ai-service answers the
 * selected pathway's own intake-form fields directly from the note
 * (validated server-side against each field's own type/options), instead of
 * returning free text for client-side keyword matching. `pathwayId` is
 * required (the backend resolves that pathway's AI-fillable fields from its
 * own database — see PathwayService::aiFillableFields()). Poll the returned
 * record with getExtraction()/isTerminal(), same as an extraction, then
 * call getAutoFill() once it completes.
 *
 * @returns {Promise<{id: string, status: string}>} the queued AI request
 */
export function submitPathwayFormExtraction({ note, pathwayId, caseId }) {
  return fetch(`${BASE}/v1/ai/extractions`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({
      note,
      type: "pathway_form_extraction",
      pathway_id: pathwayId,
      ...(caseId ? { case_id: caseId } : {}),
    }),
  })
    .then(parse)
    .then((b) => b.data);
}

/**
 * Overlays a completed extraction's facts onto `pathwayId`'s form
 * definition, keyed by field code — works for either a grounded or a
 * pathway-form extraction id (the backend picks the matching strategy).
 *
 * @returns {Promise<{
 *   pathway: object, version: object,
 *   sections: {code: string, name: string, fields: {code: string, field_type: string, value: *}[]}[]
 * }>}
 */
export function getAutoFill(extractionId, pathwayId) {
  const q = new URLSearchParams({ pathway_id: pathwayId });
  return fetch(`${BASE}/v1/ai/extractions/${extractionId}/autofill?${q}`, {
    headers: headers(),
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

/**
 * Queues an AI extraction from an already-uploaded document attachment
 * (e.g. DOCX, PDF) — extracts structured clinical data from the document.
 * The response includes both the AI job record AND the `extracted_text` the
 * backend pulled from the document synchronously, so the caller can display
 * that text immediately without waiting for the job to complete.
 *
 * @returns {Promise<{id: string, status: string, extracted_text?: string}>}
 */
export function extractDocument(caseId, attachmentId) {
  return fetch(`${BASE}/cases/${caseId}/attachments/${attachmentId}/analyze`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: 'document_extraction' }),
  })
    .then(parse)
    .then((b) => b.data); // includes extracted_text for document attachments
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

/** Specializations -> pathways -> conditions/criteria/red flags/imaging/actions/rules. Read-only. */
export function listClinicalPathways() {
  return fetch(`${BASE}/clinical-pathways`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

/** The pathways Clinical Assessment can render — for the intake picker. */
export function listPathways() {
  return fetch(`${BASE}/pathways`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

/** A pathway's active-version field definition (sections -> fields ->
 * options/AI-fill mapping) — the JSON meant to tell an AI step which fields
 * exist and how to fill them. */
export function getPathwayDefinition(pathwayId) {
  return fetch(`${BASE}/pathways/${pathwayId}`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

/** The full Alberta referral-pathway catalog (entry doors, program
 * contacts, clinical-pathway names, emergency/urgent indications, and
 * every reason-for-referral row) — read-only, seeded from both provincial
 * pathway PDFs. See database/seeders/ReferralRoutingSeeder.php. */
export function getReferralRoutingCatalog() {
  return fetch(`${BASE}/referral-routing/catalog`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

/** A case's saved referral-routing decision, or null if none yet. */
export function getCaseReferralRouting(caseId) {
  return fetch(`${BASE}/cases/${caseId}/referral-routing`, { headers: headers() })
    .then(parse)
    .then((b) => b.data);
}

/** Persists (creates or updates) a case's referral-routing decision — the
 * "action" behind the Referral Routing step's Continue button. */
export function submitCaseReferralRouting(caseId, data) {
  return fetch(`${BASE}/cases/${caseId}/referral-routing`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(data),
  })
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

/** @param {{organizationId?: string, status?: string}} [filters] */
export function listCases({ organizationId, status } = {}) {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", organizationId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return fetch(`${BASE}/cases${qs ? `?${qs}` : ""}`, { headers: headers() })
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
