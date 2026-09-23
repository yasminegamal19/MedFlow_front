/* ────────────────────────────────────────────────────────────────────────
   Full Alberta referral-pathway catalog — every entry door and every
   "reason for referral" row from both source PDFs:
     docs/pathways/referral-pathways/Provincial adult orthopedic and spine
     referral pathway.pdf (updated 2026-07-07) and .../Provincial adult
     plastic surgery referral pathway.pdf (updated 2026-01-20).

   This replaces the earlier category/body-region abstraction: the PDFs are
   really organized by ~75 independent "reason for referral" rows, each
   fully determining its own zone routing, imaging, WCB and funding notes —
   not by a clean category × zone matrix. Where the two PDFs cover the same
   Hand & Wrist condition with different South Zone detail, both are noted
   rather than silently reconciled (see `southNote` / `sourceConflict`).
──────────────────────────────────────────────────────────────────────── */

export const ZONES = ["North", "Edmonton", "Central", "Calgary", "South"];

export const PROGRAM_CONTACTS = {
  North: { raapid: "RAAPID North — 1-800-282-9911", fast: "North Zone FAST Team — 1-833-553-3278 ext. 1, fax 1-833-627-7025" },
  Edmonton: { raapid: "RAAPID North — 1-800-282-9911", fast: "Edmonton Zone FAST Team — 1-833-553-3278 ext. 2 (Ortho fax: elbow/hand/wrist 780-643-1235, other 780-670-3221 · Plastic fax: 780-644-1743)", nonUrgentAdvice: "ConnectMD — 1-844-633-2263 (pcnconnectmd.com)" },
  Central: { raapid: "RAAPID North (north of Red Deer) — 1-800-282-9911, or RAAPID South (Red Deer & south) — 1-800-661-1700", fast: "Central Zone FAST Team — 1-833-553-3278 ext. 3, fax 1-833-627-7022" },
  Calgary: { raapid: "RAAPID South — 1-800-661-1700", fast: "Calgary Zone FAST Team — 1-833-553-3278 ext. 4, fax 1-833-627-7023" },
  South: { raapid: "RAAPID South — 1-800-661-1700", fast: "South Zone FAST Team (Ortho only) — 1-833-553-3278 ext. 5, fax 1-833-627-7024. Plastic Surgery has no South Zone FAST Team — use the Alberta Referral Directory." },
};

// North & Edmonton Zones only (per the Program Contacts pages of both PDFs).
export const NON_URGENT_ADVICE_ZONES = ["North", "Edmonton"];

export const ENTRY_DOORS = [
  { id: "emergency", label: "Emergency Consultation", sub: "Patient needs to be seen immediately" },
  { id: "urgent", label: "Urgent Advice", sub: "Same-day intervention/diagnostics without hospitalization; not life-threatening" },
  { id: "clinical_pathway", label: "Review Clinical Pathway", sub: "Guidance on the referral process, if a pathway exists for this condition" },
  { id: "non_urgent_advice", label: "Non-Urgent Advice", sub: "Uncertain whether to submit a referral" },
  { id: "non_urgent_referral", label: "Non-Urgent Referral", sub: "Patient requires a non-urgent referral" },
];

export const CLINICAL_PATHWAYS = [
  "Carpal Tunnel Syndrome", "Hand and Wrist Soft Tissue Mass", "Trigger Finger", "Dupuytren's Disease",
  "Shoulder Assessment", "Soft Tissue Knee Assessment", "Spine: Low Back Assessment", "Knee Primary Care",
  "Diabetic Foot Care",
];

export const EMERGENCY_INDICATIONS = {
  ortho: {
    label: "Orthopedic & Spine",
    examples: [
      "Open fractures / fractures potentially requiring acute operative treatment (bimalleolar ankle #, markedly displaced wrist #, hip #, long bone #s, comminuted proximal humerus #)",
      "Suspected septic joints and orthopedic infections",
      "Irreducible acute joint dislocations",
      "Acute compartment syndrome",
      "Cauda equina or progressive neurologic deficit after injury",
    ],
    action: "Refer directly to the Emergency Department or call RAAPID.",
  },
  plastic: {
    label: "Plastic Surgery",
    examples: [
      "Avascular digit",
      "High-pressure injection injury",
      "Perilunate dislocation",
      "Any joint dislocation that is not reducible",
      "Numbness distal to a laceration (lacerated major nerve)",
      "Compartment syndrome",
      "Severe infection (suspected deep space hand infection, flexor tenosynovitis, necrotizing infection)",
    ],
    action: "Call RAAPID or send to the Emergency Department via 911 as appropriate.",
  },
};

