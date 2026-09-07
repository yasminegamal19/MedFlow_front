import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MedFlowApp from "./MedFlowApp.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MedFlowApp />
  </StrictMode>
);
