# Phase 1 — Data Procurement Module: Database Schema

This is the **database foundation** for the Data Procurement Agent
module described in `DroneGenie_Data_Procurement_FRD_v1_0.docx`.

## Files in this drop

| File | Purpose |
|---|---|
| `data-procurement.schema.prisma` | The 7 new models + 11 enums to append to your existing `schema.prisma`. |
| `vendor-relation-patch.md` | The single one-line addition to your existing `Vendor` model. |
| `migrations/001_data_procurement_indexes.ts` | Creates 2dsphere + partial-unique indexes that Prisma can't express on MongoDB. |
| `seed-ceiling-rates.ts` | Seeds the pricing table from FRD Appendix D. |
| `mongo-vs-postgres-decisions.md` | Why we adapted certain FRD specs for MongoDB. |

## How to apply (5 steps, ~3 minutes)

```bash
cd server

# 1. Append data-procurement.schema.prisma into prisma/schema.prisma
#    (everything between BEGIN APPEND and END APPEND markers)
cat prisma/data-procurement.schema.prisma >> prisma/schema.prisma

# 2. Apply the one-line patch to your Vendor model
#    (see vendor-relation-patch.md — manual edit)

# 3. Format and generate
npx prisma format
npx prisma generate

# 4. Push to MongoDB
npx prisma db push

# 5. Create spatial indexes + seed ceiling rates
npx ts-node prisma/migrations/001_data_procurement_indexes.ts
SEED_ADMIN_ID=<your-admin-objectid> npx ts-node prisma/seed-ceiling-rates.ts
```

After step 5 you'll have:
- 7 new collections in MongoDB
- 2dsphere indexes on the two geometry-bearing collections
- A partial-unique index on ceiling rates (one active per combo)
- ~480 active ceiling-rate rows ready for the pricing engine

## Sanity check

Quick smoke test in `mongosh`:

```js
use dronegenie

// Confirm collections exist
db.getCollectionNames().filter(n => n.includes('procurement')
  || n.includes('imagery') || n.includes('payouts')
  || n.includes('quality') || n.includes('audit'))

// Confirm 2dsphere index
db.data_procurement_requests.getIndexes()
db.imagery_inventory.getIndexes()

// Confirm seed rates landed
db.imagery_ceiling_rates.countDocuments({ active: true })
// Expected: 480  (5 sensors × 4 resolution × 4 gsd × 4 seasons + a few skipped)
```

## What's in scope for Phase 1 vs later

✅ **In Phase 1 (this drop):**
- All 7 models + 11 enums per FRD §9
- State-machine values per FRD §9.10
- Spatial indexing for coverage check
- Seed data for pricing engine

⏭ **Coming in Phase 2 (NestJS module skeleton):**
- DTOs, validators, guards, the `data-procurement` module
- State-machine helper that enforces FRD §9.10 transitions
- Repository layer with the audit-log immutability contract

⏭ **Coming in Phases 3–8:**
- Boundary parsing, coverage check, pricing engine
- Upload pipeline (browser multipart + server fetch)
- AI inspection (real Stage 1 CV + real Claude VLM)
- RazorpayX payout
- Vendor portal screens
- Admin screens

## Mapping back to the FRD

| FRD section | Implemented by |
|---|---|
| §9.3 imagery_ceiling_rates | `model ImageryCeilingRate` + partial unique index |
| §9.4 data_procurement_requests | `model DataProcurementRequest` + 2dsphere index |
| §9.5 data_submissions | `model DataSubmission` + composite unique on (request, attempt) |
| §9.6 quality_inspections | `model QualityInspection` |
| §9.7 imagery_inventory | `model ImageryInventory` + 2dsphere index |
| §9.8 payouts | `model Payout` |
| §9.9 audit_log | `model AuditLog` (immutability enforced in service layer) |
| §9.10 state machine | `enum RequestState` + (Phase 2) state-machine helper |
| Appendix C tier definitions | `enum ResolutionTier`, `enum GsdTier` |
| Appendix D baseline rates | `seed-ceiling-rates.ts` |