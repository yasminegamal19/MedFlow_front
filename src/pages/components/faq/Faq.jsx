import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import Accordion from "../ui/Accordion";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { faqs, faqContent } from "../../data/faqs";
import "./Faq.css";

export default function Faq() {
  const { pick } = useLang();
  const t = pick(faqContent);
  const items = pick(faqs);

  return (
    <section id="faq" className="section section--mist faq">
      <div className="container faq-inner">
        <SectionHead eyebrow={t.eyebrow} title={t.title} lead={t.lead} />
        <Reveal delay={0.05} className="faq-panel">
          <Accordion items={items} />
        </Reveal>
      </div>
    </section>
  );
}
