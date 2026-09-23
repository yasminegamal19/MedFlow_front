import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import "./Alert.css";

const icons = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

export default function Alert({ variant = "info", children, className = "" }) {
  const Icon = icons[variant] || Info;
  return (
    <div
      className={`alert alert--${variant} ${className}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
