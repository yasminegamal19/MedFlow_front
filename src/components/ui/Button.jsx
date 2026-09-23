import "./Button.css";
export default function Button({
  children,
  variant = "primary",
  size = "md",
  as = "a",
  href = "#",
  icon: Icon,
  iconFlip = true,
  block = false,
  className = "",
  ...rest
}) {
  const Tag = as;
  return (
    <Tag
      className={[
        "btn",
        `btn--${variant}`,
        `btn--${size}`,
        block ? "btn--block" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      href={as === "a" ? href : undefined}
      {...rest}
    >
      <span className="btn-label">{children}</span>
      {Icon && (
        <Icon
          className={iconFlip ? "icon-flip" : undefined}
          size={17}
          strokeWidth={2.2}
          aria-hidden="true"
        />
      )}
    </Tag>
  );
}
