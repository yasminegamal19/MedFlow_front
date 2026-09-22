import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { Card } from "../../components/Card.jsx";
import { RuleRow } from "../../components/RuleRow.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { urgencyCopy } from "../../data/mockData.js";

/* ── Stage 3b: Clinical validation + Rules Engine ───────────────────────── */

export function PageValidation({ signal, genericSignals, loading, error, ready, onRetry, onNext, onBack }) {
  return (
    <PageShell title="Clinical validation & rules"
      subhead="AI-assisted pathway check. A language model reads the extraction and judges it against the knee referral pathway's criteria and red flags (app/services/pathways/knee.yaml) — not keyword matching, an actual reading of each item. Urgency and missing criteria are still derived deterministically from those judgments. Generic signals below stay keyword-based. A physician must verify every finding before proceeding.">
      {loading && (
        <div className="mf-info-strip">
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Running AI pathway validation… this can take up to a minute on CPU.
        </div>
      )}
      {error && (
        <div className="mf-info-strip">
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
          <button className="mf-inline-link" onClick={onRetry} style={{ marginLeft: 8 }}>Retry</button>
        </div>
      )}
      <div className="mf-provenance">
        <span className="mf-prov-pill">pathway <b>{signal.title}</b></span>
        <span className="mf-prov-pill">matched pack <b>{String(signal.matched)}</b></span>
        {ready && signal.model_id && <span className="mf-prov-pill">model <b>{signal.model_id}</b></span>}
        {ready && signal.duration_seconds != null && (
          <span className="mf-prov-pill">{signal.token_count} tokens · {Math.round(signal.duration_seconds)}s</span>
        )}
        <span className={`mf-urgency mf-urgency-${signal.urgency}`}>{signal.urgency}</span>
      </div>

      <div className={`mf-verdict mf-verdict-${signal.urgency === "routine" ? "clean" : "gap"}`}>
        {signal.urgency === "routine" ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
        {urgencyCopy[signal.urgency]}
      </div>

      <SectionLabel>Referral criteria for this pathway</SectionLabel>
      <Card>
        {signal.criteria.map((c) => (
          <div className="mf-criterion-row" key={c.id}>
            <span className={`mf-criterion-mark ${c.met ? "met" : c.required ? "missing" : "optional"}`}>
              {c.met ? "✓" : c.required ? "!" : "–"}
            </span>
            <div className="mf-criterion-body">
              <span className="mf-criterion-label">{c.label}</span>
              {!c.required && <span className="mf-criterion-req">optional</span>}
              {c.required && !c.met && <span className="mf-criterion-req" style={{ color: "var(--clay)" }}>required — missing</span>}
              {c.evidence && <span className="mf-criterion-ev">matched: “{c.evidence}”</span>}
            </div>
          </div>
        ))}
      </Card>

      <SectionLabel>Red-flag screening</SectionLabel>
      <Card>
        {["Locked knee / true mechanical locking", "Unable to weight-bear", "Possible septic joint (hot, swollen, febrile)", "Acute significant trauma / suspected fracture"].map((rf) => {
          const hit = signal.red_flags.some((x) => x.toLowerCase().includes(rf.split(" ")[0].toLowerCase()));
          return (
            <div className="mf-redflag-row" key={rf}>
              <span className={hit ? "mf-redflag-hit" : ""}>{hit ? "⚠" : "○"}</span>
              <span className={hit ? "mf-redflag-hit" : ""}>{rf} — {hit ? "PRESENT" : "not detected"}</span>
            </div>
          );
        })}
      </Card>

      <SectionLabel>Generic signals</SectionLabel>
      <Card>
        {genericSignals.map((s) => (
          <RuleRow key={s.rule} met={s.outcome}
            label={`${s.rule}: ${s.outcome ? "yes" : "no"}`} detail={s.detail} />
        ))}
      </Card>

      {signal.missing.length > 0 && (
        <div className="mf-verdict mf-verdict-gap">
          <AlertTriangle size={16} />
          <span>Missing before referral: <b>{signal.missing.join("; ")}</b> — the specialist is likely to return this without it.</span>
        </div>
      )}

      <PageNav onBack={onBack} onNext={ready && !loading ? onNext : undefined} nextLabel="Generate referral draft" />
    </PageShell>
  );
}
