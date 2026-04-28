/* eslint-disable */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Proposed mapping — category_name → exact service_name[]
const MAP = {
  "Agricultural Spraying / Seeding": [
    "Agrichemical Spray",
    "Agrichemical Crop Spraying",
    "Organic Spray",
    "Seed Dispersal",
  ],
  "Construction Monitoring": [
    "Construction Inspection",
    "Construction Monitoring",
    "AQI Management at Construction Site",
    "Building Facade Inspection",
  ],
  "Drone Shows": [
    "Drone Shows",
    "Drone Light Shows",
    "Swarm Drones for Light Shows",
    "Drone Swarm based Fireworks Show",
    "Entertainment & Celebration Shows",
    "Brand & Corporate Shows",
    "National or Government Shows",
  ],
  "Power Distribution Assets": [
    "Power Substation Inspection",
    "Power Transmission Line Inspection",
    "Powerline and Substation Survey",
    "Substation and Distribution Line Inspection",
    "Substation and Distribution Line Planning",
    "Overhead Line Survey",
  ],
  "Volumetric Analysis": [
    "Volumetric Analysis",
    "Ash Heap Assessment",
    "Bagasse Volumetric Assessment",
    "Coal Yard Monitoring",
    "Lease Boundary Management",
  ],
  "Thermal Inspection": [
    "Thermal Inspection / Fire Prevention",
    "Gas Leak Detection",
    "Flare Stack Inspection",
  ],
  "Security Surveillance": [
    "Surveillance",
    "Surveillance and Security",
    "Pipeline Surveillance (Oil/Gas)",
    "Border Surveillance",
    "Critical Infra Surveillance",
    "Law Enforcement Surveillance",
    "Smart City Surveillance",
    "Riot Control Monitoring",
    "Illegal Activity Monitoring",
    "Crowd Monitoring",
    "Crowd/Activity Monitoring",
    "Event Security and Crowd Management",
    "Defence Reconnaissance",
    "Vehicle Live Tracking",
    "Vehicle Tracking",
  ],
  "Aerial Cinematography": [
    "Film Cinematography",
    "Wedding Cinematography",
    "Wedding Photography",
    "Documentary Filming",
    "Live Event Filming",
    "News Broadcasting",
    "News Gathering (Drone Journalism)",
    "Real Estate Photography",
    "Reality Shows / Live Broadcasting",
    "Stock Footage Creation",
    "360° VR Content",
    "Advertisement Production",
  ],
  "Transmission Lines": [
    "Transmission Line Inspection",
    "Transmission & Distribution (T&D) Asset Mapping",
    "Vegetation Invasion Detection",
  ],
  "Forest Fire Detection": [
    "Forest Fire Detection",
    "Fire Detection and Suppression",
    "Urban Firefighting",
    "Firefighting Drone",
  ],
  "Drone Delivery": [
    "Drone Deliveries",
    "BVLOS Parcel Delivery",
    "Medicine Delivery",
  ],
  "Marine/Watershed Management": [
    "Coastal Mapping (Bathymetry)",
    "Ship Inspection",
    "Ship Monitoring",
    "Waterbody Health Monitoring UAVs",
    "Water Waste Survey",
    "Underwater Bridge Pillar Inspection",
  ],
  "Surveillance (Day)": [],
  "Surveillance (Night)": [],
  "Water/Chemical Spraying": [
    "Chimney Washing / Painting",
    "Solar Panel Cleaning",
    "Structure Painting",
    "Structure Pressure Washing",
    "Asset Painting and Washing",
    "Train Washing Drones",
    "UAV based Fog Dispersal",
  ],
  "Monitoring/Testing/Detection": [
    "Crop Monitoring",
    "Yield Prediction",
    "Control Area Monitoring and Yield Estimation",
    "Livestock Monitoring",
    "Anti-Poaching Patrols",
    "Animal Tracking (Wildlife Study)",
    "Environmental Assessment",
    "Environmental Studies and Services",
    "Right-of-Way Planning",
  ],
  "Miscellaneous": [
    "Helium Balloons for Advertising",
  ],
  "Drone Based Inspection": [
    "Bridge Inspection",
    "Oil Rig Inspection",
    "Pipeline Monitoring",
    "Railway Bridge Inspections",
    "Railway Inspection",
    "Railway Track Inspection",
    "Solar Panel Inspection",
    "Telecom Tower Inspection",
    "Ropeway Inspection",
    "Tunnel Inspection",
    "Wind Farm Inspection",
    "Wind Turbine Blade Inspection",
    "Pilot Follow-Ahead Drone for Railways",
  ],
  "Town Planning and Smart Cities": [
    "Route Planning and Traffic Management",
    "Land Survey for Revenue",
    "Land Survey for Hydrological Assessment",
    "Route Planning",
    "GPR Survey of Utilities",
    "Flood Management",
    "Encroachment Detection",
    "Road Health Monitoring",
    "Asset Inspection",
    "Traffic Management",
    "Land assessment and survey",
    "Digital Twin & 3D Models",
  ],
};

