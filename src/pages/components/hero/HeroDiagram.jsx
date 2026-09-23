import { motion } from "framer-motion";
import {
  Stethoscope,
  FileText,
  Sparkles,
  FileCheck2,
  UserRound,
} from "lucide-react";
import { useLang } from "../../i18n/LanguageContext.jsx";
import { hero } from "../../data/ui";

const icons = [Stethoscope, FileText, Sparkles, FileCheck2, UserRound];

export default function HeroDiagram() {
  const { pick, isRTL } = useLang();
  const { diagram } = pick(hero);

  const nodeY = (i) => 40 + i * 78;
  const x = isRTL ? 252 : 48;
  const labelX = isRTL ? x - 44 : x + 44;
  const anchor = isRTL ? "end" : "start";

  return (
    <svg
      className="hero-diagram"
      viewBox="0 0 300 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={diagram.alt}
    >
      <motion.line
        x1={x}
        y1={nodeY(0)}
        x2={x}
        y2={nodeY(4)}
        stroke="var(--c-teal-300)"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />

      {diagram.nodes.map((label, i) => {
        const Icon = icons[i];
        const active = i === 2;
        return (
          <g key={label} transform={`translate(${x} ${nodeY(i)})`}>
            {active && (
              <motion.circle
                r="26"
                fill="var(--c-teal)"
                opacity="0.18"
                initial={{ scale: 0.7, opacity: 0 }}
                whileInView={{ scale: [0.9, 1.25, 0.9], opacity: [0.25, 0, 0.25] }}
                viewport={{ once: true }}
                transition={{ duration: 2.6, repeat: Infinity, delay: 1 }}
              />
            )}
            <motion.circle
              r="19"
              fill={active ? "var(--c-teal)" : "#FFFFFF"}
              stroke={active ? "var(--c-teal)" : "var(--c-primary-200)"}
              strokeWidth="1.6"
              initial={{ opacity: 0, scale: 0.75 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.2 + i * 0.14 }}
            />
            <foreignObject x="-9" y="-9" width="18" height="18">
              <Icon
                size={18}
                color={active ? "#FFFFFF" : "var(--c-primary)"}
                strokeWidth={1.9}
              />
            </foreignObject>
            <motion.text
              x={labelX - x}
              y="5"
              textAnchor={anchor}
              fontSize="13"
              fontWeight="600"
              fill="var(--c-ink)"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.32 + i * 0.14 }}
            >
              {label}
            </motion.text>
          </g>
        );
      })}
    </svg>
  );
}
