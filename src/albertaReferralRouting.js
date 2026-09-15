/* ────────────────────────────────────────────────────────────────────────
   Alberta MSK / Ortho / Spine referral routing map (Foundation Edition v1.0).

   Static reference data: every Alberta town/city below routes to a referral
   hub, which determines its AHS zone, corridor and specialty intake. A
   handful of towns (Camrose, Wetaskiwin, Olds, Wainwright, Drayton Valley,
   Peace River) sit on a zone boundary and are split across two hubs
   depending on specialty — see `alternates` on the resolved result.

   This is deliberately static (no geocoding, no API): a fixed lookup table
   mirroring real AHS referral patterns, swapped in wherever a town needs to
   resolve to its hub/zone/specialty/fax intake.
──────────────────────────────────────────────────────────────────────── */

export const ALBERTA_REFERRAL_HUBS = [
  {
    id: "edmonton",
    name: "Edmonton",
    zone: "Edmonton Zone",
    corridor: "Edmonton",
    specialties: [
      "Edmonton Orthopedics (RAH / UAH)",
      "Edmonton Hip & Knee Clinic",
      "Edmonton Spine Triage",
      "Edmonton MSK Central Intake",
      "Edmonton Fracture Clinic",
    ],
    rule: "If town is within Edmonton metro or northeast corridor, route to Edmonton Zone.",
    towns: [
      "Edmonton", "St. Albert", "Sherwood Park", "Fort Saskatchewan", "Leduc",
      "Beaumont", "Spruce Grove", "Stony Plain", "Devon", "Morinville",
      "Gibbons", "Bon Accord", "Bruderheim", "Lamont", "Legal", "Redwater",
      "Smoky Lake", "Vegreville", "Tofield", "Viking",
      { name: "Camrose", note: "for some specialties; otherwise Red Deer" },
      { name: "Wetaskiwin", note: "borderline; often Edmonton for Ortho" },
      { name: "Drayton Valley", note: "borderline; sometimes Red Deer" },
    ],
  },
  {
    id: "calgary",
    name: "Calgary",
    zone: "Calgary Zone",
    corridor: "Calgary",
    specialties: [
      "Calgary Orthopedics (Foothills / SHC)",
      "Calgary Hip & Knee Clinic",
      "Calgary Spine Triage",
      "Calgary MSK Clinics",
      "Calgary Fracture Clinic",
    ],
    rule: "If town is within Calgary metro or southeast corridor, route to Calgary Zone.",
    towns: [
      "Calgary", "Airdrie", "Chestermere", "Cochrane", "Okotoks", "High River",
      "Strathmore", "Black Diamond", "Turner Valley", "Nanton", "Vulcan",
      "Drumheller", "Three Hills", "Olds", "Didsbury", "Carstairs", "Crossfield",
    ],
  },
  {
    id: "red-deer",
    name: "Red Deer",
    zone: "Central Zone",
    corridor: "Central",
    specialties: [
      "Red Deer Orthopedics",
      "Red Deer Hip & Knee Clinic",
      "Central Zone Spine Triage",
      "Central Zone MSK Clinics",
    ],
    rule: "If town is in east-central Alberta, route to Red Deer.",
    towns: [
      "Red Deer", "Lacombe", "Sylvan Lake", "Ponoka", "Wetaskiwin", "Camrose",
      "Stettler", "Innisfail", "Bowden",
      { name: "Olds", note: "sometimes Calgary for spine" },
      "Rocky Mountain House", "Rimbey", "Eckville", "Bashaw", "Castor",
      "Coronation", "Hanna", "Provost",
      { name: "Wainwright", note: "borderline; sometimes Edmonton" },
    ],
  },
  {
    id: "lethbridge",
    name: "Lethbridge",
    zone: "South Zone",
    corridor: "Southwest / Southeast",
    specialties: [
      "Lethbridge Orthopedics",
      "South Zone Hip & Knee Clinic",
      "South Zone Spine Triage",
      "South Zone MSK Clinics",
    ],
    rule: "If town is in southwest Alberta, route to Lethbridge.",
    towns: [
      "Lethbridge", "Coaldale", "Taber", "Fort Macleod", "Pincher Creek",
      "Cardston", "Raymond", "Magrath", "Milk River", "Crowsnest Pass",
      "Blairmore", "Coleman",
    ],
  },
  {
    id: "medicine-hat",
    name: "Medicine Hat",
    zone: "South Zone",
    corridor: "Southeast",
    specialties: [
      "Medicine Hat Orthopedics",
      "South Zone Hip & Knee Clinic",
      "South Zone Spine Triage",
      "South Zone MSK Clinics",
    ],
    rule: "If town is in southeast Alberta, route to Medicine Hat.",
    towns: [
      "Medicine Hat", "Brooks", "Bow Island", "Oyen", "Redcliff",
      "Cypress County", "Foremost",
    ],
  },
  {
    id: "grande-prairie",
    name: "Grande Prairie",
    zone: "North Zone",
    corridor: "Northwest",
    specialties: [
      "Grande Prairie Orthopedics",
      "North Zone Hip & Knee Clinic",
      "North Zone Spine Triage",
      "North Zone MSK Clinics",
    ],
    rule: "If town is in northwest Alberta, route to Grande Prairie.",
    towns: [
      "Grande Prairie", "Sexsmith", "Clairmont", "Beaverlodge", "Hythe",
      "Fairview", "Spirit River", "Valleyview", "High Prairie",
      { name: "Peace River", note: "sometimes Edmonton for spine" },
    ],
  },
  {
    id: "fort-mcmurray",
    name: "Fort McMurray",
    zone: "North Zone",
    corridor: "Northeast",
    specialties: [
      "Fort McMurray Orthopedics",
      "North Zone Hip & Knee Clinic",
      "North Zone Spine Triage",
      "North Zone MSK Clinics",
    ],
    rule: "If town is in northeast Alberta, route to Fort McMurray.",
    towns: [
      "Fort McMurray", "Fort Chipewyan", "Fort MacKay", "Anzac", "Conklin",
      "Janvier",
    ],
  },
];

