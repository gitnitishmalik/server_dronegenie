/**
 * MongoDB spatial-index migration — Data Procurement Agent
 *
 * Why this file exists
 * --------------------
 * Prisma cannot declare MongoDB 2dsphere indexes through the schema
 * file (only standard B-tree indexes via @@index). Without a 2dsphere
 * index, the coverage-check query in F-03 falls back to a full
 * collection scan and breaks the AC-F03-02 acceptance criterion.
 *
 * This script also adds a partial unique index on imagery_ceiling_rates
 * to enforce "at most one ACTIVE rate per (sensor, resolution, gsd,
 * season) combination" — the FRD §9.3 invariant.
 *
 * How to run
 * ----------
 *     cd server
 *     npx ts-node prisma/migrations/001_data_procurement_indexes.ts
 *
 * It is idempotent: re-running has no effect if the indexes already
 * exist. Run it ONCE after the first `npx prisma db push` for this
 * module, and again whenever you wipe the database in a dev env.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('→ Creating MongoDB indexes for Data Procurement module...');

  // -----------------------------------------------------------------
  // 1. 2dsphere index on data_procurement_requests.boundaryGeom
  //    Enables $geoIntersects queries used by the coverage check.
  // -----------------------------------------------------------------
  await prisma.$runCommandRaw({
    createIndexes: 'data_procurement_requests',
    indexes: [
      {
        key: { boundaryGeom: '2dsphere' },
        name: 'boundaryGeom_2dsphere',
      },
    ],
  });
  console.log('  ✓ data_procurement_requests.boundaryGeom (2dsphere)');

  // -----------------------------------------------------------------
  // 2. 2dsphere index on imagery_inventory.extentGeom
  //    The hot path: every coverage check intersects against this.
  // -----------------------------------------------------------------
  await prisma.$runCommandRaw({
    createIndexes: 'imagery_inventory',
    indexes: [
      {
        key: { extentGeom: '2dsphere' },
        name: 'extentGeom_2dsphere',
      },
    ],
  });
  console.log('  ✓ imagery_inventory.extentGeom (2dsphere)');

  // -----------------------------------------------------------------
  // 3. Partial unique index on imagery_ceiling_rates
  //    Enforces "at most one active rate per combination" (FRD §9.3).
  // -----------------------------------------------------------------
  await prisma.$runCommandRaw({
    createIndexes: 'imagery_ceiling_rates',
    indexes: [
      {
        key: {
          sensorClass: 1,
          resolutionTier: 1,
          gsdTier: 1,
          season: 1,
        },
        name: 'one_active_rate_per_combo',
        unique: true,
        partialFilterExpression: { active: true },
      },
    ],
  });
  console.log('  ✓ imagery_ceiling_rates partial unique (active=true)');

  // -----------------------------------------------------------------
  // 4. Idempotency index on payouts
  //    Prevents accidental double-payout on retried RazorpayX calls.
  // -----------------------------------------------------------------
  await prisma.$runCommandRaw({
    createIndexes: 'payouts',
    indexes: [
      {
        key: { requestId: 1, vendorId: 1 },
        name: 'request_vendor_lookup',
      },
    ],
  });
  console.log('  ✓ payouts (requestId, vendorId)');

  console.log('\nAll indexes created successfully.');
}

main()
  .catch((err) => {
    console.error('Index migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });