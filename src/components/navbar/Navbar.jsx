import { useEffect, useState } from "react";
import Link from "../ui/Link";
import { Menu, X, Languages } from "lucide-react";
import { navLinks, actions } from "../../data/navLinks";
import { useLang } from "../../i18n/LanguageContext.jsx";
import Button from "../ui/Button";
import Logo from "../ui/Logo";
import "./Navbar.css";

export default function Navbar() {
  const { pick, toggleLang, lang } = useLang();
  const links = pick(navLinks);
  const t = pick(actions);

  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close the mobile menu if the viewport grows past the breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px)");
    const onChange = (e) => e.matches && setIsOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className={`navbar ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="container navbar-inner">
        <a href="#home" className="navbar-brand" aria-label={t.brandHome}>
          <Logo height={30} />
        </a>

        <nav className="navbar-links" aria-label="Primary">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="navbar-actions">
          {/* <button
            type="button"
            className="lang-toggle"
            onClick={toggleLang}
            aria-label={t.switchLang}
            title={t.switchLang}
          >
            <Languages size={16} aria-hidden="true" />
            <span>{lang === "ar" ? "EN" : "ع"}</span>
          </button> */}
          <Link to="/login" className="navbar-login">
            {t.login}
          </Link>
          <Button as={Link} to="/register" variant="primary" size="sm">
            {t.getStarted}
          </Button>
        </div>

        <button
          type="button"
          className="navbar-toggle"
          aria-label={isOpen ? t.closeMenu : t.openMenu}
          aria-expanded={isOpen}
          aria-controls="navbar-mobile"
          onClick={() => setIsOpen((v) => !v)}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div
        id="navbar-mobile"
        className={`navbar-mobile ${isOpen ? "is-open" : ""}`}
      >
        <nav aria-label="Mobile">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setIsOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="navbar-mobile-actions">
          <Button
            as={Link}
            to="/login"
            variant="secondary"
            block
            onClick={() => setIsOpen(false)}
          >
            {t.login}
          </Button>
          <Button
            as={Link}
            to="/register"
            variant="primary"
            block
            onClick={() => setIsOpen(false)}
          >
            {t.getStarted}
          </Button>
          <button
            type="button"
            className="lang-toggle lang-toggle--wide"
            onClick={() => {
              toggleLang();
              setIsOpen(false);
            }}
          >
            <Languages size={16} aria-hidden="true" />
            <span>{lang === "ar" ? "English" : "العربية"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
