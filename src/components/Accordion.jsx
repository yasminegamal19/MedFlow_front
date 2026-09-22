import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Accordion({ title, badge, tone, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mf-accordion">
      <button className="mf-accordion-head" onClick={() => setOpen((v) => !v)}>
        <span className="mf-accordion-title">{title}<span className={`mf-accordion-badge mf-tone-${tone}`}>{badge}</span></span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && <div className="mf-accordion-body">{children}</div>}
    </div>
  );
}
