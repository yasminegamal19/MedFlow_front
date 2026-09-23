import { Check } from "lucide-react";
import "./Steps.css";

export default function Steps({ steps = [], current = 0, className = "" }) {
  return (
    <ol className={`steps ${className}`}>
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li className={`steps-item is-${state}`} key={label}>
            <span className="steps-marker">
              {state === "done" ? (
                <Check size={13} strokeWidth={3} aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>
            <span className="steps-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
