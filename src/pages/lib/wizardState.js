import {
  FileText, Sparkles, ShieldCheck, FileSignature, UserCheck, User, Send,
  GitBranch, ClipboardList, Route,
} from "lucide-react";
import { PATIENT_DEFAULTS } from "../data/mockData.js";
import { isTerminal } from "./api.js";

export const NAV = [
  { id: "patient", label: "Patient", icon: User, stage: "1 · Case creation" },
  { id: "intake", label: "Case intake", icon: FileText, stage: "1 · Case creation" },
  { id: "extraction", label: "AI extraction", icon: Sparkles, stage: "2 · AI ingestion & extraction" },
  { id: "clinical-assessment", label: "Clinical assessment", icon: ClipboardList, stage: "3 · Clinical validation & rule check" },
  { id: "referral-routing", label: "Referral routing", icon: Route, stage: "3 · Clinical validation & rule check" },
  { id: "validation", label: "Validation & rules", icon: ShieldCheck, stage: "3 · Clinical validation & rule check" },
  { id: "referral", label: "Referral draft", icon: FileSignature, stage: "4 · Draft generation" },
  { id: "review", label: "Physician review", icon: UserCheck, stage: "5 · Review & authorisation" },
  { id: "send", label: "Route & send", icon: Send, stage: "6 · Communication" },
  { id: "feedback", label: "Feedback & audit", icon: GitBranch, stage: "7 · Tracking & learning" },
];

// Demo-only fax number (555 prefix, same fictional convention as the rest of
// mockData.js) — the routing map has no real per-clinic directory yet.
const FAX_AREA_CODE_BY_HUB = {
  Edmonton: "780", "Grande Prairie": "780", "Fort McMurray": "780",
  Calgary: "403", "Red Deer": "403", Lethbridge: "403", "Medicine Hat": "403",
};
export function fakeFax(hub, i) {
  return `(${FAX_AREA_CODE_BY_HUB[hub] || "403"}) 555-01${String(i).padStart(2, "0")}`;
}

// The ai-service's grounded-extraction result is { items: [{label, value,
// source_phrase, verbatim}], not_stated: [...] } — reshape it into the same
// {title, content, source_phrase, verbatim} shape the sections-based UI
// (Structured data, Physician review) already knows how to render.
export function sectionsFromItems(items) {
  return (items || []).map((it) => ({
    title: it.label,
    content: it.value,
    source_phrase: it.source_phrase,
    verbatim: it.verbatim,
  }));
}

export function pageFromUrl() {
  const id = new URLSearchParams(window.location.search).get("page");
  return NAV.some((n) => n.id === id) ? id : "patient";
}

export function visitedThrough(pageId) {
  const idx = NAV.findIndex((n) => n.id === pageId);
  const v = {};
  NAV.forEach((n, i) => { if (i <= idx) v[n.id] = true; });
  return v;
}

// Whether each step's own data/action requirement is satisfied — the gate
// that stops sidebar clicks, deep-link URLs, and browser back/forward from
// skipping past a step that hasn't actually been completed. It does NOT gate
// the in-page Next buttons — those already validate before calling next().
export function computeStepOk({ patientOk, extraction, validationOk, decision, sendState }) {
  const extractionOk = Boolean(extraction && isTerminal(extraction.status) && extraction.status !== "failed" && extraction.result?.items);
  return {
    patient: patientOk,
    intake: Boolean(extraction),
    extraction: extractionOk,
    "clinical-assessment": extractionOk,
    "referral-routing": extractionOk,
    validation: extractionOk,
    referral: Boolean(validationOk),
    review: Boolean(decision),
    send: sendState === "sent",
    feedback: sendState === "sent",
  };
}

export function frontierOf(stepOk) {
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

export function initialPage() {
  const idx = Math.max(0, NAV.findIndex((n) => n.id === pageFromUrl()));
  return NAV[Math.min(idx, INITIAL_FRONTIER)].id;
}
