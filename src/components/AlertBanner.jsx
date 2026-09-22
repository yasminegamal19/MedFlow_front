import { AlertTriangle } from "lucide-react";

export function AlertBanner({ tone = "clay", title, children }) {
  return (
    <div className="mf-verdict mf-verdict-gap" style={tone === "clay" ? { background: "var(--clay-soft)", color: "var(--clay)" } : undefined}>
      <AlertTriangle size={16} />
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}
