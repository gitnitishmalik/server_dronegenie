// One-off: fill descriptions + link drone services for incomplete industries.
// Usage:
//   node scripts/fill-incomplete-industries.js          # dry-run (no writes)
//   node scripts/fill-incomplete-industries.js --apply  # write

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const DESCRIPTIONS = {
  'environmental-studies-and-services':
    "DroneGenie delivers aerial intelligence for environmental monitoring, conservation, and regulatory compliance. Our drones capture high-resolution imagery and multispectral data to assess forest health, track wildlife, map water bodies, detect encroachment, and monitor pollution — safely covering terrain that is remote, hazardous, or ecologically sensitive. Whether you're running an EIA, supporting a conservation programme, or tracking a restoration project over time, our pilots and payloads turn the field into a dataset you can act on.",
  'metals-and-alloys':
    "DroneGenie supports metals, mining, and alloy production operations with aerial surveys, stockpile volumetrics, and inspections of high-risk assets. From ore heap and scrap yard assessments to chimney, flare-stack, and conveyor inspections, our drones capture precise measurements and thermal imagery without taking people into hot, dusty, or elevated work zones. The result: faster plant turnarounds, defensible volumetric audits, and a measurable drop in rope-access and confined-space risk exposure.",
};

const INDUSTRY_SERVICES = {
  'real-estate': [
    'Real Estate Photography',
    'Digital Twin & 3D Models',
    'Ariel Cinematography',
    '360° VR Content',
    'Building Facade Inspection',
    'Construction Monitoring',
    'Volumetric Analysis',
    'Land assessment and survey',
    'Thermal Inspection / Fire Prevention',
  ],
  'environmental-studies-and-services': [
    'Environmental Assessment',
    'Environmental Studies and Services',
    'Waterbody Health Monitoring UAVs',
    'Animal Tracking (Wildlife Study)',
    'Anti-Poaching Patrols',
    'Forest Fire Detection',
    'Vegetation Invasion Detection',
    'Flood Management',
    'Coastal Mapping (Bathymetry)',
    'Water Waste Survey',
  ],
  'logistics': [
    'BVLOS Parcel Delivery',
    'Medicine Delivery',
    'Vehicle Live Tracking',
    'Asset Inspection',
  ],
};

function norm(s) {
  return (s || '').trim().toLowerCase();
}

async function pickCleanService(name) {
  // Candidates match on trimmed, case-insensitive equality.
  const all = await prisma.droneService.findMany({
    select: { id: true, service_name: true, createdAt: true },
  });
  const target = norm(name);
  const matches = all.filter((s) => norm(s.service_name) === target);
  if (matches.length === 0) return null;
  // Prefer the one whose stored name matches exactly (no trailing garbage), else
  // the one without trailing single-letter token (e.g. "... g"), else oldest.
  matches.sort((a, b) => {
    const ea = a.service_name === name ? 0 : 1;
    const eb = b.service_name === name ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return matches[0];
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE — writing to DB ===' : '=== DRY RUN — no writes ===');
  console.log();

  for (const [seo, desc] of Object.entries(DESCRIPTIONS)) {
    const ind = await prisma.industry.findFirst({
      where: { industry_seo_name: seo },
      select: { id: true, industry_name: true, description: true },
    });
    if (!ind) { console.log(`[desc] ${seo}: NOT FOUND`); continue; }
    const current = (ind.description || '').trim();
    if (current.length > 0) {
      console.log(`[desc] ${seo}: already has description (${current.length} chars) — SKIP`);
      continue;
    }
    console.log(`[desc] ${seo}: set description (${desc.length} chars)`);
    if (APPLY) {
      await prisma.industry.update({ where: { id: ind.id }, data: { description: desc } });
    }
  }

  console.log();

  for (const [seo, serviceNames] of Object.entries(INDUSTRY_SERVICES)) {
    const ind = await prisma.industry.findFirst({
      where: { industry_seo_name: seo },
      select: { id: true, industry_name: true },
    });
    if (!ind) { console.log(`[svc]  ${seo}: NOT FOUND`); continue; }

    const existingLinks = await prisma.droneServiceIndustry.findMany({
      where: { industryId: ind.id },
      select: { serviceId: true },
    });
    const existing = new Set(existingLinks.map((x) => x.serviceId));

    console.log(`[svc]  ${seo}  (existing links: ${existing.size})`);

    for (const name of serviceNames) {
      const svc = await pickCleanService(name);
      if (!svc) { console.log(`        - ${name}: SERVICE NOT FOUND`); continue; }
      if (existing.has(svc.id)) {
        console.log(`        . ${name}  (already linked)`);
        continue;
      }
      console.log(`        + ${name}  -> ${svc.id}`);
      if (APPLY) {
        await prisma.droneServiceIndustry.create({
          data: { industryId: ind.id, serviceId: svc.id },
        });
      }
    }
  }

  await prisma.$disconnect();
  console.log();
  console.log(APPLY ? 'Done. Writes committed.' : 'Dry run complete. Re-run with --apply to write.');
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
