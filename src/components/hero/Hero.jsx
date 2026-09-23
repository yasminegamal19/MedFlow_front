import Link from "../ui/Link";
import { ArrowLeft, ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import Button from "../ui/Button";
import Reveal from "../ui/Reveal";
import HeroDiagram from "./HeroDiagram";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { hero } from "../../data/ui";
import { actions } from "../../data/navLinks";
import "./Hero.css";

export default function Hero() {
  const { pick, isRTL } = useLang();
  const t = pick(hero);
  const a = pick(actions);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <section id="home" className="hero bg-grid">
      <div className="hero-glow hero-glow--blue" aria-hidden="true" />
      <div className="hero-glow hero-glow--teal" aria-hidden="true" />

      <div className="container hero-grid">
        <div className="hero-copy">
          <Reveal>
            <span className="eyebrow">{t.eyebrow}</span>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="hero-title">
              {t.titleLead}{" "}
              <span className="text-gradient">{t.titleAccent}</span>
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="hero-lead">{t.lead}</p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="hero-actions">
              <Button as={Link} to="/register" variant="primary" size="lg" icon={Arrow} iconFlip={false}>
                {a.getStarted}
              </Button>
              <Button as={Link} to="/login" variant="secondary" size="lg" icon={LogIn}>
                {a.login}
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <p className="hero-note">
              <ShieldCheck size={15} aria-hidden="true" />
              {t.note}
            </p>
          </Reveal>

          <Reveal delay={0.25}>
            <ul className="hero-stats">
              {t.stats.map((stat) => (
                <li key={stat.label}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.12} className="hero-visual">
          <div className="hero-panel">
            <div className="hero-panel-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <em>{t.diagram.title}</em>
            </div>
            <div className="hero-panel-body">
              <HeroDiagram />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
