# MedFlow — Frontend

React (Vite) single-page app for the MedFlow referral pipeline demo.

## Run

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. The dev server proxies `/api` to the Laravel
backend at `http://localhost:8010` (see `vite.config.js` / `.env`).

## Build

```bash
npm run build && npm run preview
```

## Structure

- `src/main.jsx` — entry point, mounts `<MedFlowApp />`
- `src/MedFlowApp.jsx` — the wizard: intake → AI extraction → structured data →
  clinical validation → business rules → referral generation → doctor review.
  **All static / mock data** — click through the whole flow with no backend.
- `src/LiveExtraction.jsx` — the two **live** nav tabs (`LiveExtract`, `LiveData`)
- `src/api.js` — backend client: `submitExtraction()`, `getExtraction()`
- `src/format.js` — shared JSON pretty-print + schema-flatten helpers
- `src/index.css` — minimal global reset

### Static wizard vs. live tabs

The 8-step wizard (`Patient info` … `Doctor review`) is a **self-contained
static demo** — every value is fixed mock data in `MedFlowApp.jsx`.

Two extra nav tabs — **"AI extraction · live"** and **"Structured JSON · live"** —
are the real thing:

- `LiveExtract` submits a note via `POST /api/extractions`, then
  `MedFlowApp` polls `GET /api/extractions/{id}` every 5s.
- While the job runs (CPU inference, 10–30 min) it shows a progress state; the
  job id is saved to `localStorage` so a refresh resumes.
- On success it renders the MedGemma contract fields (`age`, `sex`,
  `chief_complaint`, `past_medical_history`, `medications`, `vital_signs`,
  `relevant_findings`); `LiveData` shows the raw JSON + a schema table.

These tabs need the backend and `ai-service` running — see the repo root
`README.md`. The static wizard does not.

## Config

| `.env` var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | `/api` | path the client calls (proxied in dev) |
| `VITE_BACKEND_ORIGIN` | `http://localhost:8010` | proxy target for `/api` |
