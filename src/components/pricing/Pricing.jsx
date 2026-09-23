import { useState } from "react";
import Link from "../ui/Link";
import { Check, Sparkles } from "lucide-react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import Button from "../ui/Button";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { plans, pricingContent } from "../../data/pricing";
import "./Pricing.css";

export default function Pricing() {
  const { pick } = useLang();
  const t = pick(pricingContent);
  const list = pick(plans);
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="section pricing">
      <div className="container">
        <SectionHead eyebrow={t.eyebrow} title={t.title} lead={t.lead}>
          <div className="billing-toggle" role="group" aria-label={t.eyebrow}>
            <button
              type="button"
              className={!yearly ? "is-active" : ""}
              aria-pressed={!yearly}
              onClick={() => setYearly(false)}
            >
              {t.monthly}
            </button>
            <button
              type="button"
              className={yearly ? "is-active" : ""}
              aria-pressed={yearly}
              onClick={() => setYearly(true)}
            >
              {t.yearly}
              <span className="billing-save">{t.save}</span>
            </button>
          </div>
        </SectionHead>

        <div className="plans-grid">
          {list.map((plan, i) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const isCustom = price === null;

            return (
              <Reveal
                key={plan.id}
                delay={i * 0.09}
                className={`plan-card ${plan.highlight ? "is-highlight" : ""}`}
              >
                {plan.highlight && (
                  <span className="plan-badge">
                    <Sparkles size={13} aria-hidden="true" />
                    {t.popular}
                  </span>
                )}

                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-desc">{plan.description}</p>

                <div className="plan-price">
                  {isCustom ? (
                    <span className="plan-amount plan-amount--custom">
                      {t.custom}
                    </span>
                  ) : (
                    <>
                      <span className="plan-amount" dir="ltr">
                        {plan.currency}
                        {price}
                      </span>
                      <span className="plan-period">
                        {yearly ? t.perMonthYearly : t.perMonth}
                      </span>
                    </>
                  )}
                </div>

                <Button
                  as={Link}
                  to={
                    plan.monthly === null
                      ? "#contact"
                      : `/register?plan=${plan.id}`
                  }
                  variant={plan.highlight ? "primary" : "secondary"}
                  block
                  className="plan-cta"
                >
                  {plan.cta}
                </Button>

                <ul className="plan-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="pricing-note">
          <p>{t.note}</p>
        </Reveal>
      </div>
    </section>
  );
}
