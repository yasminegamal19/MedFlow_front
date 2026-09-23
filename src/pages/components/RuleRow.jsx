import { Check, AlertTriangle } from "lucide-react";

export function RuleRow({ label, detail, met }) {
  return (
    <div className="mf-rule-row">
      <span className={`mf-rule-dot ${met ? "pass" : "fail"}`}>{met ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={10} />}</span>
      <span className="mf-rule-text">{label}{detail && <span className="mf-rule-detail">{detail}</span>}</span>
    </div>
  );
}
