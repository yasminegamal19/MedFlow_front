import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { PageShell } from "../../components/PageShell.jsx";
import { Field } from "../../components/Field.jsx";
import { Card } from "../../components/Card.jsx";
import { SectionLabel } from "../../components/SectionLabel.jsx";
import { SummaryCard, SummaryRow } from "../../components/SummaryCard.jsx";
import { StatusPillSmall } from "../../components/StatusPillSmall.jsx";
import { PageNav } from "../../components/PageNav.jsx";
import { ReasonSelect } from "../../components/ReasonSelect.jsx";
import { getCaseReferralRouting, submitCaseReferralRouting } from "../../lib/api.js";
import {
  ZONES, PROGRAM_CONTACTS as STATIC_PROGRAM_CONTACTS, NON_URGENT_ADVICE_ZONES,
  ENTRY_DOORS as STATIC_ENTRY_DOORS, CLINICAL_PATHWAYS as STATIC_CLINICAL_PATHWAYS,
  EMERGENCY_INDICATIONS as STATIC_EMERGENCY_INDICATIONS, URGENT_INDICATIONS as STATIC_URGENT_INDICATIONS,
  ALL_REASONS as STATIC_ALL_REASONS, REASON_GROUPS as STATIC_REASON_GROUPS,
} from "../../data/referralPathwayCatalog.js";

/* ── Stage 3b: Referral routing (full Alberta pathway catalog) ─────────── */

// A destination string's tone for the summary pill — a light heuristic
// over the catalog's free-text destinations, not a separate data field.
function destinationTone(text) {
  if (!text) return "amber";
  if (/neurosurg|oncology|—$/i.test(text)) return "clay";
  if (/zone fast team/i.test(text) && !/hand → plastic|wrist →/i.test(text)) return "sage";
  return "amber";
}

// Reshapes the backend catalog (GET /referral-routing/catalog) into the
// exact field names the rest of this component uses — the same shape as
// the static referralPathwayCatalog.js fallback, so the JSX below never
// needs to know which source it came from.
function normalizeReferralCatalog(raw) {
  if (!raw) {
    return {
      entryDoors: STATIC_ENTRY_DOORS,
      programContacts: STATIC_PROGRAM_CONTACTS,
      nonUrgentAdviceZones: NON_URGENT_ADVICE_ZONES,
      clinicalPathways: STATIC_CLINICAL_PATHWAYS,
      emergencyIndications: STATIC_EMERGENCY_INDICATIONS,
      urgentIndications: STATIC_URGENT_INDICATIONS,
      reasons: STATIC_ALL_REASONS,
      reasonGroups: STATIC_REASON_GROUPS,
    };
  }
  const programContacts = {};
  const nonUrgentAdviceZones = [];
  for (const [zone, c] of Object.entries(raw.program_contacts || {})) {
    programContacts[zone] = { raapid: c.raapid, fast: c.fast, nonUrgentAdvice: c.non_urgent_advice };
    if (c.non_urgent_advice) nonUrgentAdviceZones.push(zone);
  }
  const emergencyIndications = {};
  const urgentIndications = {};
  for (const pathway of ["ortho", "plastic"]) {
    const e = raw.urgent_indications?.[pathway]?.emergency;
    const u = raw.urgent_indications?.[pathway]?.urgent;
    if (e) emergencyIndications[pathway] = { examples: e.examples, action: e.action_text };
    if (u) urgentIndications[pathway] = { examples: u.examples, zoneRouting: u.zone_routing };
  }
  return {
    entryDoors: (raw.entry_doors || []).map((d) => ({ id: d.code, label: d.label, sub: d.description })),
    programContacts,
    nonUrgentAdviceZones,
    clinicalPathways: raw.clinical_pathways || [],
    emergencyIndications,
    urgentIndications,
    reasons: (raw.reasons || []).map((r) => ({
      id: r.id,
      pathway: r.pathway,
      group: r.group_name,
      label: r.label,
      process: r.zone_process,
      wcb: Boolean(r.wcb_required),
      bypass: Boolean(r.is_bypass),
      urgent: Boolean(r.is_urgent),
      weeks: r.acute_weeks,
      fundingNote: r.funding_note,
      sourceConflict: r.source_conflict_note,
      notes: r.notes,
      imaging: r.imaging_items ? { timeframe: r.imaging_timeframe, items: r.imaging_items, notes: r.imaging_notes } : null,
    })),
    reasonGroups: raw.reason_groups || [],
  };
}

