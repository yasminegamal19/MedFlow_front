import { useId, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import "./Field.css";

export default function Field({
  label,
  error,
  hint,
  icon: Icon,
  type = "text",
  as = "input",
  options = [],
  className = "",
  ...rest
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}

      <div className="field-control">
        {Icon && <Icon className="field-icon" size={17} aria-hidden="true" />}

        {as === "select" ? (
          <select
            id={id}
            className={`field-input ${Icon ? "has-icon" : ""}`}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : as === "textarea" ? (
          <textarea
            id={id}
            rows={4}
            className={`field-input field-textarea ${Icon ? "has-icon" : ""}`}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...rest}
          />
        ) : (
          <input
            id={id}
            type={inputType}
            className={`field-input ${Icon ? "has-icon" : ""} ${
              isPassword ? "has-toggle" : ""
            }`}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...rest}
          />
        )}

        {isPassword && (
          <button
            type="button"
            className="field-toggle"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>

      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
