import { ChevronRight } from "lucide-react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { workflowStages, workflowContent } from "../../data/workflow";
import "./AiWorkFlow.css";

export default function AiWorkFlow() {
  const { pick } = useLang();
  const t = pick(workflowContent);
  const stages = pick(workflowStages);

  return (
    <section className="section section--medical ai-workflow">
      <div className="container">
        <SectionHead eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

        <div className="workflow-track">
          {stages.map((stage, i) => (
            <div className="workflow-stage-wrap" key={stage.label}>
              <Reveal delay={i * 0.08} className="workflow-stage">
                <span className="workflow-dot" />
                <h3>{stage.label}</h3>
                <p>{stage.detail}</p>
              </Reveal>
              {i < stages.length - 1 && (
                <ChevronRight
                  className="workflow-arrow icon-flip"
                  size={20}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
