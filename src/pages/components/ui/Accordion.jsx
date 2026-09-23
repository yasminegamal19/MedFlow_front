import { useState } from "react";
import { Plus } from "lucide-react";
import "./Accordion.css";


export default function Accordion({ items = [], defaultOpen = 0 }) {
  const [openIndex, setOpenIndex] = useState(defaultOpen);

  return (
    <div className="accordion">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `faq-panel-${i}`;
        const triggerId = `faq-trigger-${i}`;

        return (
          <div
            className={`accordion-item ${isOpen ? "is-open" : ""}`}
            key={item.question}
          >
            <h3 className="accordion-heading">
              <button
                type="button"
                id={triggerId}
                className="accordion-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
              >
                <span>{item.question}</span>
                <Plus className="accordion-icon" size={20} aria-hidden="true" />
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className="accordion-panel"
            >
              <div className="accordion-panel-inner">
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