// Category shortDesc fixes (only where clearly wrong)
const SHORT_DESC_FIX = {
  "Drone Shows":
    "Synchronized swarm drone light shows and aerial entertainment for events, festivals, and corporate launches.",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== remap-services (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

  // Resolve all categories
  const allCats = await prisma.serviceCategory.findMany();
  const catByName = new Map(allCats.map((c) => [c.category_name, c]));

  // Resolve all services (names can be duplicated in this DB — take first match by name)
  const allSvcs = await prisma.droneService.findMany({
    select: { id: true, service_name: true },
  });
  const normalize = (n) =>
    (n || "").replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const svcByName = new Map();
  for (const s of allSvcs) {
    const key = normalize(s.service_name);
    if (!svcByName.has(key)) svcByName.set(key, s.id);
  }

  let summary = [];

  for (const [catName, svcNames] of Object.entries(MAP)) {
    const cat = catByName.get(catName);
    if (!cat) {
      summary.push(`  [MISS] category not found: "${catName}"`);
      continue;
    }

    const targetIds = [];
    const missing = [];
    for (const sn of svcNames) {
      const id = svcByName.get(normalize(sn));
      if (id) targetIds.push(id);
      else missing.push(sn);
    }

    // Current attachments
    const current = await prisma.droneServiceCategory.findMany({
      where: { categoryId: cat.id },
      select: { id: true, serviceId: true },
    });
    const currentIds = new Set(current.map((x) => x.serviceId));
    const targetSet = new Set(targetIds);

    const toRemove = current.filter((x) => !targetSet.has(x.serviceId));
    const toAdd = targetIds.filter((id) => !currentIds.has(id));

    summary.push(
      `  [${cat.priorty}] ${catName} — keep=${
        current.length - toRemove.length
      } remove=${toRemove.length} add=${toAdd.length}${
        missing.length ? " MISSING:" + missing.length : ""
      }`,
    );
    if (missing.length) {
      for (const m of missing) summary.push(`        · service not found: "${m}"`);
    }

    if (!dryRun) {
      if (toRemove.length) {
        await prisma.droneServiceCategory.deleteMany({
          where: { id: { in: toRemove.map((x) => x.id) } },
        });
      }
      for (const sid of toAdd) {
        await prisma.droneServiceCategory.create({
          data: { categoryId: cat.id, serviceId: sid },
        });
      }
    }
  }

  // Apply shortDesc fixes
  for (const [catName, newShortDesc] of Object.entries(SHORT_DESC_FIX)) {
    const cat = catByName.get(catName);
    if (!cat) continue;
    summary.push(
      `  shortDesc fix on "${catName}": "${(cat.shortDesc || "").slice(0, 60)}..." → "${newShortDesc.slice(0, 60)}..."`,
    );
    if (!dryRun) {
      await prisma.serviceCategory.update({
        where: { id: cat.id },
        data: { shortDesc: newShortDesc },
      });
    }
  }

  console.log(summary.join("\n"));
  console.log(`\n${dryRun ? "DRY RUN complete — no writes applied." : "LIVE run complete."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
