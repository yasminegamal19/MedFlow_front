import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import MedFlowApp from "./pages/MedFlowApp.jsx";
import AlbertaRoutingPage from "./pages/AlbertaRoutingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import AiRequestDetailPage from "./pages/AiRequestDetailPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import { setApiToken, logout as logoutApi } from "./lib/api.js";
import "./index.css";
import "./styles/tokens.css";
import "./styles/app.css";

const STORAGE_KEY = "medflow.auth";

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function AuthGate() {
  const [auth, setAuth] = useState(readStoredAuth);

  // Synchronous, not a useEffect: on a hard page load (any ?page=... link
  // does a real navigation, not a SPA route change), a child page's own
  // mount effect fires before this component's effects would — racing
  // ahead of the token fix-up and using api.js's stale VITE_API_TOKEN
  // fallback instead. Setting it directly in the render body guarantees
  // every child sees the real token before its own effects ever run.
  setApiToken(auth?.token || null);

  if (!auth) {
    return (
      <LoginPage
        onLoggedIn={({ user, token }) => {
          const next = { user, token };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          setAuth(next);
        }}
      />
    );
  }

  const handleLogout = () => {
    logoutApi().catch(() => { /* best-effort revoke */ });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setAuth(null);
  };

  const handleUserUpdate = (updatedUser) => {
    setAuth((prev) => {
      const next = { ...prev, user: updatedUser };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const searchParams = new URLSearchParams(window.location.search);
  const requestedPage = searchParams.get("page");
  const backToWorkflow = () => { window.location.search = ""; };

  // Standalone tools, outside the case wizard's step gating — reachable any
  // time regardless of where the doctor is in an in-progress case.
  if (requestedPage === "alberta-routing") {
    return <AlbertaRoutingPage user={auth.user} onLogout={handleLogout} onBack={backToWorkflow} />;
  }
  if (requestedPage === "ai-request") {
    return (
      <AiRequestDetailPage
        id={searchParams.get("id")}
        onLogout={handleLogout}
        onBack={() => { window.location.search = "?page=dashboard&tab=ai-requests"; }}
      />
    );
  }
  if (requestedPage === "dashboard" || requestedPage === "profile") {
    return (
      <DashboardPage
        user={auth.user}
        onLogout={handleLogout}
        onBack={backToWorkflow}
        onUserUpdate={handleUserUpdate}
      />
    );
  }
  return (
    <MedFlowApp user={auth.user} onLogout={handleLogout}
      onOpenDashboard={() => { window.location.search = "?page=dashboard"; }} />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>
);
