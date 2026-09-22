import { Field } from "./Field.jsx";
import { AiBadge } from "./AiBadge.jsx";

export function PillGroup({ label, value, onChange, options, aiValue }) {
  return (
    <Field label={label}>
      <div className="mf-channel-row">
        {options.map((o) => (
          <button type="button" key={o.value} className={`mf-channel-btn${value === o.value ? " active" : ""}`}
            onClick={() => onChange(o.value)}>
            {o.label}
            {aiValue === o.value && <AiBadge />}
          </button>
        ))}
      </div>
    </Field>
  );
}
