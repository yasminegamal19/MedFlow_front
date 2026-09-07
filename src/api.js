/* Thin client for the MedFlow Laravel backend.
 *
 *   submitExtraction({ note, pathway })  -> POST /api/extractions
 *   getExtraction(id)                    -> GET  /api/extractions/{id}
 *
 * The backend forwards the note to the MedGemma ai-service and receives the
 * result via webhook; the frontend just polls getExtraction() until the
 * status is "succeeded" or "failed".
 */

const BASE = import.meta.env.VITE_API_BASE || "/api";

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function submitExtraction({ note, pathway }) {
  return fetch(`${BASE}/extractions`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ note, pathway }),
  }).then(parse);
}

export function getExtraction(id) {
  return fetch(`${BASE}/extractions/${id}`, {
    headers: { accept: "application/json" },
  }).then(parse);
}

export const isTerminal = (status) =>
  status === "succeeded" || status === "failed";