function normalize(town) {
  return town.trim().toLowerCase().replace(/\s+/g, " ");
}

// normalized town name -> [{ hub, note? }], one entry per hub that lists it.
const TOWN_INDEX = new Map();
for (const hub of ALBERTA_REFERRAL_HUBS) {
  for (const entry of hub.towns) {
    const name = typeof entry === "string" ? entry : entry.name;
    const note = typeof entry === "string" ? undefined : entry.note;
    const key = normalize(name);
    const list = TOWN_INDEX.get(key) ?? [];
    list.push({ hub, note });
    TOWN_INDEX.set(key, list);
  }
}

/**
 * Every town/city covered by this map, alphabetised and de-duplicated
 * (a town listed under two hubs — e.g. Camrose — appears once) — for
 * populating a <select> instead of free-text entry.
 */
export const ALL_ALBERTA_TOWNS = (() => {
  const seen = new Set();
  const names = [];
  for (const hub of ALBERTA_REFERRAL_HUBS) {
    for (const entry of hub.towns) {
      const name = typeof entry === "string" ? entry : entry.name;
      const key = normalize(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
})();

/**
 * Resolve an Alberta town/city to its referral hub, AHS zone, corridor and
 * specialty intake list. When a town is split across hubs, the unconditioned
 * listing is the primary result and the rest come back as `alternates`.
 *
 * Returns null for a town not covered by this map (Foundation Edition v1.0
 * is MSK/Ortho/Spine only).
 */
export function resolveReferralHub(town) {
  const matches = TOWN_INDEX.get(normalize(town ?? ""));
  if (!matches || matches.length === 0) return null;

  const primary = matches.find((m) => !m.note) ?? matches[0];
  const alternates = matches
    .filter((m) => m !== primary)
    .map((m) => ({ hub: m.hub.name, zone: m.hub.zone, condition: m.note }));

  return {
    town: town.trim(),
    hub: primary.hub.name,
    zone: primary.hub.zone,
    corridor: primary.hub.corridor,
    specialties: primary.hub.specialties,
    rule: primary.hub.rule,
    alternates,
  };
}
