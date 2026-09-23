import "./Logo.css";

export default function Logo({ height = 30, tone = "dark", showWordmark = true }) {
  const blue = tone === "light" ? "#FFFFFF" : "#0B499B";
  const teal = tone === "light" ? "#3CC0B5" : "#09A79B";

  return (
    <span className="brand-logo" aria-hidden={showWordmark ? undefined : "true"}>
      <svg
        height={height}
        viewBox="0 0 44 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="30" cy="11.5" r="9.5" fill={teal} />
        <circle cx="15" cy="26" r="11.5" fill={blue} />
        <path
          d="M8.8 31.6C12.6 22.4 20.2 15.6 30.4 11.4"
          stroke="#FFFFFF"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && (
        <span className={`brand-word ${tone === "light" ? "is-light" : ""}`}>
          Clarity
        </span>
      )}
    </span>
  );
}
