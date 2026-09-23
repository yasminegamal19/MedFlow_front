import { Check } from "lucide-react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { features, featuresContent } from "../../data/features";
import {
  benefitsContent,
  physicianBenefits,
  specialistBenefits,
} from "../../data/benefits";
import "./Features.css";

export default function Features() {
  const { pick } = useLang();
  const t = pick(featuresContent);
  const list = pick(features);
  const b = pick(benefitsContent);
  const forPhysicians = pick(physicianBenefits);
  const forSpecialists = pick(specialistBenefits);

  return (
    <section id="features" className="section features">
      <div className="container">
        <SectionHead eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

        <div className="features-grid">
          {list.map((feature, i) => (
            <Reveal
              key={feature.title}
              delay={(i % 4) * 0.07}
              className="feature-card"
            >
              <span className="feature-icon">
                <feature.icon size={21} strokeWidth={1.85} aria-hidden="true" />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </Reveal>
          ))}
        </div>

        <div className="benefits-grid">
          <Reveal className="benefit-panel">
            <h3>{b.physicians}</h3>
            <ul>
              {forPhysicians.map((item) => (
                <li key={item}>
                  <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="benefit-panel benefit-panel--teal">
            <h3>{b.specialists}</h3>
            <ul>
              {forSpecialists.map((item) => (
                <li key={item}>
                  <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