export const URGENT_INDICATIONS = {
  ortho: {
    label: "Orthopedic & Spine",
    examples: [
      "Acute fractures within 4 weeks of injury",
      "Acute tendon ruptures and torn ligaments",
      "Dislocation",
      "Metastatic bone tumors including impending/acute pathologic fractures",
      "Severe infection (suspected deep space hand infection, flexor tenosynovitis, necrotizing infection)",
    ],
    zoneRouting: {
      North: "Call Surgeon on Call through RAAPID North.",
      Edmonton: "Hand & wrist: call Plastic Surgeon or Orthopedic Surgeon on Call through RAAPID North. All other: call the Orthopedic Consult Line through RAAPID North.",
      Central: "RAAPID North if north of Red Deer, RAAPID South if in/south of Red Deer.",
      Calgary: "Call Surgeon on Call through RAAPID South.",
      South: "Call Surgeon on Call to arrange an urgent consult.",
    },
  },
  plastic: {
    label: "Plastic Surgery",
    examples: [
      "Acute fractures within 2 weeks of injury",
      "Acute tendon ruptures and torn ligaments within 2 weeks",
      "Dislocation within 2 weeks",
      "Metastatic bone tumors including impending/acute pathologic fractures",
    ],
    zoneRouting: {
      North: "RAAPID North — 1-800-282-9911.",
      Edmonton: "RAAPID North — 1-800-282-9911.",
      Central: "RAAPID North or RAAPID South, as applicable.",
      Calgary: "RAAPID South — 1-800-661-1700.",
      South: "RAAPID South — 1-800-661-1700.",
    },
  },
};

function fastAll() {
  return { North: "Zone FAST Team", Edmonton: "Zone FAST Team", Central: "Zone FAST Team", Calgary: "Zone FAST Team", South: "Zone FAST Team" };
}
// Pattern D — Craniofacial / Soft Tissue & Skin / Breast: Calgary & Central FAST, everyone else "local".
function localExceptCalgaryCentral() {
  return { North: "Refer per current zonal referral practice", Edmonton: "Refer per current zonal referral practice", Central: "Zone FAST Team", Calgary: "Zone FAST Team", South: "Refer per current zonal referral practice" };
}
// Hand & Wrist base pattern: FAST everywhere except a South Zone override that varies by reason,
// with an Edmonton(+Calgary) collaborative Ortho+Plastics note baked into the destination text.
function handWristZones(south, collaborative = "EC") {
  const note = collaborative === "EC" ? " — collaborative Ortho + Plastic Surgery program"
    : collaborative === "E" ? " — collaborative Ortho + Plastic Surgery program (Edmonton only)"
    : "";
  return {
    North: "Zone FAST Team",
    Edmonton: "Zone FAST Team" + note,
    Central: "Zone FAST Team",
    Calgary: "Zone FAST Team" + (collaborative === "EC" ? note : ""),
    South: south,
  };
}
function spineNeuroZones() {
  return { North: "Zone FAST Team", Edmonton: "Local specialist (Alberta Referral Directory)", Central: "Zone FAST Team", Calgary: "Local specialist (Alberta Referral Directory)", South: "Zone FAST Team" };
}

