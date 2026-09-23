import { AiBadge } from "./AiBadge.jsx";

export function CheckField({ label, hint, checked, onChange, danger, ai, after }) {
  return (
    <label className={`mf-attest-row${danger ? " gap" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {ai && <AiBadge />}
        {after}
        {hint && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>{hint}</span>}
      </span>
    </label>
  );
}
