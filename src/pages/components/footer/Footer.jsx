import Logo from "../ui/Logo";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { footer } from "../../data/ui";
import "./Footer.css";

export default function Footer() {
  const { pick } = useLang();
  const t = pick(footer);

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo height={30} tone="light" />
          <p>{t.tagline}</p>
        </div>

        <div className="footer-columns">
          {t.columns.map((col) => (
            <div className="footer-column" key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="container footer-bottom">
        <p>
          &copy; {new Date().getFullYear()} Clarity. {t.rights}
        </p>
        <p>{t.madeFor}</p>
      </div>
    </footer>
  );
}
