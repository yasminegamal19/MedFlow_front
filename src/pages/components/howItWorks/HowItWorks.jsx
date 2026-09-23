import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { steps, stepsContent } from "../../data/steps";
import "./HowItWorks.css";

export default function HowItWorks() {
  const { pick } = useLang();
  const t = pick(stepsContent);
  const list = pick(steps);

  return (
    <section id="how-it-works" className="section section--alt how-it-works">
      <div className="container">
        <SectionHead eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

        <div className="steps-row">
          <div className="steps-line" aria-hidden="true" />
          {list.map((step, i) => (
            <Reveal key={step.number} delay={i * 0.1} className="step-card">
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              {i === 2 && <span className="step-flag">{t.flag}</span>}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
