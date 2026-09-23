import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { trustPillars } from "../../data/trust";
import "./Trust.css";

export default function Trust() {
  const { pick } = useLang();
  const pillars = pick(trustPillars);

  return (
    <section className="trust section--tight">
      <div className="container trust-row">
        {pillars.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.08} className="trust-item">
            <span className="trust-icon">
              <p.icon size={20} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