export function PageReferralRouting({ catalog, caseId, onNext, onBack }) {
  const data = useMemo(() => normalizeReferralCatalog(catalog), [catalog]);

  const [door, setDoor] = useState(""); // entry door id
  const [urgentPathway, setUrgentPathway] = useState(""); // "ortho" | "plastic" — for emergency/urgent doors
  const [urgentZone, setUrgentZone] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [zone, setZone] = useState("");
  const [wcbStatus, setWcbStatus] = useState(null); // "yes" | "no" | null

  // Prefill from this case's previously saved decision, if any — GET
  // /cases/{id}/referral-routing. Only runs once the real catalog (with
  // real reason UUIDs) has loaded, and only if nothing's been picked yet.
  useEffect(() => {
    if (!caseId || !catalog || door) return;
    getCaseReferralRouting(caseId).then((saved) => {
      if (!saved) return;
      setDoor(saved.door_code || "");
      if (saved.urgent_pathway) setUrgentPathway(saved.urgent_pathway);
      if (saved.door_code === "urgent") setUrgentZone(saved.zone || "");
      else setZone(saved.zone || "");
      if (saved.reason_id) setReasonId(saved.reason_id);
      if (saved.wcb_status) setWcbStatus(saved.wcb_status);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, catalog]);

  const reason = data.reasons.find((r) => r.id === reasonId) || null;
  const destination = reason && !reason.bypass && !reason.urgent && zone ? reason.process[zone] : null;
  const isEdmonton = zone === "Edmonton";
  const needsWcb = Boolean(reason && reason.wcb && zone);

  const pickReason = (id) => { setReasonId(id); setZone(""); setWcbStatus(null); };
  const pickZone = (z) => { setZone(z); setWcbStatus(null); };

  const referralDone = Boolean(reason) && (
    reason.bypass
      ? true
      : reason.urgent
        ? Boolean(zone)
        : Boolean(zone && destination && (!reason.wcb || wcbStatus))
  );
  const canContinue = door === "emergency" ? Boolean(urgentPathway)
    : door === "urgent" ? Boolean(urgentPathway && urgentZone)
    : door === "clinical_pathway" ? true
    : door === "non_urgent_advice" ? true
    : door === "non_urgent_referral" ? referralDone
    : false;

  // The "action" behind Continue — persists the decision to
  // POST /cases/{id}/referral-routing. Best-effort: a failed save (offline,
  // or a static-fallback reason id that isn't a real UUID) never blocks
  // moving on, the same way runValidation() doesn't block Clinical
  // Assessment's Next button.
  const handleContinue = () => {
    if (caseId) {
      submitCaseReferralRouting(caseId, {
        door_code: door,
        urgent_pathway: (door === "emergency" || door === "urgent") ? (urgentPathway || null) : null,
        reason_id: door === "non_urgent_referral" && reason && !reason.bypass && !reason.urgent ? reason.id : null,
        zone: door === "urgent" ? (urgentZone || null) : (door === "non_urgent_referral" ? (zone || null) : null),
        wcb_status: wcbStatus,
        destination: destination || null,
      }).catch(() => {});
    }
    onNext();
  };

  return (
    <PageShell title="Referral routing"
      subhead="Every entry door and reason-for-referral row from Alberta's provincial Orthopedic & Spine and Plastic Surgery pathway PDFs — pick the door, then (for a non-urgent referral) the specific reason; the reason alone determines the zone routing, imaging and WCB requirement. Nothing here is a clinical decision.">
      <div className="mf-two-col">
        <div>
          <Field label="Entry door">
            <div className="mf-choice-row" style={{ flexWrap: "wrap" }}>
              {data.entryDoors.map((d) => (
                <button key={d.id} type="button" className={`mf-choice${door === d.id ? " active" : ""}`}
                  style={{ flex: "1 1 200px" }}
                  onClick={() => { setDoor(d.id); setUrgentPathway(""); setUrgentZone(""); setReasonId(""); setZone(""); setWcbStatus(null); }}>
                  <div className="mf-choice-title">{d.label}</div>
                  <div className="mf-choice-sub">{d.sub}</div>
                </button>
              ))}
            </div>
          </Field>

          {(door === "emergency" || door === "urgent") && (
            <>
              <Field label="Pathway">
                <div className="mf-channel-row">
                  {["ortho", "plastic"].map((p) => (
                    <button key={p} type="button" className={`mf-channel-btn${urgentPathway === p ? " active" : ""}`}
                      onClick={() => { setUrgentPathway(p); setUrgentZone(""); }}>
                      {p === "ortho" ? "Orthopedic & Spine" : "Plastic Surgery"}
                    </button>
                  ))}
                </div>
              </Field>

              {door === "emergency" && urgentPathway && (
                <div className="mf-verdict mf-verdict-gap">
                  <AlertTriangle size={16} />
                  <div>
                    <div>{data.emergencyIndications[urgentPathway].action}</div>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7 }}>
                      {data.emergencyIndications[urgentPathway].examples.map((ex) => <li key={ex}>{ex}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {door === "urgent" && urgentPathway && (
                <>
                  <div className="mf-info-strip" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <span>Indications ({urgentPathway === "ortho" ? "within 4 weeks" : "within 2 weeks"} of injury):</span>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7 }}>
                      {data.urgentIndications[urgentPathway].examples.map((ex) => <li key={ex}>{ex}</li>)}
                    </ul>
                  </div>
                  <Field label="Zone">
                    <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
                      {ZONES.map((z) => (
                        <button key={z} type="button" className={`mf-channel-btn${urgentZone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }} onClick={() => setUrgentZone(z)}>
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {urgentZone && (
                    <div className="mf-verdict mf-verdict-gap">
                      <Info size={16} />
                      <span>{data.urgentIndications[urgentPathway].zoneRouting[urgentZone]}</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {door === "clinical_pathway" && (
            <Card>
              <p className="mf-tiny-note" style={{ marginBottom: 8 }}>
                A written clinical pathway may exist for this condition — review it for care-option guidance before deciding whether to refer.
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.8 }}>
                {data.clinicalPathways.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </Card>
          )}

          {door === "non_urgent_advice" && (
            <div className="mf-verdict mf-verdict-gap">
              <Info size={16} />
              <div>
                <div>eConsult via Alberta Netcare (all zones, response within 5 calendar days) — for hand/wrist advice specifically, provided by orthopedic surgeons.</div>
                <div style={{ marginTop: 6 }}>
                  ConnectMD phone advice — <b>{data.nonUrgentAdviceZones.join(" & ")} Zones only</b>: {data.programContacts.Edmonton?.nonUrgentAdvice}.
                </div>
              </div>
            </div>
          )}

          {door === "non_urgent_referral" && (
            <>
              <Field label="Reason for referral">
                <ReasonSelect value={reasonId} onChange={pickReason} groups={data.reasonGroups} reasons={data.reasons} />
              </Field>

              {reason?.bypass && (
                <div className="mf-verdict mf-verdict-gap">
                  <Info size={16} />
                  <span>{reason.fundingNote}</span>
                </div>
              )}

              {reason?.urgent && (
                <>
                  <div className="mf-verdict mf-verdict-gap">
                    <AlertTriangle size={16} />
                    <span>Acute injury — {reason.weeks}-week window. {reason.notes?.join(" ")}</span>
                  </div>
                  <Field label="Zone">
                    <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
                      {ZONES.map((z) => (
                        <button key={z} type="button" className={`mf-channel-btn${zone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }} onClick={() => pickZone(z)}>
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {zone && (
                    <div className="mf-info-strip">
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{data.programContacts[zone]?.raapid}</span>
                    </div>
                  )}
                </>
              )}

              {reason && !reason.bypass && !reason.urgent && (
                <>
                  <Field label="Zone">
                    <div className="mf-channel-row" style={{ flexWrap: "wrap" }}>
                      {ZONES.map((z) => (
                        <button key={z} type="button" className={`mf-channel-btn${zone === z ? " active" : ""}`}
                          style={{ flex: "1 1 100px" }} onClick={() => pickZone(z)}>
                          {z}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {reason.sourceConflict && (
                    <div className="mf-verdict mf-verdict-gap">
                      <AlertTriangle size={16} />
                      <span>{reason.sourceConflict}</span>
                    </div>
                  )}

                  {reason.fundingNote && (
                    <div className="mf-info-strip">
                      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{reason.fundingNote}</span>
                    </div>
                  )}

                  {needsWcb && (
                    <Field label={isEdmonton
                      ? "Edmonton Zone — WCB claim related? (must be stated explicitly on the referral letter)"
                      : "Confirm WCB status"}>
                      {!isEdmonton && (
                        <p className="mf-tiny-note" style={{ marginBottom: 6 }}>
                          A referral requires confirming the patient does not qualify for expedited surgery through WCB — WCB patients may or may not be accepted through FAST depending on the zone's surgeon practices.
                        </p>
                      )}
                      <div className="mf-choice-row">
                        <button type="button" className={`mf-choice${wcbStatus === "yes" ? " active" : ""}`} onClick={() => setWcbStatus("yes")}>
                          <div className="mf-choice-title">Yes</div>
                        </button>
                        <button type="button" className={`mf-choice${wcbStatus === "no" ? " active" : ""}`} onClick={() => setWcbStatus("no")}>
                          <div className="mf-choice-title">No</div>
                        </button>
                      </div>
                      {!wcbStatus && <p className="mf-error">WCB status must be confirmed before this referral can be submitted.</p>}
                    </Field>
                  )}

                  {reason.notes && (
                    <div className="mf-info-strip" style={{ flexDirection: "column", alignItems: "stretch" }}>
                      {reason.notes.map((n) => <span key={n}>{n}</span>)}
                    </div>
                  )}

                  {reason.imaging && (
                    <>
                      <SectionLabel>Required imaging / investigations{reason.imaging.timeframe ? ` — ${reason.imaging.timeframe}` : ""}</SectionLabel>
                      <Card>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-soft)" }}>
                          {reason.imaging.items.map((i) => <li key={i}>{i}</li>)}
                        </ul>
                      </Card>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <SummaryCard title="Routing result">
          <SummaryRow k="Door" v={data.entryDoors.find((d) => d.id === door)?.label || "—"} />
          {(door === "emergency" || door === "urgent") && (
            <SummaryRow k="Pathway" v={urgentPathway ? (urgentPathway === "ortho" ? "Orthopedic & Spine" : "Plastic Surgery") : "—"} />
          )}
          {door === "urgent" && <SummaryRow k="Zone" v={urgentZone || "—"} />}
          {door === "non_urgent_referral" && (
            <>
              <SummaryRow k="Reason" v={reason?.label || "—"} />
              {reason && !reason.bypass && !reason.urgent && (
                <>
                  <SummaryRow k="Zone" v={zone || "—"} />
                  <SummaryRow k="Destination" v={destination ? <StatusPillSmall color={destinationTone(destination)}>{destination}</StatusPillSmall> : "—"} />
                  {needsWcb && <SummaryRow k="WCB" v={wcbStatus ? wcbStatus.toUpperCase() : "Not confirmed"} />}
                </>
              )}
              {reason?.bypass && <SummaryRow k="Route" v="Direct to surgeon — no FAST" />}
              {reason?.urgent && <SummaryRow k="Window" v={`${reason.weeks} weeks`} />}
            </>
          )}
        </SummaryCard>
      </div>

      <PageNav onBack={onBack} onNext={canContinue ? handleContinue : undefined} nextLabel="Continue to validation & rules" />
    </PageShell>
  );
}
