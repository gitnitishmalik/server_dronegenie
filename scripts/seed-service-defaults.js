/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Defaults applied to every service in a category unless the service has a specific override
const CATEGORY_DEFAULTS = {
  "Agricultural Spraying / Seeding": {
    unit: "acre",
    uav_type: "Multi-rotor agri drone",
    feature_needed: "Spray tank (10-16L), flow-controlled nozzles",
    rate_on_qty: "Yes",
  },
  "Construction Monitoring": {
    unit: "day",
    uav_type: "Multi-rotor camera drone",
    feature_needed: "RGB 4K camera, RTK GPS",
    rate_on_qty: "No",
  },
  "Drone Shows": {
    unit: "event",
    uav_type: "Light-show drone swarm",
    feature_needed: "RGB LED array, GPS choreography",
    rate_on_qty: "Yes",
  },
  "Power Distribution Assets": {
    unit: "km",
    uav_type: "Multi-rotor inspection drone",
    feature_needed: "RGB + thermal imaging camera",
    rate_on_qty: "Yes",
  },
  "Volumetric Analysis": {
    unit: "site",
    uav_type: "Fixed-wing / VTOL survey drone",
    feature_needed: "Photogrammetry camera, RTK GPS",
    rate_on_qty: "Yes",
  },
  "Thermal Inspection": {
    unit: "site",
    uav_type: "Multi-rotor inspection drone",
    feature_needed: "LWIR thermal camera (radiometric)",
    rate_on_qty: "No",
  },
  "Security Surveillance": {
    unit: "day",
    uav_type: "Multi-rotor surveillance drone",
    feature_needed: "Day/night zoom + thermal camera",
    rate_on_qty: "No",
  },
  "Aerial Cinematography": {
    unit: "day",
    uav_type: "Multi-rotor cinema drone",
    feature_needed: "4K/6K cinema camera, 3-axis gimbal",
    rate_on_qty: "No",
  },
  "Transmission Lines": {
    unit: "km",
    uav_type: "Multi-rotor inspection drone",
    feature_needed: "RGB + thermal imaging camera",
    rate_on_qty: "Yes",
  },
  "Forest Fire Detection": {
    unit: "hectare",
    uav_type: "Fixed-wing / VTOL drone",
    feature_needed: "LWIR thermal camera",
    rate_on_qty: "Yes",
  },
  "Drone Delivery": {
    unit: "delivery",
    uav_type: "Cargo delivery drone",
    feature_needed: "Payload compartment, parachute safety",
    rate_on_qty: "Yes",
  },
  "Marine/Watershed Management": {
    unit: "sq km",
    uav_type: "Multi-rotor / VTOL drone",
    feature_needed: "RGB + multispectral camera",
    rate_on_qty: "Yes",
  },
  "Water/Chemical Spraying": {
    unit: "structure",
    uav_type: "Heavy-lift multi-rotor drone",
    feature_needed: "Pressure-wash nozzle, water/chem tank",
    rate_on_qty: "No",
  },
  "Monitoring/Testing/Detection": {
    unit: "acre",
    uav_type: "Multi-rotor survey drone",
    feature_needed: "Multispectral / RGB camera",
    rate_on_qty: "Yes",
  },
  "Miscellaneous": {
    unit: "event",
    uav_type: "Multi-rotor drone",
    feature_needed: "As per engagement",
    rate_on_qty: "No",
  },
  "Drone Based Inspection": {
    unit: "asset",
    uav_type: "Multi-rotor inspection drone",
    feature_needed: "RGB + thermal imaging camera",
    rate_on_qty: "Yes",
  },
  "Town Planning and Smart Cities": {
    unit: "sq km",
    uav_type: "Fixed-wing / VTOL survey drone",
    feature_needed: "RTK GPS, photogrammetry camera",
    rate_on_qty: "Yes",
  },
};

