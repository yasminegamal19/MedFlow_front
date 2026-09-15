/* Structured, interactive pathway assessment forms — one per condition group
 * with a written primary-care pathway (docs/pathways/). Static reference
 * content + deterministic red-flag/differential logic; no model call.
 * knee and lumbar are transcribed from the full pathway docs
 * (docs/pathways/pathways-md/*.md); the rest mirror the curated structured
 * data already seeded in
 * MedFlow_AI_Backend/database/seeders/ClinicalPathwaySeeder.php, which was
 * itself built from the same Alberta provincial pathway PDFs
 * (docs/pathways/primary-care-pathways/, docs/pathways/*.pdf).
 */
export const PATHWAY_FORMS = {
  cts: {
    title: "Carpal Tunnel Syndrome Clinical Pathway",
    eligibility: {
      label: "Symptoms are consistent with median nerve compression at the wrist",
      warning: "Consider cervical radiculopathy or peripheral neuropathy if symptoms don't fit a median-nerve distribution.",
    },
    history: {
      selects: [{ key: "severity", label: "Severity", options: ["Mild / moderate (intermittent)", "Severe (constant)"] }],
      radio: { key: "nocturnal", label: "Nocturnal symptoms?", options: ["Yes", "No"] },
      symptoms: ["Numbness / tingling in thumb, index, middle finger", "Pain radiating to forearm", "Thenar atrophy", "Grip / pinch weakness"],
      comorbiditiesPlaceholder: "e.g. diabetes, hypothyroidism, pregnancy, rheumatoid arthritis",
    },
    redFlagGroups: [
      {
        label: "Infection",
        action: "RAAPID referral or ER; no antibiotic trial before referral",
        items: ["Signs of infection at the wrist"],
      },
    ],
    imaging: {
      note: "Electrodiagnostic studies (nerve conduction) are not mandatory — reserve for severe or unclear cases.",
      options: [
        { label: "No electrodiagnostics needed", detail: "Clinical diagnosis, mild/moderate" },
        { label: "Electrodiagnostic studies", detail: "Severe or unclear presentation" },
      ],
    },
    management: {
      items: ["Wrist splint (neutral position, especially at night)", "Activity modification"],
      injections: [{ label: "Ultrasound-guided steroid injection, max 3 lifetime" }],
    },
    followUp: "Routine referral to a hand surgeon if mild/moderate and non-responsive after an 8-12 week conservative trial; priority referral if severe (thenar atrophy, constant symptoms).",
  },

  shoulder: {
    title: "Shoulder Pain Clinical Pathway",
    eligibility: {
      label: "Cervical spine has been screened and ruled out as the pain source",
      warning: "Screen the cervical spine before proceeding — neck pathology can mimic shoulder pain.",
    },
    history: {
      selects: [
        { key: "onset", label: "Onset", options: ["Acute", "Chronic"] },
        { key: "painPattern", label: "Pain pattern", options: ["Night pain", "Activity-related", "Constant"] },
      ],
      radio: { key: "stiffnessDominant", label: "Stiffness-dominant (vs pain-dominant)?", options: ["Yes", "No"] },
      symptoms: ["Painful arc (60-120°)", "Weakness on resisted testing", "Global loss of active AND passive ROM", "Sudden loss of strength after a pop or tear sensation"],
      redFlagSymptom: "Sudden loss of strength after a pop or tear sensation",
      comorbiditiesPlaceholder: "e.g. diabetes (adhesive capsulitis risk), prior shoulder surgery",
    },
    redFlagGroups: [
      { label: "Infection", action: "Same-day Emergency Department / RAAPID advice", items: ["Pain, redness, heat, swelling AND systemically unwell / fever"] },
      { label: "Fracture / dislocation", action: "Same-day Emergency Department / RAAPID advice", items: ["Trauma with suspected fracture or dislocation"] },
      { label: "Tendon rupture", action: "Same-day Emergency Department / RAAPID advice", items: ["Suspected pectoralis major or distal biceps rupture"] },
      { label: "Malignancy", action: "Urgent orthopedic oncology referral, within 1 week", items: ["Unremitting night pain, weight loss, or cancer history"] },
    ],
    imaging: {
      note: "X-ray is not routine at first presentation — reserve for chronic/stiffness presentations or suspected trauma.",
      options: [
        { label: "No imaging (acute, typical presentation)", detail: "Not routine at first visit" },
        { label: "Shoulder X-ray series", detail: "AP (external rotation), AP oblique, Scapular Y, Axial — chronic/stiffness or trauma" },
      ],
    },
    management: {
      items: ["Education provided", "Exercise-based rehab, 12+ weeks", "Activity modification", "Pain control (NSAID / topical)"],
      injections: [{ label: "Consider subacromial cortisone injection for impingement-type pain" }],
    },
    followUp: "Refer to a specialist if functional outcome remains poor after a 12-week physiotherapy trial.",
  },

  knee: {
    title: "Knee Primary Care Clinical Pathway",
    eligibility: {
      label: "Patient is ≥18 years old",
      warning: "This pathway is designed for patients ≥18 years in primary care. Proceed with caution, or refer to pediatric guidelines if the patient is under 18.",
    },
    history: {
      selects: [
        { key: "onset", label: "Onset", options: ["Acute", "Chronic"] },
        { key: "mechanism", label: "Mechanism", options: ["Traumatic", "Non-traumatic", "Sudden", "Gradual"] },
      ],
      radio: { key: "workRelated", label: "Work-related injury?", options: ["Yes", "No"] },
      symptoms: ["Swelling", "Giving way", "Clicking / catching", "True locking"],
      redFlagSymptom: "True locking",
      comorbiditiesPlaceholder: "e.g. BMI, smoking, A1c",
    },
    redFlagGroups: [
      {
        label: "Fracture / significant injury",
        action: "Immediate Emergency Department / RAAPID advice",
        items: [
          "Trauma & unable to weight-bear",
          "Cannot bend knee >90°",
          "Unable to fully extend knee",
          "Dislocation or locked knee",
          "Significant ligament / tendon injury suspected",
        ],
      },
      {
        label: "Neurovascular",
        action: "Immediate Emergency Department / RAAPID advice",
        items: [
          "Rapid change in sensation",
          "Constant / progressive intractable pain",
          "Reduced / absent popliteal pulse",
        ],
      },
      {
        label: "Infection",
        action: "Hold antibiotics until aspiration performed; immediate Emergency Department / RAAPID advice",
        items: ["Pain, redness, heat, swelling AND systemically unwell / fever"],
      },
      {
        label: "Rheumatological",
        tone: "amber",
        action: "Consider inflammatory or crystal arthropathy — initiate work-up and seek Advice Services / Rheumatology consultation.",
        items: ["No trauma + multiple joints + stiffness + decreased ROM"],
      },
      {
        label: "Malignancy",
        action: "Urgent Orthopedic Oncology advice / referral",
        items: ["Deformity / mass (no trauma), unremitting night pain, weight loss, or cancer history"],
      },
    ],
    anatomical: {
      label: "Primary location of pain / complaint",
      options: [
        { key: "anterior", label: "Anterior", differentials: ["Patellofemoral syndrome (PFS)", "Chondromalacia patella", "Quadriceps tendinopathy", "Patellar tendinopathy", "Bursitis", "Osgood-Schlatter's (if adolescent)", "Chronic patellar subluxation/dislocation"] },
        { key: "medial", label: "Medial", differentials: ["Acute medial meniscal tear", "Degenerative meniscal tear", "Medial compartment arthritis", "Pes anserine bursitis", "MCL sprain"] },
        { key: "lateral", label: "Lateral", differentials: ["Acute lateral meniscal tear", "Degenerative meniscal tear", "Lateral compartment end-stage OA", "ITB syndrome", "LCL sprain"] },
        { key: "posterior", label: "Posterior", differentials: ["Baker's cyst", "Gastrocnemius strain", "PCL sprain"] },
        { key: "intra", label: "Intra-articular", differentials: ["Osteoarthritis", "Osteochondral defect", "Spontaneous osteonecrosis of knee (SONK)"] },
        { key: "instability", label: "Instability +/- pain", differentials: ["Patellar instability", "Unstable meniscal tear", "ACL tear", "PCL tear", "High-grade MCL/LCL sprain", "Intra-articular loose body"], warning: "Consider Sports Medicine / Orthopedics consultation." },
      ],
    },
    imaging: {
      note: "X-ray first — ultrasound / MRI generally NOT recommended in primary care.",
      options: [
        { label: "Routine series", detail: "Standard knee routine" },
        { label: "Trauma series", detail: "If trauma <7 days" },
        { label: "Weightbearing series", detail: "If OA is questioned" },
      ],
    },
    management: {
      items: [
        "Education provided", "Active exercise recommended", "Strength-based rehab discussed",
        "Physiotherapy referral (≥12 weeks)", "Pain control (topical / NSAID / hot-cold)",
        "Activity modification", "Bracing (if indicated)", "GLA:D® program referral",
      ],
      injections: [
        { label: "Intra-articular pathology + minimal degenerative change → consider hyaluronic acid" },
        { label: "Osteoarthritis management → consider cortisone", warning: "Avoid cortisone in knees without osteoarthritis." },
      ],
    },
    followUp: "Reassess in 6–12 weeks: symptoms, functional progress, and diagnosis.",
  },

  lumbar: {
    title: "Low Back Pain Clinical Pathway",
    eligibility: {
      label: "Adult patient in primary care",
      warning: "This pathway is written for adult primary care presentations of low back pain.",
    },
    history: {
      selects: [
        { key: "duration", label: "Duration", options: ["Acute (<6 weeks)", "Sub-acute (6 weeks–3 months)", "Chronic (≥3 months)", "Recurrent (≥2 episodes/12 months)"] },
      ],
      radio: { key: "painDominant", label: "Pain dominant in", options: ["Back / buttocks", "Leg"] },
      symptoms: ["Constant pain", "Numbness / weakness / tingling / burning", "Morning stiffness >30 min (if onset age <50)", "Saddle-area symptoms"],
      redFlagSymptom: "Saddle-area symptoms",
      comorbiditiesPlaceholder: "e.g. osteoporosis, prior back surgery, immunosuppression",
    },
    redFlagGroups: [
      {
        label: "Fracture",
        action: "Same-day ED referral; X-ray / CT / bone scan",
        items: ["High-energy trauma, fall from height, or MVA", "Mild/moderate trauma + age >70, osteoporosis, or prolonged corticosteroid use"],
      },
      {
        label: "Cauda equina syndrome",
        action: "Same-day ED referral; MRI",
        items: ["Saddle-area numbness / weakness / tingling / burning", "Bowel or bladder dysfunction", "Progressive bilateral foot/leg weakness"],
      },
      {
        label: "Myelopathy",
        action: "Same-day ED referral; MRI",
        items: ["Altered/lost sensation, progressive motor loss", "Gait disturbance, clonus, reduced fine motor control"],
      },
      {
        label: "Infection",
        action: "Same-day ED referral; MRI",
        items: ["Constant/progressive pain unrelated to activity, not relieved by rest", "Fever, systemically unwell, obvious wound, immunosuppression"],
      },
      {
        label: "Abdominal / visceral disease",
        action: "Same-day ED referral; investigation based on presentation",
        items: ["Abdominal pain radiating to the back, unrelated to spinal movement"],
      },
      {
        label: "Malignancy",
        action: "Urgent imaging / labs + consultation",
        items: ["History of cancer, night sweats, unexplained weight loss, unremitting pain"],
      },
    ],
    imaging: {
      note: "Usually no imaging before 12 weeks unless a red flag or specific intervention is being planned.",
      options: [
        { label: "No imaging", detail: "No red flags, no intervention planned" },
        { label: "Imaging indicated", detail: "Red flags present, or planning a specific intervention" },
      ],
    },
    management: {
      items: [
        "Education on rest positions", "Pharmacologic options discussed", "Non-pharmacologic options discussed",
        "Exercises reviewed", "Functional recommendations given",
      ],
      injections: [
        { label: "Injection is NOT first-line — reserve for non-improving cases after 6–12 weeks" },
      ],
    },
    followUp: "Trial management ~6 weeks, reassess; if not improving, reassess again at 12 weeks before considering rehab or specialist referral.",
  },

  hip_oa: {
    title: "Hip Osteoarthritis Clinical Pathway",
    eligibility: {
      label: "Adult patient (≥18) with hip pain in primary care",
      warning: "This pathway is designed for adult primary-care presentations of hip osteoarthritis. Consider pediatric guidelines if the patient is under 18.",
    },
    history: {
      selects: [
        { key: "onset", label: "Onset", options: ["Acute", "Chronic"] },
        { key: "painLocation", label: "Pain location", options: ["Groin", "Lateral hip", "Buttock", "Anterior thigh"] },
      ],
      radio: { key: "activityRelated", label: "Pain worse with activity?", options: ["Yes", "No"] },
      symptoms: ["Morning stiffness <30 min", "Reduced internal rotation", "Limp / antalgic gait", "Mechanical clicking or catching", "Sudden inability to weight-bear"],
      redFlagSymptom: "Sudden inability to weight-bear",
      comorbiditiesPlaceholder: "e.g. BMI, prior hip surgery, avascular necrosis risk (steroid use, alcohol use)",
    },
    redFlagGroups: [
      {
        label: "Fracture / dislocation",
        action: "Immediate Emergency Department / RAAPID advice",
        items: ["Trauma & unable to weight-bear", "Suspected femoral neck fracture", "Hip dislocation"],
      },
      {
        label: "Infection",
        action: "Hold antibiotics until aspiration performed; immediate Emergency Department / RAAPID advice",
        items: ["Pain, redness, heat, swelling AND systemically unwell / fever"],
      },
      {
        label: "Avascular necrosis",
        tone: "amber",
        action: "Urgent MRI and orthopedic referral — X-ray may be normal early.",
        items: ["Risk factors (steroid use, alcohol excess, sickle cell) with acute groin pain and normal X-ray"],
      },
      {
        label: "Malignancy",
        action: "Urgent orthopedic oncology advice / referral",
        items: ["Unremitting night pain, weight loss, or cancer history"],
      },
    ],
    imaging: {
      note: "X-ray first-line — weightbearing AP pelvis, AP hip, and Lauenstein lateral. MRI is not routinely needed when X-ray confirms OA (Choosing Wisely).",
      options: [
        { label: "Weightbearing AP pelvis + hip", detail: "Standard hip OA series" },
        { label: "Lauenstein lateral", detail: "Adds lateral assessment" },
        { label: "MRI", detail: "Only if X-ray normal but AVN or labral pathology suspected" },
      ],
    },
    management: {
      items: [
        "Education provided", "Activity modification", "Weight management discussed",
        "Physiotherapy / strength-based rehab referral", "Pain control (topical / NSAID)",
        "Walking aid trialed (if indicated)", "GLA:D® program referral",
      ],
      injections: [
        { label: "Consider intra-articular cortisone for OA-confirmed pain", warning: "Avoid injection when the diagnosis is unclear or infection is suspected." },
      ],
    },
    followUp: "Refer to the Zone FAST Team if conservative management fails, or if imaging confirms advanced OA with functional limitation.",
  },

  msk_oncology: {
    title: "MSK Oncology Clinical Pathway",
    eligibility: {
      label: "Patient has a palpable mass or bone lesion concerning for malignancy",
      warning: "This pathway is for suspected soft-tissue or bone malignancy. If the mass is clearly benign (e.g. a long-standing, superficial, mobile lipoma), consider the Hand & Wrist Soft Tissue Mass pathway instead.",
    },
    history: {
      selects: [
        { key: "depth", label: "Depth", options: ["Superficial", "Deep to fascia"] },
        { key: "ageGroup", label: "Age", options: ["Under 40", "40 and over"] },
      ],
      radio: { key: "growing", label: "Rapidly growing?", options: ["Yes", "No"] },
      symptoms: ["Mass >5cm", "Deep / fixed mass", "Rapid growth", "Painful mass", "Recurrent after prior excision"],
      redFlagSymptom: "Rapid growth",
      comorbiditiesPlaceholder: "e.g. prior malignancy, radiation exposure, neurofibromatosis",
    },
    redFlagGroups: [
      {
        label: "Rapidly growing or deep mass",
        action: "Urgent MRI; phone call to radiology to expedite",
        items: ["Rapidly growing or deep mass over 1cm"],
      },
    ],
    imaging: {
      note: "Plain radiographs of the entire bone for a suspected bone lesion; urgent MRI for a deep, large (>1cm), or rapidly growing soft-tissue mass.",
      options: [
        { label: "X-ray, entire bone", detail: "Suspected bone lesion" },
        { label: "Urgent MRI", detail: "Deep / large / rapidly growing soft-tissue mass" },
      ],
    },
    management: {
      items: [
        "Do NOT biopsy or excise in primary care",
        "Metastatic workup considered if age ≥40 with aggressive features (CT chest/abdo/pelvis, bone scan, SPEP, PSA in males)",
        "Urgent referral initiated",
      ],
      injections: [
        { label: "No aspiration or injection", warning: "Never aspirate or inject a mass suspicious for malignancy — it may seed tumour and complicate future surgery." },
      ],
    },
    followUp: "Refer urgently to MSK Oncology via the Zone FAST Team; do not delay for a conservative trial.",
  },

  hand_wrist_oa: {
    title: "Hand and Wrist Osteoarthritis Clinical Pathway",
    eligibility: {
      label: "Adult patient with chronic hand / wrist joint pain",
      warning: "This pathway is designed for adult primary-care presentations of hand and wrist osteoarthritis.",
    },
    history: {
      selects: [
        { key: "jointsInvolved", label: "Joints involved", options: ["CMC (thumb base)", "DIP", "PIP", "Wrist", "Multiple"] },
      ],
      radio: { key: "symmetry", label: "Symmetric involvement?", options: ["Yes", "No"] },
      symptoms: ["Joint pain with activity", "Stiffness <30-60 min in morning", "Reduced grip strength", "Bony enlargement (Heberden's / Bouchard's nodes)"],
      comorbiditiesPlaceholder: "e.g. prior hand trauma, occupation with repetitive grip",
    },
    redFlagGroups: [
      {
        label: "Suspected inflammatory arthritis",
        tone: "amber",
        action: "Order CBC, CRP, TSH, RF, anti-CCP; refer rheumatology",
        items: ["Morning stiffness >60 minutes", "Symmetric small-joint swelling", "Systemic symptoms (fatigue, fever)"],
      },
      {
        label: "Infection",
        action: "Emergent referral to ER; no antibiotic trial",
        items: ["Signs of infection (warmth, redness, fever, systemically unwell)"],
      },
    ],
    imaging: {
      note: "X-ray hand/wrist to confirm OA diagnosis and rule out other conditions (valid within 12 months).",
      options: [{ label: "Hand / wrist X-ray", detail: "AP, lateral, oblique" }],
    },
    management: {
      items: ["Education & activity modification", "Assistive devices / splinting", "Hand / occupational therapy referral", "Pain control (topical / NSAID)"],
      injections: [{ label: "Consider steroid injection for CMC joint pain" }],
    },
    followUp: "Refer to a hand/wrist surgeon if severe pain and functional impairment persist despite conservative trial.",
  },

  hand_wrist_mass: {
    title: "Hand and Wrist Soft Tissue Mass Clinical Pathway",
    eligibility: {
      label: "Patient has a palpable hand / wrist mass presumed benign (e.g. ganglion cyst)",
      warning: "If the mass is rapidly growing, fixed, or otherwise concerning for malignancy, use the MSK Oncology pathway instead.",
    },
    history: {
      selects: [{ key: "consistency", label: "Consistency", options: ["Cystic / fluctuant", "Firm / solid"] }],
      radio: { key: "painful", label: "Painful?", options: ["Yes", "No"] },
      symptoms: ["Severe pain", "Functional impairment", "Discharge", "Nail deformity", "Numbness"],
      redFlagSymptom: "Numbness",
      comorbiditiesPlaceholder: "e.g. prior aspiration attempts, occupation",
    },
    redFlagGroups: [
      {
        label: "Rapidly growing or fixed mass",
        action: "Urgent MRI and high-priority referral",
        items: ["Rapidly growing mass", "Fixed / non-mobile mass"],
      },
      {
        label: "Abscess / infection",
        action: "Refer ER or hand surgeon via RAAPID",
        items: ["Signs of abscess or infection"],
      },
    ],
    imaging: {
      note: "Ultrasound differentiates cystic vs solid when uncertain; MRI reserved for a suspected malignant mass (urgent).",
      options: [
        { label: "Ultrasound", detail: "Cystic vs solid" },
        { label: "Urgent MRI", detail: "Suspected malignant mass" },
      ],
    },
    management: {
      items: ["Reassurance — may resolve spontaneously", "Up to 3 aspirations trialed"],
      injections: [{ label: "No steroid injection indicated for a ganglion cyst" }],
    },
    followUp: "Refer to a hand/wrist surgeon after 3 failed aspirations, or urgently if malignancy is suspected.",
  },

  trigger_finger: {
    title: "Trigger Finger Clinical Pathway",
    eligibility: {
      label: "Patient reports finger triggering, locking, or catching",
      warning: "History alone is sufficient for diagnosis; exam demonstration is not required.",
    },
    history: {
      selects: [{ key: "digitsInvolved", label: "Digits involved", options: ["Single digit", "Multiple digits"] }],
      radio: { key: "diabetes", label: "Diabetes mellitus?", options: ["Yes", "No"] },
      symptoms: ["Locking / catching with flexion", "Painful clicking at A1 pulley", "Palpable nodule at A1 pulley", "Digit locked, not passively correctable"],
      redFlagSymptom: "Digit locked, not passively correctable",
      comorbiditiesPlaceholder: "e.g. diabetes, rheumatoid arthritis",
    },
    redFlagGroups: [
      {
        label: "Locked digit",
        action: "Urgent referral to hand surgeon; start injection concurrently if not yet done",
        items: ["Locked digit, not passively correctable"],
      },
    ],
    imaging: {
      note: "Imaging is not routinely required — trigger finger is a clinical diagnosis.",
      options: [{ label: "No imaging indicated", detail: "Clinical diagnosis" }],
    },
    management: {
      items: ["Rest / activity modification", "Splinting trial"],
      injections: [{ label: "Steroid injection into flexor tendon sheath, up to 3 lifetime per digit, 3 months apart" }],
    },
    followUp: "Refer to a hand and wrist surgeon if triggering persists after injection trial, or earlier if diabetic with multi-digit involvement.",
  },

  dupuytrens: {
    title: "Dupuytren's Contracture Clinical Pathway",
    eligibility: {
      label: "Patient has a palmar nodule or cord, with or without contracture",
      warning: "Hueston tabletop test: positive if the palm and fingers cannot be flattened on a table surface.",
    },
    history: {
      selects: [{ key: "digitsInvolved", label: "Digits involved", options: ["Single digit", "Multiple digits", "Bilateral"] }],
      radio: { key: "tabletop", label: "Tabletop test positive?", options: ["Yes", "No"] },
      symptoms: ["Palpable palmar nodule", "Palpable cord", "Finger contracture", "Limitation of work or life activity"],
      comorbiditiesPlaceholder: "e.g. family history, alcohol use, diabetes, prior hand trauma",
    },
    redFlagGroups: [],
    imaging: {
      note: "Imaging is not required — diagnosis is clinical, via the Hueston tabletop test.",
      options: [{ label: "No imaging indicated", detail: "Clinical diagnosis" }],
    },
    management: {
      items: ["Monitor and reassure", "Self-tabletop test taught for home monitoring"],
      injections: [{ label: "Consider a single steroid injection for tender nodules only" }],
    },
    followUp: "Refer to a hand and wrist surgeon if the tabletop test is positive, or for functional limitation from a progressive contracture.",
  },

  acute_hand_injury: {
    title: "Acute Hand, Wrist, and Upper Extremity Injury Pathway",
    eligibility: {
      label: "Acute traumatic hand, wrist, or upper-extremity injury (within 4 weeks)",
      warning: "This pathway is for acute injuries only — send chronic mal-union or missed injuries to the Zone FAST Team instead.",
    },
    history: {
      selects: [{ key: "mechanism", label: "Mechanism", options: ["Laceration", "Crush", "Fall / direct blow", "Penetrating"] }],
      radio: { key: "onsetWithin4Weeks", label: "Onset within 4 weeks?", options: ["Yes", "No"] },
      symptoms: ["Open wound", "Deformity", "Suspected fracture / dislocation", "Reduced sensation distal to injury", "Reduced / absent pulse"],
      redFlagSymptom: "Reduced / absent pulse",
      comorbiditiesPlaceholder: "e.g. anticoagulation, diabetes, tetanus status",
    },
    redFlagGroups: [
      { label: "Avascular digit", action: "Call RAAPID or send to ED via 911", items: ["Absent or markedly reduced perfusion to the digit"] },
      { label: "Compartment syndrome", action: "Call RAAPID or ED via 911", items: ["Pain out of proportion, tense swelling, pain with passive stretch"] },
      { label: "Necrotizing / severe deep-space infection", action: "Call RAAPID or ED via 911", items: ["Rapidly spreading infection, systemically unwell"] },
      { label: "Irreducible dislocation", action: "Call RAAPID or ED via 911", items: ["Joint dislocation that cannot be reduced"] },
      { label: "Nerve laceration", tone: "amber", action: "Call RAAPID or ED via 911", items: ["Numbness distal to a laceration"] },
    ],
    imaging: {
      note: "X-ray to assess for fracture / dislocation / foreign body as clinically indicated.",
      options: [{ label: "X-ray", detail: "Fracture / dislocation / foreign body" }],
    },
    management: {
      items: ["Wound care / irrigation", "Splinting", "Tetanus status updated", "Analgesia"],
      injections: [{ label: "No injection indicated for acute injury assessment" }],
    },
    followUp: "Call the surgeon on call via RAAPID for any red flag above; otherwise send chronic mal-union to the Zone FAST Team.",
  },

  skin_lesion: {
    title: "Suspected Skin Cancer / Soft Tissue Lesion Pathway",
    eligibility: {
      label: "Patient has a lesion suspected to be skin cancer or a soft-tissue lesion",
      warning: "This pathway is for suspected malignant skin or soft-tissue lesions, not clearly benign lesions such as a typical seborrheic keratosis.",
    },
    history: {
      selects: [{ key: "lesionType", label: "Suspected type", options: ["BCC", "SCC", "Melanoma", "Other / uncertain"] }],
      radio: { key: "changing", label: "Changing in size, shape, or colour?", options: ["Yes", "No"] },
      symptoms: ["Rapid growth", "Irregular border", "Colour variation", "Bleeding or ulceration", "Diameter >1cm"],
      redFlagSymptom: "Rapid growth",
      comorbiditiesPlaceholder: "e.g. immunosuppression, prior skin cancer, significant sun exposure",
    },
    redFlagGroups: [
      {
        label: "Rapidly growing or changing lesion",
        action: "Phone priority referral",
        items: ["Rapidly growing or changing lesion, over 1cm"],
      },
    ],
    imaging: {
      note: "MRI is reserved for suspected soft-tissue cancer beneath the lesion — not routine for a typical skin lesion.",
      options: [
        { label: "No imaging (typical skin lesion)", detail: "Clinical / dermoscopic assessment" },
        { label: "MRI", detail: "Suspected soft tissue cancer" },
      ],
    },
    management: {
      items: ["Photograph and measure lesion", "Biopsy considered / arranged", "Avoid shave biopsy if melanoma suspected"],
      injections: [{ label: "No injection indicated — do not treat empirically before tissue diagnosis" }],
    },
    followUp: "Refer to the Zone FAST Team; call RAAPID directly if soft-tissue cancer is suspected.",
  },
};
