import { ArrowLeft, ArrowRight } from "lucide-react";

export function PageNav({ onBack, onNext, nextLabel }) {
  return (
    <div className="mf-page-nav">
      {onBack ? <button className="mf-ghost-btn" onClick={onBack}><ArrowLeft size={15} /> Back</button> : <span />}
      {onNext && <button className="mf-primary-btn" onClick={onNext}>{nextLabel} <ArrowRight size={15} /></button>}
    </div>
  );
}
