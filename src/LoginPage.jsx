import { useState } from "react";
import { ShieldCheck, LogIn } from "lucide-react";
import { GlobalStyle } from "./styles.jsx";
import Logo from "./components/ui/Logo.jsx";
import { login, setApiToken } from "./api.js";

export default function LoginPage({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const emailValid = /\S+@\S+\.\S+/.test(email);
  const passwordValid = password.length > 0;
  const canSubmit = emailValid && passwordValid && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!emailValid || !passwordValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const { user, token } = await login({ email, password });
      setApiToken(token);
      onLoggedIn({ user, token });
    } catch (err) {
      setError(
        err.status === 401
          ? "Incorrect email or password."
          : err.message || "Sign in failed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mf-app">
      <GlobalStyle />
      <div className="mf-auth-screen">
        <form className="mf-auth-card" onSubmit={submit}>
          <div className="mf-auth-brand">
            <ShieldCheck size={20} style={{ color: "var(--blue)" }} />
            <Logo height={20} />
          </div>
          <h1 className="mf-auth-title">Sign in</h1>
          <p className="mf-page-subhead" style={{ margin: "0 0 20px" }}>
            Use your Clarity account to access case intake and referral
            workflow.
          </p>

          <div className="mf-field">
            <label className="mf-label">Email</label>
            <input
              className="mf-input"
              type="email"
              autoComplete="username"
              placeholder="you@clinic.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {touched && !emailValid && (
              <p className="mf-error">Enter a valid email address.</p>
            )}
          </div>

          <div className="mf-field">
            <label className="mf-label">Password</label>
            <input
              className="mf-input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {touched && !passwordValid && (
              <p className="mf-error">Enter your password.</p>
            )}
          </div>

          {error && <p className="mf-error">{error}</p>}

          <button
            className="mf-primary-btn full"
            type="submit"
            disabled={!canSubmit}
          >
            <LogIn size={15} /> {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
