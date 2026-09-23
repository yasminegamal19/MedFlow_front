import "./Spinner.css";

export default function Spinner({ size = 18, label }) {
  return (
    <span className="spinner-wrap">
      <span
        className="spinner"
        style={{ width: size, height: size }}
        role="status"
        aria-label={label || "جارٍ التحميل"}
      />
      {label && <span className="spinner-label">{label}</span>}
    </span>
  );
}
