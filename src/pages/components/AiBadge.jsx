import { Sparkles } from "lucide-react";

// Small "AI suggested this — verify or change it" badge, shown next to a
// field's current value only until the physician interacts with that field.
export function AiBadge() {
  return (
    <span className="mf-ai-tag" title="Suggested from the AI extraction — verify or change it">
      <Sparkles size={10} /> AI
    </span>
  );
}