// Per-service overrides (matched by normalized name). Use these for services that deviate
// meaningfully from their category default.
const SERVICE_OVERRIDES = {
  "seed dispersal": { feature_needed: "Seed dispersal hopper, precision dispenser" },

  "aqi management at construction site": { feature_needed: "Air-quality sensors (PM2.5/10, CO, NOx)" },
  "building facade inspection": { unit: "building", feature_needed: "RGB 4K + zoom camera, close-proximity mode" },

  // Shows
  "drone swarm based fireworks show": { feature_needed: "RGB LED array, pyrotechnic-safe frame" },

  // Power / transmission
  "overhead line survey": { feature_needed: "LiDAR + RGB camera" },
  "powerline and substation survey": { feature_needed: "LiDAR + RGB camera" },
  "transmission & distribution (t&d) asset mapping": { feature_needed: "LiDAR, RTK GPS" },
  "vegetation invasion detection": { feature_needed: "Multispectral + RGB camera" },

  // Volumetric
  "ash heap assessment": { unit: "heap" },
  "bagasse volumetric assessment": { unit: "heap" },
  "coal yard monitoring": { unit: "yard" },
  "lease boundary management": { feature_needed: "RTK GPS, high-res RGB camera" },

  // Thermal
  "gas leak detection": { feature_needed: "Methane / VOC gas sensor (OGI camera)" },
  "flare stack inspection": { feature_needed: "High-heat-tolerant thermal camera" },

  // Surveillance
  "pipeline surveillance (oil/gas)": { unit: "km", uav_type: "Fixed-wing long-range drone" },
  "border surveillance": { unit: "km", uav_type: "Fixed-wing long-range drone" },
  "smart city surveillance": { feature_needed: "Day/night camera, crowd-analytics stream" },
  "vehicle live tracking": { unit: "hour" },
  "vehicle tracking": { unit: "hour" },
  "defence reconnaissance": { uav_type: "Fixed-wing long-range drone", unit: "mission" },

  // Cinematography
  "wedding cinematography": { unit: "event" },
  "wedding photography": { unit: "event" },
  "live event filming": { unit: "event" },
  "news broadcasting": { unit: "hour" },
  "news gathering (drone journalism)": { unit: "hour" },
  "real estate photography": { unit: "property" },
  "reality shows / live broadcasting": { unit: "day" },
  "stock footage creation": { unit: "day" },
  "360° vr content": { unit: "shoot", feature_needed: "360° VR camera rig" },
  "advertisement production": { unit: "shoot" },
  "documentary filming": { unit: "day" },
  "film cinematography": { unit: "day" },

  // Fire / firefighting
  "urban firefighting": { feature_needed: "Water / foam dispensing payload" },
  "firefighting drone": { feature_needed: "Water / foam dispensing payload" },
  "fire detection and suppression": { feature_needed: "Thermal + suppression payload" },

  // Delivery
  "bvlos parcel delivery": { unit: "flight" },
  "medicine delivery": { unit: "delivery", feature_needed: "Temperature-controlled payload bay" },

  // Marine
  "coastal mapping (bathymetry)": { feature_needed: "Bathymetric LiDAR" },
  "ship inspection": { unit: "vessel", feature_needed: "RGB + thermal imaging camera" },
  "ship monitoring": { unit: "vessel" },
  "waterbody health monitoring uavs": { feature_needed: "Multispectral + water-quality sensor" },
  "water waste survey": { unit: "sq km" },
  "underwater bridge pillar inspection": { unit: "pillar", uav_type: "Tethered underwater drone" },

  // Water / Chemical spraying
  "solar panel cleaning": { unit: "1,000 panels", feature_needed: "Cleaning head, water/detergent tank" },
  "train washing drones": { unit: "train" },
  "chimney washing / painting": { unit: "chimney" },
  "structure painting": { unit: "structure", feature_needed: "Paint spray nozzle, paint tank" },
  "structure pressure washing": { unit: "structure" },
  "asset painting and washing": { unit: "asset" },
  "uav based fog dispersal": { unit: "sq km", feature_needed: "Fog-dispersal thermal payload" },

  // Monitoring / testing
  "livestock monitoring": { unit: "hectare", feature_needed: "RGB + zoom camera" },
  "anti-poaching patrols": { unit: "hectare", feature_needed: "Thermal + RGB camera" },
  "animal tracking (wildlife study)": { unit: "hectare", feature_needed: "Thermal + RGB camera" },
  "environmental studies and services": { feature_needed: "Multispectral + air/water sensor" },
  "environmental assessment": { feature_needed: "Multispectral + air/water sensor" },
  "right-of-way planning": { unit: "km", feature_needed: "LiDAR + RGB camera" },
  "control area monitoring and yield estimation": { feature_needed: "Multispectral / NDVI camera" },

  // Inspection
  "bridge inspection": { unit: "bridge", feature_needed: "RGB + zoom + thermal camera" },
  "oil rig inspection": { unit: "rig", feature_needed: "Gas-safe thermal camera" },
  "pipeline monitoring": { unit: "km" },
  "railway bridge inspections": { unit: "bridge" },
  "railway inspection": { unit: "km" },
  "railway track inspection": { unit: "km" },
  "solar panel inspection": { unit: "MW" },
  "telecom tower inspection": { unit: "tower" },
  "ropeway inspection": { unit: "km" },
  "tunnel inspection": { unit: "tunnel", feature_needed: "Obstacle-avoidance, LED lights, RGB + thermal" },
  "wind farm inspection": { unit: "turbine" },
  "wind turbine blade inspection": { unit: "turbine" },
  "pilot follow-ahead drone for railways": { unit: "km" },

  // Town planning
  "route planning and traffic management": { unit: "project" },
  "land survey for revenue": { feature_needed: "RTK GPS, high-res RGB camera" },
  "land survey for hydrological assessment": { feature_needed: "LiDAR + multispectral" },
  "route planning": { unit: "project" },
  "gpr survey of utilities": { feature_needed: "Ground-penetrating radar (GPR)" },
  "flood management": { unit: "project", feature_needed: "LiDAR + multispectral" },
  "encroachment detection": { feature_needed: "RGB + RTK GPS, change-detection analytics" },
  "road health monitoring": { unit: "km" },
  "asset inspection": { unit: "asset" },
  "traffic management": { unit: "day" },
  "land assessment and survey": { feature_needed: "RTK GPS, high-res RGB camera" },
  "digital twin & 3d models": { unit: "site", feature_needed: "Photogrammetry camera + RTK GPS" },
};

