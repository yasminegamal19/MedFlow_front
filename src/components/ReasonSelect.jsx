import { ChevronDown } from "lucide-react";

export function ReasonSelect({ value, onChange, groups, reasons }) {
  return (
    <div className="mf-select-wrap">
      <select className="mf-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Select a reason for referral…</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {reasons.filter((r) => r.group === g).map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={16} className="mf-select-icon" />
    </div>
  );
}
