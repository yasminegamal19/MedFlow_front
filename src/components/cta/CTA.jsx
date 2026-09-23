import Link from "../ui/Link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Reveal from "../ui/Reveal";
import Button from "../ui/Button";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { ctaBand } from "../../data/ui";
import { actions } from "../../data/navLinks";
import "./CTA.css";

export default function CTA() {
  const { pick, isRTL } = useLang();
  const t = pick(ctaBand);
  const a = pick(actions);
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <section id="get-started" className="cta-band">
      <div className="container">
        <Reveal className="cta-inner">
          <span className="cta-eyebrow">{t.eyebrow}</span>
          <h2>{t.title}</h2>
          <p>{t.text}</p>
          <div className="cta-actions">
            <Button
              as={Link}
              to="/register"
              variant="light"
              size="lg"
              icon={Arrow}
              iconFlip={false}
            >
              {a.getStarted}
            </Button>
            <Button href="#contact" variant="outline-light" size="lg">
              {a.contactSales}
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