const normalize = (n) =>
  (n || "").replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const isEmpty = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "NA";
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== seed-service-defaults (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

  // Build service-id -> category-name map (services may be in multiple categories; take first)
  const attachments = await prisma.droneServiceCategory.findMany({
    include: {
      category: { select: { category_name: true } },
      service: true,
    },
  });

  const catForService = new Map();
  const serviceById = new Map();
  for (const a of attachments) {
    if (!a.service || !a.category) continue;
    if (!catForService.has(a.serviceId)) {
      catForService.set(a.serviceId, a.category.category_name);
      serviceById.set(a.serviceId, a.service);
    }
  }

  console.log(`Services attached to a category: ${catForService.size}\n`);

  let updated = 0, skipped = 0, noCat = 0;
  const byCat = {};

  for (const [svcId, svc] of serviceById.entries()) {
    const catName = catForService.get(svcId);
    const catDefault = CATEGORY_DEFAULTS[catName];
    if (!catDefault) {
      noCat++;
      continue;
    }
    const override = SERVICE_OVERRIDES[normalize(svc.service_name)] || {};
    const merged = { ...catDefault, ...override };

    const patch = {};
    for (const f of ["unit", "uav_type", "rate_on_qty", "feature_needed"]) {
      if (isEmpty(svc[f]) && merged[f]) patch[f] = merged[f];
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    updated++;
    byCat[catName] = (byCat[catName] || 0) + 1;

    if (!dryRun) {
      await prisma.droneService.update({
        where: { id: svcId },
        data: patch,
      });
    } else if (updated <= 5) {
      console.log(`  [sample] ${svc.service_name} [${catName}] patch=${JSON.stringify(patch)}`);
    }
  }

  console.log(`\nPer-category update counts:`);
  for (const [cn, n] of Object.entries(byCat).sort()) {
    console.log(`  ${n.toString().padStart(3)}  ${cn}`);
  }
  console.log(`\nTotals: updated=${updated}  no-change=${skipped}  no-category=${noCat}`);
  console.log(`\n${dryRun ? "DRY RUN complete — no writes applied." : "LIVE run complete."}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
