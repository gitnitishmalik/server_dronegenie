/**
 * Ceiling-rate seed — FRD Appendix D
 *
 * Seeds the imagery_ceiling_rates collection with the proposed RGB
 * baseline from Appendix D, plus reasonable starting points for the
 * other sensor classes so the pricing engine has a value to look up
 * during development. All rates are illustrative and subject to
 * Sponsor sign-off (Open Question Q-02 in the FRD).
 *
 * Run:
 *     cd server
 *     npx ts-node prisma/seed-ceiling-rates.ts
 *
 * Idempotent: deactivates all existing rates first, then inserts the
 * baseline as the new active set. The deactivated rows are kept for
 * audit-trail purposes per FRD §9.3 (active=false is soft-delete).
 */

import { PrismaClient, SensorClass, ResolutionTier, GsdTier, Season } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------
// Replace this with the ObjectId of any admin user in your User table.
// In a real deploy this would come from the seeded admin account.
// ---------------------------------------------------------------------
const SEED_ADMIN_ID = process.env.SEED_ADMIN_ID ?? '000000000000000000000001';

// FRD Appendix D — RGB Medium-resolution baseline, INR per km²
// Rows = GSD tier, Columns = Season
type RateMatrix = Record<GsdTier, Record<Season, number>>;

const RGB_MEDIUM: RateMatrix = {
  SURVEY_GRADE:     { WINTER: 28_000, SUMMER: 24_000, MONSOON: 20_000, POST_MONSOON: 26_000 },
  MAPPING_GRADE:    { WINTER: 22_000, SUMMER: 18_000, MONSOON: 15_000, POST_MONSOON: 20_000 },
  INSPECTION_GRADE: { WINTER: 15_000, SUMMER: 12_000, MONSOON: 10_000, POST_MONSOON: 13_000 },
  RECONNAISSANCE:   { WINTER:  8_000, SUMMER:  6_500, MONSOON:  5_500, POST_MONSOON:  7_000 },
};

// Other sensor classes are scaled multiples of the RGB baseline.
// These are placeholder factors only — replace with commercial values
// once Sponsor sign-off provides a complete schedule.
const SENSOR_MULTIPLIERS: Partial<Record<SensorClass, number>> = {
  RGB:           1.00,
  MSI:           1.80,    // multispectral commands a premium
  THERMAL:       2.20,
  HYPERSPECTRAL: 3.50,
  SAR:           2.60,
  // LIDAR omitted — Phase 1 doesn't price LiDAR (FRD O-04)
};

const RESOLUTION_TIERS: ResolutionTier[] = [
  'ULTRA_HIGH', 'HIGH', 'MEDIUM', 'STANDARD',
];

// Resolution-tier multipliers (Ultra-high commands more, Standard less)
const RESOLUTION_MULTIPLIERS: Record<ResolutionTier, number> = {
  ULTRA_HIGH: 1.60,
  HIGH:       1.25,
  MEDIUM:     1.00,
  STANDARD:   0.70,
};

async function main() {
  console.log('→ Seeding imagery_ceiling_rates...\n');

  // Step 1: deactivate the existing active set (soft-delete for audit)
  const deactivated = await prisma.imageryCeilingRate.updateMany({
    where: { active: true },
    data:  { active: false, updatedById: SEED_ADMIN_ID },
  });
  if (deactivated.count > 0) {
    console.log(`  · deactivated ${deactivated.count} previous rate(s)`);
  }

  // Step 2: build the full cross-product
  const now = new Date();
  const rows: any[] = [];

  for (const sensor of Object.keys(SENSOR_MULTIPLIERS) as SensorClass[]) {
    const sensorMult = SENSOR_MULTIPLIERS[sensor]!;

    for (const resolution of RESOLUTION_TIERS) {
      const resMult = RESOLUTION_MULTIPLIERS[resolution];

      for (const gsd of Object.keys(RGB_MEDIUM) as GsdTier[]) {
        for (const season of Object.keys(RGB_MEDIUM[gsd]) as Season[]) {
          const baseInr = RGB_MEDIUM[gsd][season];
          const inr     = Math.round(baseInr * sensorMult * resMult);
          const paise   = inr * 100;        // FRD §9.1: store in paise

          rows.push({
            sensorClass:    sensor,
            resolutionTier: resolution,
            gsdTier:        gsd,
            season,
            rateInrPerKm2:  paise,
            effectiveFrom:  now,
            effectiveTo:    null,
            active:         true,
            createdById:    SEED_ADMIN_ID,
            updatedById:    SEED_ADMIN_ID,
          });
        }
      }
    }
  }

  // Step 3: bulk insert
  const result = await prisma.imageryCeilingRate.createMany({ data: rows });
  console.log(`  ✓ inserted ${result.count} active ceiling-rate rows`);

  // Step 4: spot-check
  const sample = await prisma.imageryCeilingRate.findFirst({
    where: {
      sensorClass:    'RGB',
      resolutionTier: 'MEDIUM',
      gsdTier:        'MAPPING_GRADE',
      season:         'WINTER',
      active:         true,
    },
  });
  console.log('\n  sanity check — RGB / MEDIUM / MAPPING_GRADE / WINTER:');
  console.log(`    expected: ₹${22000}/km²  (= ${2200000} paise)`);
  console.log(`    actual  : ₹${(sample?.rateInrPerKm2 ?? 0) / 100}/km²  (= ${sample?.rateInrPerKm2} paise)`);

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());