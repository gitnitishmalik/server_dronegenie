# Patches to your existing schema.prisma

The new module declares relations FROM `DataProcurementRequest` TO your
existing `Vendor` model. Prisma requires the back-reference on `Vendor`
or `prisma generate` will fail with `Error validating model "Vendor":
The relation field ... is missing an opposite relation field`.

You only need ONE one-line change to your existing schema:

---

## In your existing `model Vendor { ... }`

Add this single field anywhere inside the relations section
(near `BankDetails`, `VendorService`, `documents`, etc.):

```prisma
model Vendor {
  // ... all your existing fields stay exactly as they are ...

  user                    User                      @relation(fields: [userId], references: [id])
  BankDetails             BankDetails[]
  VendorService           VendorService[]
  documents               VendorDocument[]
  bidReply                BidReply[]
  orders                  Order[]

  // 👇 ADD THIS ONE LINE
  dataProcurementRequests DataProcurementRequest[]
}
```

That's it. No other existing model needs touching.

---

## Why we don't add anything to `User`

The Data Procurement module identifies actors by:
- `vendorId` → `Vendor.id` (the seller)
- `actorId`  → `User.id` (admin/finance/QA), but stored loosely as
  `String @db.ObjectId` WITHOUT a Prisma relation, because the
  audit log can refer to deleted users and we don't want a cascade
  constraint.

So `User` stays exactly as it is.

---

## After making this change

```bash
cd server
npx prisma format            # tidy up
npx prisma generate          # regenerate the client
npx prisma db push           # sync MongoDB (no migration files needed)
```

Then run the spatial-index script (next file: `mongo-indexes.md`).