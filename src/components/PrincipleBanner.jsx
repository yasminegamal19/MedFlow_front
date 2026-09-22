import { ShieldCheck } from "lucide-react";
import { GUIDING_PRINCIPLE } from "../data/mockData.js";

export function PrincipleBanner() {
  return (
    <div className="mf-principle-banner">
      <ShieldCheck size={17} style={{ flexShrink: 0, marginTop: 1, color: "var(--blue)" }} />
      <span><b>Guiding principle.</b> {GUIDING_PRINCIPLE}</span>
    </div>
  );
}
