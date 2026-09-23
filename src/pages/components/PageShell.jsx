export function PageShell({ title, subhead, headerRight, children }) {
  return (
    <div className="mf-page">
      <div className="mf-page-head">
        <h1 className="mf-page-title">{title}</h1>
        {headerRight}
      </div>
      {subhead && <p className="mf-page-subhead">{subhead}</p>}
      {children}
    </div>
  );
}
