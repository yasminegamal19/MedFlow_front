import { useState } from "react";
import { ChevronDown, ArrowRight } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { PrincipleBanner } from "../../components/PrincipleBanner.jsx";
import { Field } from "../../components/Field.jsx";
import { SummaryCard, SummaryRow } from "../../components/SummaryCard.jsx";
import { StatusPillSmall } from "../../components/StatusPillSmall.jsx";
import { PageNav } from "../../components/PageNav.jsx";

/* ── Stage 1a: Patient ──────────────────────────────────────────────────── */

export function PagePatient({ patient, setPatient, onNext }) {
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setPatient((p) => ({ ...p, [k]: e.target.value }));
  const nameValid = patient.firstName.trim() && patient.lastName.trim();
  const dobValid = patient.dob.trim().length > 0;
  const canContinue = nameValid && dobValid;
  const submit = () => { setTouched(true); if (canContinue) onNext(); };
  const age = (() => {
    const d = new Date(patient.dob);
    if (Number.isNaN(d.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
    return a;
  })();

  return (
    <PageShell title="Patient information"
      subhead="Core demographics and coverage. This travels with the case through extraction, the rules engine, and the referral letter — the AI never invents it.">
      <PrincipleBanner />
      <div className="mf-two-col">
        <div>
          <Field label="Patient name">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="First name" value={patient.firstName} onChange={set("firstName")} />
              <input className="mf-input" placeholder="Last name" value={patient.lastName} onChange={set("lastName")} />
            </div>
            {touched && !nameValid && <p className="mf-error">Enter the patient's first and last name.</p>}
          </Field>
          <Field label="Date of birth">
            <div className="mf-input-grid">
              <input className="mf-input" type="date" value={patient.dob} onChange={set("dob")} />
              <div className="mf-select-wrap">
                <select className="mf-select" value={patient.sex} onChange={set("sex")}>
                  <option value="female">Female</option><option value="male">Male</option>
                  <option value="other">Other</option><option value="unknown">Unknown</option>
                </select>
                <ChevronDown size={16} className="mf-select-icon" />
              </div>
            </div>
            {touched && !dobValid && <p className="mf-error">Date of birth is required.</p>}
          </Field>
          <Field label="Medical record number (MRN)">
            <input className="mf-input" value={patient.mrn} onChange={set("mrn")} />
          </Field>
          <Field label="Contact">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="Phone" value={patient.phone} onChange={set("phone")} />
              <input className="mf-input" type="email" placeholder="Email" value={patient.email} onChange={set("email")} />
            </div>
            <input className="mf-input" style={{ marginTop: 10 }} placeholder="Home address" value={patient.address} onChange={set("address")} />
          </Field>
          <Field label="Insurance">
            <div className="mf-input-grid">
              <input className="mf-input" placeholder="Payer / plan" value={patient.payer} onChange={set("payer")} />
              <input className="mf-input" placeholder="Member ID" value={patient.memberId} onChange={set("memberId")} />
            </div>
          </Field>
          <Field label="Referring / primary care physician">
            <input className="mf-input" value={patient.pcp} onChange={set("pcp")} />
          </Field>
        </div>
        <SummaryCard title="Patient">
          <SummaryRow k="Name" v={nameValid ? `${patient.firstName} ${patient.lastName}` : "Not entered"} />
          <SummaryRow k="Age" v={age != null ? `${age} yrs` : "—"} />
          <SummaryRow k="Sex" v={patient.sex ? patient.sex[0].toUpperCase() + patient.sex.slice(1) : "—"} />
          <SummaryRow k="MRN" v={patient.mrn || "—"} />
          <SummaryRow k="Payer" v={patient.payer || "—"} />
          <SummaryRow k="Status" v={<StatusPillSmall color="amber">Draft</StatusPillSmall>} />
          <button className="mf-primary-btn full" disabled={!canContinue} onClick={submit}>
            Continue to case intake <ArrowRight size={15} />
          </button>
          <p className="mf-tiny-note">Editable any time before the referral is sent.</p>
        </SummaryCard>
      </div>
      <PageNav onNext={submit} nextLabel="Continue to case intake" />
    </PageShell>
  );
}
