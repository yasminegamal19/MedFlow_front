import { BadgeCheck, ShieldCheck } from "lucide-react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import {
  securityPoints,
  securityContent,
  complianceGoals,
} from "../../data/security";
import "./Security.css";

export default function Security() {
  const { pick } = useLang();
  const t = pick(securityContent);
  const points = pick(securityPoints);
  const goals = pick(complianceGoals);

  return (
    <section id="security" className="section security">
      <div className="container security-grid">
        <div className="security-main">
          <SectionHead
            eyebrow={t.eyebrow}
            title={t.title}
            lead={t.lead}
            center={false}
            className="security-head"
          />

          <div className="security-points">
            {points.map((point, i) => (
              <Reveal
                key={point.title}
                delay={i * 0.07}
                className="security-point"
              >
                <span className="security-point-icon">
                  <point.icon size={19} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div>
                  <h3>{point.title}</h3>
                  <p>{point.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={0.1} className="compliance-card">
          <span className="compliance-shield">
            <ShieldCheck size={26} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h3>{t.goalsTitle}</h3>
          <ul>
            {goals.map((goal) => (
              <li key={goal}>
                <BadgeCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                <span>{goal}</span>
              </li>
            ))}
          </ul>
          <p className="compliance-note">{t.goalsNote}</p>
        </Reveal>
      </div>
    </section>
  );
}
