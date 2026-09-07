# MedFlow — Frontend

React (Vite) single-page app for the MedFlow referral pipeline demo.

## Run

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. The dev server proxies `/api` to the Laravel
backend at `http://localhost:8010` (see `vite.config.js` / `.env`), so the
backend and `ai-service` must be running for the AI extraction step — see the
repo root `README.md`.

## Build

```bash
npm run build && npm run preview
```

## Structure

- `src/main.jsx` — entry point, mounts `<MedFlowApp />`
- `src/api.js` — backend client: `submitExtraction()`, `getExtraction()`
- `src/MedFlowApp.jsx` — the whole app: intake → **AI extraction (live)** →
  structured data → clinical validation → business rules → referral generation →
  doctor review. Styling is self-contained (inline `<style>` + Google Fonts).
- `src/index.css` — minimal global reset

### What's live vs. mocked

The **intake → AI extraction → structured data** steps are wired to the real
backend:

- `PageIntake` submits the pasted note via `POST /api/extractions`.
- `MedFlowApp` polls `GET /api/extractions/{id}` every 5s.
- `PageAI` shows a progress state while the job runs (CPU inference is
  10–30 min), then renders the MedGemma contract fields (`age`, `sex`,
  `chief_complaint`, `past_medical_history`, `medications`, `vital_signs`,
  `relevant_findings`).
- `PageStructured` shows the raw result JSON and a schema table.

Everything from **clinical validation** onward is still mock data inside
`MedFlowApp.jsx`.

## Config

| `.env` var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | `/api` | path the client calls (proxied in dev) |
| `VITE_BACKEND_ORIGIN` | `http://localhost:8010` | proxy target for `/api` |
