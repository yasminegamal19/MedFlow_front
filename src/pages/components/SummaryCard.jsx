export function SummaryCard({ title, children }) {
  return <div className="mf-summary-card"><p className="mf-summary-title">{title}</p>{children}</div>;
}
export function SummaryRow({ k, v }) {
  return <div className="mf-summary-row"><span className="mf-summary-key">{k}</span><span className="mf-summary-val">{v}</span></div>;
}
