import Reveal from "./Reveal";
export default function SectionHead({
  eyebrow,
  title,
  lead,
  center = true,
  eyebrowVariant = "",
  className = "",
  children,
}) {
  return (
    <Reveal
      className={`section-head ${center ? "section-head--center" : ""} ${className}`}
    >
      {eyebrow && (
        <span className={`eyebrow ${eyebrowVariant}`}>{eyebrow}</span>
      )}
      {title && <h2>{title}</h2>}
      {lead && <p>{lead}</p>}
      {children}
    </Reveal>
  );
}
