# MongoDB Adaptation Decisions

The FRD's data model is written in PostgreSQL terms (PostGIS, BIGSERIAL,
JSONB, BIGINT, GIST indexes, immutability triggers). Your existing
`schema.prisma` uses `provider = "mongodb"`, so a literal port isn't
possible. This file records every place we deliberately deviated from
the FRD, what we chose instead, and why — so the next engineer can
trace the reasoning back to a specific document line.

## Decisions

### 1. Identifiers: `BIGSERIAL` → `String @db.ObjectId`
- **FRD says:** `id BIGSERIAL PRIMARY KEY`
- **We do:** `id String @id @default(auto()) @map("_id") @db.ObjectId`
- **Why:** MongoDB has no `BIGSERIAL`. ObjectId is the native primary
  key and matches the convention already in use throughout the
  existing `schema.prisma` (User, Vendor, Order, etc.). Mixing
  ObjectId-based and integer-based IDs in one app would be a footgun.

### 2. Geometry: `GEOMETRY(POLYGON, 4326)` → `Json` (GeoJSON)
- **FRD says:** PostGIS GEOMETRY column with GIST index
- **We do:** Native GeoJSON in a `Json` field, indexed with `2dsphere`
- **Why:** MongoDB has first-class GeoJSON support. The
  `$geoIntersects` operator covers every spatial query the FRD
  requires (coverage check IoU, point-in-polygon, etc.). There is
  no functional loss vs. PostGIS for this module's use cases.
- **Consequence:** Coverage IoU computation isn't directly returned
  by Mongo's spatial operators — we'll compute it in TypeScript using
  `@turf/turf` in Phase 3. This is documented up-front so it's not a
  surprise then.

### 3. Money: `BIGINT` paise → `Int` paise
- **FRD says:** `BIGINT NOT NULL` for paise amounts
- **We do:** `Int` (32-bit signed → max 2,147,483,647 paise = ~₹2.14 cr)
- **Why:** The largest single quote in any realistic Phase-1 scenario
  is well under ₹1 crore. `Int` keeps the JSON serialisation simple
  (no `BigInt` JSON edge cases on the API boundary).
- **Exception:** `DataSubmission.totalBytes` IS a `BigInt`, because
  50 GB = 53,687,091,200 bytes — comfortably above 32-bit range.
- **Future safeguard:** If any aggregate sum (e.g. monthly payouts)
  approaches the Int ceiling, we can migrate to `BigInt` per-field
  later. Storing as paise is the more important decision.

### 4. JSONB → `Json`
- **FRD says:** `JSONB`
- **We do:** Prisma `Json`
- **Why:** Direct equivalent. Prisma `Json` on MongoDB stores native
  BSON documents, which gives us indexable, queryable nested fields
  if we ever need them.

### 5. `String[]` arrays
- **FRD says:** PostgreSQL native arrays (`TEXT[]`, `VARCHAR(64)[]`)
- **We do:** Prisma `String[]` and `RejectionReason[]`
- **Why:** MongoDB stores arrays natively; Prisma supports them on
  Mongo. No adaptation needed.

### 6. Audit-log immutability: DB trigger → service-layer enforcement
- **FRD says:** "Database trigger preventing UPDATE and DELETE on
  audit_log" (§15.3)
- **We do:** Service-layer enforcement: only `auditLog.create` is
  exposed; `update` and `delete` methods are not implemented in the
  audit repository.
- **Why:** MongoDB does not support DDL-level triggers. The closest
  equivalent (change streams) is a reactive notification system, not
  a write-block.
- **Compensating controls:**
  1. Audit-log writes go through a single repository class with a
     deliberately narrow public API.
  2. We schedule a daily checksum-rollup job: each day's audit log is
     hashed and the digest written to a separate
     `audit_log_checksums` collection (added in Phase 6).
  3. MongoDB role-based access on the production cluster grants the
     application user `insert` on `audit_log` only — no `update` or
     `delete`.
- **If this is unacceptable:** Move ONLY the audit log to a
  PostgreSQL/SQLite sidecar; the rest of the module stays on Mongo.
  This is a Phase 6 design escape hatch noted in the implementation
  plan.

### 7. Partial unique index — Prisma → raw command
- **FRD says:** `CREATE UNIQUE INDEX ... WHERE active = TRUE`
- **We do:** A `runCommandRaw` call inside our migration script,
  applying a `partialFilterExpression: { active: true }`.
- **Why:** Prisma's `@@unique([...])` doesn't support partial indexes
  on MongoDB at the time of writing. The raw command does the same
  job and runs once at deploy.

### 8. Foreign keys — Prisma `@relation` only
- **FRD says:** `vendor_id BIGINT NOT NULL REFERENCES vendors(id)`
- **We do:** Prisma `@relation(fields: [vendorId], references: [id])`
- **Why:** MongoDB doesn't enforce foreign keys at the storage layer.
  Prisma validates the relation at write time on the application
  side — the same protection as the existing models in your schema.

## Decisions deferred to later phases (not Phase 1)

- **Razorpay idempotency keys** (Phase 6): unique index on
  `(requestId, attemptNumber)` for payouts to prevent double-pay on
  retried API calls.
- **Audit-log checksum rollup** (Phase 6): daily Merkle-style digest.
- **Inspection worker queueing** (Phase 5): we use a Mongo-backed
  queue (`agenda` or similar) instead of Redis to keep the new
  infrastructure footprint minimal.

## What stays exactly per FRD

- All field names (camelCased to match TypeScript convention; the
  underlying snake_case is preserved by `@map` where it matters via
  the collection-level `@@map`).
- All enum values and counts.
- All state-machine transitions (§9.10).
- All numeric thresholds (quality cutoffs, GSD tolerances, NoData
  percentages, retry counts).
- All currency stored in paise.
- All timestamps in UTC.