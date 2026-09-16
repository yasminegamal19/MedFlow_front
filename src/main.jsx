import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MedFlowApp from "./MedFlowApp.jsx";
import AlbertaRoutingPage from "./AlbertaRoutingPage.jsx";
import DashboardPage from "./DashboardPage.jsx";
import LoginPage from "./LoginPage.jsx";
import { setApiToken, logout as logoutApi } from "./api.js";
import "./index.css";

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

  useEffect(() => {
    setApiToken(auth?.token || null);
  }, [auth]);

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

  const requestedPage = new URLSearchParams(window.location.search).get("page");
  const backToWorkflow = () => { window.location.search = ""; };

  // Standalone tools, outside the case wizard's step gating — reachable any
  // time regardless of where the doctor is in an in-progress case.
  if (requestedPage === "alberta-routing") {
    return <AlbertaRoutingPage user={auth.user} onLogout={handleLogout} onBack={backToWorkflow} />;
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