// ── Orthopedic & Spine pathway reasons ─────────────────────────────────
export const ORTHO_REASONS = [
  // Shoulder
  { id: "o_shoulder_instability", pathway: "ortho", group: "Shoulder", label: "Instability", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Shoulder Girdle: AP (external rotation), AP oblique (Glenoid), Scapular Y, Axial", "Instability also needs: Stryker Notch + West Point views"] } },
  { id: "o_shoulder_stiffness", pathway: "ortho", group: "Shoulder", label: "Stiffness", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Shoulder Girdle: AP (external rotation), AP oblique (Glenoid), Scapular Y, Axial"] } },
  { id: "o_shoulder_pain", pathway: "ortho", group: "Shoulder", label: "Pain", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Shoulder Girdle: AP (external rotation), AP oblique (Glenoid), Scapular Y, Axial"] },
    notes: ["Central Zone: for suspected painful rotator cuff tear without significant osteoarthritis, shoulder ultrasound is recommended."] },
  { id: "o_shoulder_hardware", pathway: "ortho", group: "Shoulder", label: "Retained Orthopedic Hardware", process: fastAll(), wcb: false,
    notes: ["Direct to original surgeon if available."] },

  // Elbow
  { id: "o_elbow_arthritis", pathway: "ortho", group: "Elbow", label: "Arthritis", process: fastAll(), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-rays of the affected elbow: AP, Lateral"] } },
  { id: "o_elbow_nondegenerative", pathway: "ortho", group: "Elbow", label: "Non-Degenerative Joint Pathology (loose bodies, OCD)", process: fastAll(), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-rays: AP, Lateral", "CT scan (ordered)", "Specify locking if referring for medial/lateral elbow pain"] } },
  { id: "o_elbow_soft_tissue_pain", pathway: "ortho", group: "Elbow", label: "Chronic Soft Tissue Pain (epicondylosis)", process: fastAll(), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-rays: AP, Lateral", "Electrodiagnostic study if associated with hand numbness"] },
    notes: ["Refer to Zone FAST only if pain > 1 year. Calgary: consider non-surgical assessment first. Avoid cortisone injection for lateral/medial epicondylosis; try physiotherapy for 6 months first."] },
  { id: "o_elbow_entrapment", pathway: "ortho", group: "Elbow", label: "Entrapment Neuropathies of Upper Limb (median/radial/ulnar)", process: fastAll(), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-rays: AP, Lateral", "Electrodiagnostic study (ordered)", "Specify if wasting/weakness present"] },
    notes: ["A collaborative program exists between Orthopedic and Plastic Surgery in the Edmonton Zone only (not Calgary)."] },
  { id: "o_elbow_mass", pathway: "ortho", group: "Elbow", label: "Mass (Tumor or Lump)", process: fastAll(), wcb: false,
    notes: ["Suspected/proven malignancy or aggressive tumor (sarcoma): see MSK Oncology instead.", "Lethbridge accepts all reasons for referral — send to Zone FAST Team."] },
  { id: "o_elbow_bursitis", pathway: "ortho", group: "Elbow", label: "Olecranon Bursitis (incl. gouty tophi)", process: fastAll(), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-rays: AP, Lateral"] },
    notes: ["Refer only if not resolved with 1 year conservative management. For gouty tophi, maximize medical gout management first."] },

  // Hip
  { id: "o_hip_arthritis", pathway: "ortho", group: "Hip", label: "Arthritis (incl. rheumatoid/inflammatory)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] },
    notes: ["Choosing Wisely: don't order hip MRI when X-rays already show OA and symptoms fit."] },
  { id: "o_hip_arthroplasty", pathway: "ortho", group: "Hip", label: "Symptomatic Hip Arthroplasty", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] } },
  { id: "o_hip_pain_no_oa", pathway: "ortho", group: "Hip", label: "Pain (without osteoarthritis)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] },
    notes: ["MRI not required if X-rays are normal."] },
  { id: "o_hip_impingement", pathway: "ortho", group: "Hip", label: "Hip Impingement (FAI)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] } },
  { id: "o_hip_dysplasia", pathway: "ortho", group: "Hip", label: "Congenital Hip Dysplasia (without OA)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] } },
  { id: "o_hip_deformity", pathway: "ortho", group: "Hip", label: "Bone Deformity Other (length inequality, rotational)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] } },
  { id: "o_hip_avn", pathway: "ortho", group: "Hip", label: "Avascular Necrosis (without OA)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] } },
  { id: "o_hip_synovial", pathway: "ortho", group: "Hip", label: "Synovial Disorder (PVNS, osteochondromatosis)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing AP pelvis, AP hip, Lateral (Lauenstein)"] },
    notes: ["Suspected/proven malignancy: see MSK Oncology instead."] },
  { id: "o_hip_residual_childhood", pathway: "ortho", group: "Hip", label: "Hip Disorder, Residual Childhood (Perthes, SCFE)", process: fastAll(), wcb: false },
  { id: "o_hip_hardware", pathway: "ortho", group: "Hip", label: "Retained Orthopedic Hardware", process: fastAll(), wcb: false,
    notes: ["Direct to original surgeon if available."] },

  // Knee
  { id: "o_knee_arthritis", pathway: "ortho", group: "Knee", label: "Arthritis (incl. inflammatory arthropathy)", process: fastAll(), wcb: true,
    imaging: { timeframe: "6 months", items: ["Weight-bearing bilateral AP/PA, Rosenberg 45° PA, Lateral, Skyline", "Unable to weight-bear: routine protocol + tunnel view"] },
    notes: ["Choosing Wisely: don't order knee MRI when weight-bearing X-rays already show OA."] },
  { id: "o_knee_pain_no_oa", pathway: "ortho", group: "Knee", label: "Pain (without osteoarthritis)", process: fastAll(), wcb: false,
    notes: ["Knee ultrasound not generally recommended unless confirming a tendon rupture."] },
  { id: "o_knee_instability", pathway: "ortho", group: "Knee", label: "Instability", process: fastAll(), wcb: false },
  { id: "o_knee_mechanical", pathway: "ortho", group: "Knee", label: "Mechanical Symptoms (locking, catching, swelling, effusion)", process: fastAll(), wcb: false },
  { id: "o_knee_hardware", pathway: "ortho", group: "Knee", label: "Retained Orthopedic Hardware", process: fastAll(), wcb: false,
    notes: ["Direct to original surgeon if available."] },

  // Foot & Ankle
  { id: "o_foot_ankle", pathway: "ortho", group: "Foot & Ankle", label: "Pain / Instability / Swelling / Deformity / Ulcer", process: fastAll(), wcb: true,
    imaging: { timeframe: "3 months", items: ["Bilateral weight-bearing foot + ankle X-rays", "Foot: AP Axial, Lateral", "Ankle: AP, AP Oblique 15°-20°, Lateral", "Add HbA1c if diabetic"] } },

  // Spine
  { id: "o_spine_radiculopathy", pathway: "ortho", group: "Spine", label: "Radiculopathy (cervical or lumbar)", process: spineNeuroZones(), wcb: true,
    imaging: { timeframe: "12 months", items: ["MRI required only for direct surgical consideration (not for general Spine Assessment & Management)", "Previous spinal surgery: gadolinium-enhanced scans suggested"] },
    notes: ["Oblique/flexion-extension X-rays and routine CT not recommended unless MRI contraindicated."] },
  { id: "o_spine_myelopathy", pathway: "ortho", group: "Spine", label: "Myelopathy (cervical or thoracic)", process: spineNeuroZones(), wcb: false },
  { id: "o_spine_claudication", pathway: "ortho", group: "Spine", label: "Neurogenic Claudication", process: spineNeuroZones(), wcb: false },
  { id: "o_spine_deformity", pathway: "ortho", group: "Spine", label: "Spinal Deformity (incl. scoliosis)", process: spineNeuroZones(), wcb: false,
    imaging: { timeframe: "12 months", items: ["Scoliosis AP/lateral X-ray (must be from an AHS facility)", "If neuro symptoms also present, MRI strongly recommended"] } },
  { id: "o_spine_neck_pain", pathway: "ortho", group: "Spine", label: "Neck Pain (no neuro symptoms/referred pain)", process: spineNeuroZones(), wcb: true,
    imaging: { timeframe: "12 months", items: ["Upright/standing cervical spine X-ray strongly suggested"] },
    notes: ["Consider non-surgical specialist assessment first (physiatry, sport medicine)."] },
  { id: "o_spine_back_pain", pathway: "ortho", group: "Spine", label: "Back Pain (no neuro symptoms/referred pain)", process: spineNeuroZones(), wcb: true,
    imaging: { timeframe: "12 months", items: ["Upright/standing thoracic/lumbar spine X-ray strongly suggested", "MRI may be considered if pain refractory and discogenic"] } },
  { id: "o_spine_intradural", pathway: "ortho", group: "Spine", label: "Intradural Pathologies (tumors, tethered cord, Chiari, vascular malformation)", process: { North: "Local specialist (Alberta Referral Directory)", Edmonton: "Local specialist (Alberta Referral Directory)", Central: "Local specialist (Alberta Referral Directory)", Calgary: "Local specialist (Alberta Referral Directory)", South: "Local specialist (Alberta Referral Directory)" }, wcb: false,
    notes: ["Seen by Spine Neurosurgery, not Orthopedics — bypasses the Zone FAST Team entirely.", "Acute neurological symptoms: consult the Neurosurgeon on call in Calgary or Edmonton."] },

  // MSK Oncology
  { id: "o_msk_soft_tissue_mass", pathway: "ortho", group: "MSK Oncology", label: "Soft Tissue Mass (suspected/confirmed malignancy)", process: fastAll(), wcb: false,
    imaging: { timeframe: "urgent", items: ["Small (<1cm) & superficial: biopsy or selective MRI", "Deep, large (>1cm) or rapid growth: urgent MRI"] },
    notes: ["Urgent MRI should be accompanied by a phone call to radiology to expedite."] },
  { id: "o_msk_bone_lesion", pathway: "ortho", group: "MSK Oncology", label: "Lesion of Bone", process: fastAll(), wcb: false,
    imaging: { timeframe: "urgent", items: ["Plain radiographs of entire bone", "Aggressive lesion & age ≥40: CT chest/abdomen/pelvis + bone scan + SPEP/PSA(male)", "Aggressive lesion & age <40: urgent CT or MRI"] } },
  { id: "o_msk_synovial_mass", pathway: "ortho", group: "MSK Oncology", label: "Synovial Mass (PVNS, osteochondromatosis)", process: fastAll(), wcb: false,
    imaging: { timeframe: "n/a", items: ["MRI results"] } },

  // Hand & Wrist
  { id: "hw_arthritis_hand", pathway: "both", group: "Hand & Wrist", label: "Arthritis of Hand", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area", "Specify previous treatments (e.g. injections)"] } },
  { id: "hw_arthritis_wrist", pathway: "both", group: "Hand & Wrist", label: "Arthritis of Wrist", process: handWristZones("South Zone: Zone FAST Team (orthopedic surgery)."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area", "Specify previous treatments (e.g. injections)"] } },
  { id: "hw_hand_pain", pathway: "both", group: "Hand & Wrist", label: "Hand Pain", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area", "Specify location (thumb/metacarpal/phalangeal) and chronicity"] } },
  { id: "hw_wrist_pain", pathway: "both", group: "Hand & Wrist", label: "Wrist Pain", process: handWristZones("South Zone: Zone FAST Team (orthopedic surgery)."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area", "Specify location (radial/central/ulnar, dorsal/volar) and chronicity"] } },
  { id: "hw_ligament_wrist", pathway: "both", group: "Hand & Wrist", label: "Ligament Pathologies of Wrist (scapholunate, TFCC/DRUJ instability)", process: handWristZones("South Zone: Zone FAST Team (orthopedic surgery)."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area", "Scapholunate: also order bilateral clenched-fist view"] } },
  { id: "hw_ligament_hand", pathway: "both", group: "Hand & Wrist", label: "Ligament Pathologies of Hand (chronic UCL/thumb ligament tear)", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area"] } },
  { id: "hw_deformity", pathway: "both", group: "Hand & Wrist", label: "Deformity — Hand or Wrist (mallet/jersey finger, boutonniere)", process: handWristZones("South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team."), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of the affected area"] },
    notes: ["Central: if related to an acute rupture of deformity, contact the Plastic Surgeon on call."] },
  { id: "hw_cts", pathway: "both", group: "Hand & Wrist", label: "Carpal Tunnel Syndrome", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { items: ["Description of symptom onset/duration", "Specify atrophy/weakness (impacts triage)", "Functional status limitations, treatments tried", "Electrodiagnostic study is NOT required — a quality referral letter matters more (this is the one exception)"] },
    sourceConflict: "The Orthopedic & Spine PDF gives a South Zone town split (Lethbridge → Plastic Surgery; Medicine Hat → FAST or Plastic Surgery). The Plastic Surgery PDF instead says simply \"South Zone: refer direct to plastic surgery per current zonal practice\" with no town split for this same condition. Both sources are shown because they disagree." },
  { id: "hw_median_nerve", pathway: "both", group: "Hand & Wrist", label: "Median Nerve Entrapment (other than CTS — Pronator/Lacertus Syndrome)", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["Electrodiagnostic study results required (impacts triage)", "Specify wasting/weakness"] },
    sourceConflict: "The Orthopedic & Spine PDF gives a South Zone town split (Lethbridge → Plastic for Hand/Finger, FAST for Wrist; Medicine Hat → Plastic Surgery). The Plastic Surgery PDF says simply \"refer direct to plastic surgery per current zonal practice\" with no split." },
  { id: "hw_radial_nerve", pathway: "both", group: "Hand & Wrist", label: "Radial Nerve Entrapment (Radial Tunnel, PIN Compression, Wartenberg's)", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["Electrodiagnostic study results required (impacts triage)", "Specify wasting/weakness"] },
    sourceConflict: "Same North/Edmonton/Central/Calgary process as Median Nerve Entrapment above; South Zone town-level detail is only given for Median in the Ortho PDF." },
  { id: "hw_ulnar_nerve", pathway: "both", group: "Hand & Wrist", label: "Ulnar Nerve Entrapment (Cubital Tunnel, Guyon's Syndrome)", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice."), wcb: true,
    imaging: { timeframe: "12 months", items: ["Electrodiagnostic study results required (impacts triage)", "Specify wasting/weakness", "If loss of motion at elbow: X-ray of affected elbow within 12 months"] } },
  { id: "hw_tendon", pathway: "both", group: "Hand & Wrist", label: "Tendon Pathologies — Hand or Wrist (tendonitis, tear, tenosynovitis, De Quervain's)", process: handWristZones("South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team."), wcb: true,
    imaging: { timeframe: "12 months", items: ["Ultrasound if suspecting tear/instability", "Specify number of cortisone injections tried"] } },
  { id: "hw_cyst", pathway: "both", group: "Hand & Wrist", label: "Cyst of Hand or Wrist (e.g. ganglion cyst)", process: handWristZones("South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team."), wcb: true,
    imaging: { timeframe: "n/a", items: ["Trial of 3 aspirations (or reason unable/inappropriate)", "X-ray of affected joint", "Ultrasound if uncertain cystic vs. solid"] } },
  { id: "hw_mass_benign", pathway: "both", group: "Hand & Wrist", label: "Mass of Hand or Wrist — suspected benign (solid, significant symptoms)", process: handWristZones("South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team."), wcb: true,
    imaging: { items: ["Imaging demonstrating solid mass", "MRI ordered"] },
    notes: ["Significant symptoms: severe pain, functional impairment, spontaneous fluid discharge, nail deformity, numbness/tingling."] },
  { id: "hw_mass_malignant", pathway: "both", group: "Hand & Wrist", label: "Mass of Hand or Wrist — suspected malignant", process: { North: "—", Edmonton: "Zone FAST Team", Central: "—", Calgary: "Orthopedic Oncology, Calgary (Alberta Referral Directory)", South: "—" }, wcb: false,
    imaging: { items: ["Urgent MRI results"] },
    notes: ["Only Calgary and Edmonton Zone Oncology are specified in either PDF for this reason — North/Central/South are not addressed."] },
  { id: "hw_dupuytrens", pathway: "both", group: "Hand & Wrist", label: "Dupuytren's Contracture", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice.", "E"), wcb: true,
    imaging: { items: ["Degree of contracture / tabletop test result", "Presence of tender nodules, work/life limitations"] },
    notes: ["Diagnostic ultrasound is not necessary.", "Central: if related to an acute rupture, contact the Plastic Surgeon on call."] },
  { id: "hw_trigger_finger", pathway: "both", group: "Hand & Wrist", label: "Trigger Finger", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice.", "E"), wcb: true,
    imaging: { items: ["Prior locking/triggering history; inability to extend even with passive extension", "Number of cortisone injections tried"] },
    notes: ["Diagnostic ultrasound is not necessary.", "A digit that cannot be manually unlocked is a priority referral — send through FAST.", "Consider up to 3 cortisone injections ~3 months apart, lifetime max 3."] },
  { id: "hw_rheumatoid", pathway: "both", group: "Hand & Wrist", label: "Rheumatoid Hand", process: handWristZones("South Zone: refer direct to Plastic Surgery per current zonal practice.", ""), wcb: true,
    imaging: { timeframe: "12 months", items: ["X-ray of affected area"] },
    notes: ["Refer to Rheumatology first to medically optimize before the surgical referral (Alberta Referral Directory)."] },

  // Acute Injury (Ortho & Spine — 4-week window)
  { id: "ai_o_fracture_lt4", pathway: "ortho", group: "Acute Injury", label: "Fracture (< 4 weeks)", process: null, urgent: true, weeks: 4,
    notes: ["Urgent referral — call Surgeon on Call through RAAPID per zone (hand & wrist in Edmonton: Plastic or Ortho Surgeon on call)."] },
  { id: "ai_o_fracture_gt4", pathway: "ortho", group: "Acute Injury", label: "Fracture (> 4 weeks)", process: fastAll(), wcb: true,
    imaging: { items: ["X-ray of affected body part or joint"] }, notes: ["Send to Zone FAST Team if patient is unattached to a surgeon."] },
  { id: "ai_o_tendon_lt4", pathway: "ortho", group: "Acute Injury", label: "Suspected Tendon Rupture (< 4 weeks)", process: null, urgent: true, weeks: 4,
    notes: ["Urgent referral by zone. Suspected rotator cuff/proximal biceps tendon rupture: Shoulder Assessment pathway. Suspected Achilles rupture: plantar flexion splint, non-weight-bearing."] },
  { id: "ai_o_tendon_gt4", pathway: "ortho", group: "Acute Injury", label: "Suspected Tendon Rupture (> 4 weeks)", process: fastAll(), wcb: true,
    imaging: { items: ["X-ray of affected body part or joint"] } },
  { id: "ai_o_ligament_hw", pathway: "ortho", group: "Acute Injury", label: "Acute Ligament Pathologies — Hand & Wrist", process: null, urgent: true, weeks: 4,
    notes: ["Urgent referral by zone. South: Plastic Surgeon on call / South Health Campus Hand for Hand/Finger, Ortho surgeon on call for Wrist."] },
  { id: "ai_o_dislocation", pathway: "ortho", group: "Acute Injury", label: "Dislocation (hip, tibio-femoral, elbow, wrist, ankle, subtalar)", process: null, urgent: true, weeks: 4,
    notes: ["Urgent referral by zone (hand & wrist in Edmonton: Plastic or Ortho Surgeon on call)."] },
  { id: "ai_o_impending_fracture", pathway: "ortho", group: "Acute Injury", label: "Impending Pathologic Fracture", process: null, urgent: true, weeks: 4,
    notes: ["Urgent referral by zone (hand & wrist in Edmonton: Plastic or Ortho Surgeon on call)."] },
];

// ── Plastic Surgery pathway reasons ─────────────────────────────────────
export const PLASTIC_REASONS = [
  // Craniofacial Head and Neck
  { id: "p_ear_deformity", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Ear Deformity", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_nasal_deformity", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Nasal Deformity (reconstruction, septoplasty, rhinoplasty)", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_orbital_deformity", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Bony Orbital Deformity", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["CT Facial Bones"] }, notes: ["Soft tissue/globe: refer to Ophthalmology via Alberta Referral Directory."] },
  { id: "p_deformity_after_injury", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Deformity After Injury", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Approximate date of injury, specify location", "CT Facial Bones"] } },
  { id: "p_skull_deformity", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Skull Deformity (incl. cranioplasty)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["CT Head"] } },
  { id: "p_eyelid_deformity", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Eyelid Deformity", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_excess_eyelid_skin", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Excess Eyelid Skin", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_eyelid_ptosis", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Eyelid Ptosis", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_facial_asymmetry", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Facial Asymmetry", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_facial_nerve_paralysis", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Facial Nerve Paralysis (palsy > 3 months)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Description of disease progression", "Imaging results if available"] } },
  { id: "p_craniofacial_implant", pathway: "plastic", group: "Craniofacial / Head & Neck", label: "Craniofacial Osseointegration Consultation (implant)", process: localExceptCalgaryCentral(), wcb: false },

  // Soft Tissue and Skin
  { id: "p_excess_abdominal_skin", pathway: "plastic", group: "Soft Tissue & Skin", label: "Excess Abdominal Skin (Panniculectomy)", process: localExceptCalgaryCentral(), wcb: false,
    fundingNote: "Publicly insured ONLY if the patient meets documented Panniculectomy Clinical Indications. If not met, the patient can contact a cosmetic plastic surgeon directly." },
  { id: "p_body_contouring", pathway: "plastic", group: "Soft Tissue & Skin", label: "Body Contouring After Massive Weight Loss (excl. abdomen)", process: null, bypass: true,
    fundingNote: "Contact the preferred surgeon directly — no FAST referral required. Coverage is a private conversation between patient and surgeon." },
  { id: "p_diabetic_foot_ulcer", pathway: "plastic", group: "Soft Tissue & Skin", label: "Diabetic Foot Ulcer", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Wound description (location, size, mechanism), duration, treatments tried", "Relevant imaging already completed", "Lower-limb vascular non-invasive studies if available"] } },
  { id: "p_pressure_ulcer", pathway: "plastic", group: "Soft Tissue & Skin", label: "Pressure Ulcer (Decubitus)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Wound description, duration, treatments tried"] } },
  { id: "p_chronic_wound", pathway: "plastic", group: "Soft Tissue & Skin", label: "Chronic (Non-Healing) Wound", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Wound description, duration, treatments tried"] }, notes: ["Exposed vital structure: call RAAPID instead."] },
  { id: "p_hidradenitis", pathway: "plastic", group: "Soft Tissue & Skin", label: "Hidradenitis Suppurativa", process: localExceptCalgaryCentral(), wcb: false,
    notes: ["Suggest dermatology assessment first, if available."] },
  { id: "p_hyperhidrosis", pathway: "plastic", group: "Soft Tissue & Skin", label: "Hyperhidrosis", process: null, bypass: true,
    fundingNote: "NOT publicly insured at all — refer to plastic surgery or any provider offering Botox injections for hyperhidrosis privately." },
  { id: "p_scar", pathway: "plastic", group: "Soft Tissue & Skin", label: "Scar (incl. hypertrophic)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Include functional disability if present"] } },
  { id: "p_keloid_scar", pathway: "plastic", group: "Soft Tissue & Skin", label: "Keloid Scar", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Include functional disability if present"] } },
  { id: "p_post_burn_deformity", pathway: "plastic", group: "Soft Tissue & Skin", label: "Post Burn Deformity", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Mechanism/date of injury, body part, functional disability if present"] } },
  { id: "p_lymphedema", pathway: "plastic", group: "Soft Tissue & Skin", label: "Lymphedema", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Include recurrent infections if present"] }, notes: ["Consider a local lymphedema clinic/practitioner first."] },
  { id: "p_skin_cancer", pathway: "plastic", group: "Soft Tissue & Skin", label: "Skin Cancer (biopsy confirmed)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Indicate Basal Cell, Squamous Cell, Melanoma or Other"] }, notes: ["Rapidly growing/changing or >1cm: phone in a priority referral."] },
  { id: "p_suspected_skin_cancer", pathway: "plastic", group: "Soft Tissue & Skin", label: "Suspected Skin Cancer", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_benign_neoplasm_skin", pathway: "plastic", group: "Soft Tissue & Skin", label: "Suspected Benign Neoplasm of Skin (tumor)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Functional limitations / additional symptoms if any"] },
    fundingNote: "May not be covered through public coverage, even once referred and seen." },
  { id: "p_benign_soft_tissue_mass", pathway: "plastic", group: "Soft Tissue & Skin", label: "Suspected Benign Soft Tissue Mass", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Functional limitations / additional symptoms if any"] },
    fundingNote: "May not be covered through public coverage, even once referred and seen." },
  { id: "p_suspected_soft_tissue_cancer", pathway: "plastic", group: "Soft Tissue & Skin", label: "Suspected Soft Tissue Cancer", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Imaging results"] }, notes: ["Emergent/urgent: call RAAPID. See also the General Surgery referral pathway."] },

  // Breast
  { id: "p_breast_asymmetry", pathway: "plastic", group: "Breast", label: "Asymmetrical Breasts", process: localExceptCalgaryCentral(), wcb: false,
    fundingNote: "Initial consultation is insured in every case. Whether the procedure is insured is decided case-by-case." },
  { id: "p_breast_implant_complications", pathway: "plastic", group: "Breast", label: "Breast Implant Complications", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Reason for original surgery, operative report/implant info if available"] },
    notes: ["Send direct to original surgeon whenever possible."],
    fundingNote: "Initial consultation is insured in every case. Whether the procedure is insured is decided case-by-case." },
  { id: "p_congenital_breast_deformity", pathway: "plastic", group: "Breast", label: "Congenital Breast Deformity", process: localExceptCalgaryCentral(), wcb: false,
    fundingNote: "Initial consultation is insured in every case. Whether the procedure is insured is decided case-by-case." },
  { id: "p_breast_reduction", pathway: "plastic", group: "Breast", label: "Large Breasts (Breast Reduction)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Provide BMI and smoking status if available"] },
    fundingNote: "Publicly insured consideration requires BOTH significant quality-of-life impact (back/shoulder pain, paresthesia) AND more than 300g of tissue removed per side." },
  { id: "p_gender_affirming_top", pathway: "plastic", group: "Breast", label: "Gender Affirming Top Surgery", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Diagnosis of gender dysphoria by a specialist in transgender care"] } },
  { id: "p_gynecomastia", pathway: "plastic", group: "Breast", label: "Gynecomastia", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["List of medications, previous treatments, hormone levels/bloodwork if available"] },
    fundingNote: "Initial consultation is insured in every case. Whether the procedure is insured is decided case-by-case." },
  { id: "p_breast_reconstruction", pathway: "plastic", group: "Breast", label: "Breast Reconstruction (post-mastectomy)", process: localExceptCalgaryCentral(), wcb: false,
    imaging: { items: ["Include most recent oncology report"] } },

  // Acute Injury (Plastic Surgery — 2-week window, broader trauma scope)
  { id: "ai_p_burn", pathway: "plastic", group: "Acute Injury", label: "Burn", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_infection", pathway: "plastic", group: "Acute Injury", label: "Infection", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_fracture_lt4", pathway: "plastic", group: "Acute Injury", label: "Fracture (< 4 weeks)", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_fracture_gt4", pathway: "plastic", group: "Acute Injury", label: "Fracture (> 4 weeks)", process: { North: "Zone FAST Team", Edmonton: "Zone FAST Team", Central: "Zone FAST Team", Calgary: "Zone FAST Team", South: "South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team." }, wcb: true,
    imaging: { items: ["X-ray of affected body part or joint"] } },
  { id: "ai_p_tendon_lt4", pathway: "plastic", group: "Acute Injury", label: "Suspected Tendon Rupture (< 4 weeks)", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_tendon_gt4", pathway: "plastic", group: "Acute Injury", label: "Suspected Tendon Rupture (> 4 weeks)", process: { North: "Zone FAST Team", Edmonton: "Zone FAST Team", Central: "Zone FAST Team", Calgary: "Zone FAST Team", South: "South Zone: Hand → Plastic Surgery direct; Wrist → Zone FAST Team." }, wcb: false },
  { id: "ai_p_ligament", pathway: "plastic", group: "Acute Injury", label: "Acute Ligament Pathologies (hand & wrist)", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone. South: Plastic Surgeon on call / South Health Campus Hand for Hand/Finger, Ortho surgeon on call for Wrist."] },
  { id: "ai_p_dislocation", pathway: "plastic", group: "Acute Injury", label: "Dislocation (hand, fingers, wrist)", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_nerve_injury", pathway: "plastic", group: "Acute Injury", label: "Nerve Injury", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_pathologic_fracture", pathway: "plastic", group: "Acute Injury", label: "Pathologic Fracture", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_wounds", pathway: "plastic", group: "Acute Injury", label: "Wounds", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },
  { id: "ai_p_vascular_injury", pathway: "plastic", group: "Acute Injury", label: "Vascular Injury of the Upper Extremity", process: null, urgent: true, weeks: 2, notes: ["Urgent referral by zone."] },

  // Other
  { id: "p_consult_other", pathway: "plastic", group: "Other", label: "Consult for Plastic Surgery (Other)", process: localExceptCalgaryCentral(), wcb: false },
  { id: "p_consult_cosmetic", pathway: "plastic", group: "Other", label: "Consult for Cosmetic Referrals", process: null, bypass: true,
    fundingNote: "Never routed through FAST — contact the preferred surgeon directly, private pay." },
];

export const ALL_REASONS = [...ORTHO_REASONS, ...PLASTIC_REASONS];

export const REASON_GROUPS = (() => {
  const seen = [];
  for (const r of ALL_REASONS) if (!seen.includes(r.group)) seen.push(r.group);
  return seen;
})();
