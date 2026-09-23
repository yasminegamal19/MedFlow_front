import Reveal from "../ui/Reveal";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { problems, problemsContent } from "../../data/problems";
import "./Problem.css";

export default function Problem() {
  const { pick } = useLang();
  const t = pick(problemsContent);
  const items = pick(problems);

  return (
    <section className="section problem">
      <div className="container">
        <div className="problem-grid">
          <Reveal className="section-head problem-head">
            <span className="eyebrow eyebrow--blue">{t.eyebrow}</span>
            <h2>{t.title}</h2>
            <p>{t.lead}</p>
          </Reveal>

          <ul className="problem-list">
            {items.map((p, i) => (
              <Reveal
                as="li"
                key={p.title}
                delay={i * 0.07}
                className="problem-item"
              >
                <span className="problem-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
