# Order Management Service

A production-shaped backend for placing orders: `POST /orders` finds a single warehouse that can
fill the whole order (nearest to the shipping address), charges a payment provider, and persists
the order — with correct behavior under concurrency and an idempotent, retry-safe API.

Stack: **TypeScript · Fastify · Postgres · Prisma**. Design rationale lives in [`PRD.md`](./PRD.md).

## Quick start

Requires Node ≥ 22 and Docker.

```bash
cp .env.example .env            # DATABASE_URL, ports (Prisma reads .env)
docker compose up -d postgres   # Postgres on host port 5433
npm install
npx prisma migrate dev          # apply the schema
npx prisma db seed              # warehouses, products, inventory, customers
npm run dev                     # API on http://localhost:3000
```

`npm test` runs the suite (no database needed). `docker compose up` also runs the API in a
container (migrations auto-applied on start); seed it from the host with `npx prisma db seed`.

## Seed data

Stock is overlapping-but-not-identical so warehouse selection is actually exercised.

**Warehouses**

| Warehouse | id | Lat | Lng |
|-----------|-----|-----|-----|
| Bogotá DC | `11111111-1111-1111-1111-111111111111` | 4.7110 | -74.0721 |
| Medellín DC | `22222222-2222-2222-2222-222222222222` | 6.2476 | -75.5658 |
| Cali DC | `33333333-3333-3333-3333-333333333333` | 3.4516 | -76.5320 |

**Products** (price in integer cents)

| Product | id | SKU | Price |
|---------|-----|-----|-------|
| Wireless Mouse | `aaaaaaaa-0000-0000-0000-000000000001` | MOU-001 | 1999 |
| Mechanical Keyboard | `aaaaaaaa-0000-0000-0000-000000000002` | KEY-001 | 7999 |
| USB-C Hub | `aaaaaaaa-0000-0000-0000-000000000003` | HUB-001 | 4599 |
| Laptop Stand | `aaaaaaaa-0000-0000-0000-000000000004` | STA-001 | 2999 |

**Inventory**

| Warehouse | Mouse | Keyboard | Hub | Stand |
|-----------|:-----:|:--------:|:---:|:-----:|
| Bogotá | 100 | 50 | — | — |
| Medellín | 100 | 50 | 80 | 10 |
| Cali | 100 | — | 80 | 10 |

Customers: `cccccccc-0000-0000-0000-000000000001`, `…0002`.

## `POST /orders`

Request:
```json
{
  "customerId": "uuid",
  "shippingAddress": { "line1": "…", "city": "…", "country": "CO", "latitude": 4.71, "longitude": -74.07 },
  "items": [{ "productId": "uuid", "quantity": 2 }],
  "payment": { "cardNumber": "4111111111111111" }
}
```
Optional header `Idempotency-Key: <uuid>` makes the call safe to retry. Shipping `latitude`/`longitude`
are **optional** (sent as a pair); when omitted, the server geocodes the address. See [`PRD.md`](./PRD.md) §6.6.

| Status | When |
|--------|------|
| `201` | Order created and paid |
| `400` | Invalid body (lone coordinate, dup/blank product, quantity < 1, unknown product or customer) |
| `402` | Payment declined |
| `409` | No single warehouse can fill the order |
| `422` | Idempotency-Key reused with a different payload |

A card number ending in `0002` is declined by the mock gateway.

## Examples

```bash
# Happy path → 201 PAID, filled from Bogotá
curl -s -X POST localhost:3000/orders -H 'content-type: application/json' -d '{
  "customerId":"cccccccc-0000-0000-0000-000000000001",
  "shippingAddress":{"line1":"1 Main","city":"Bogotá","country":"CO","latitude":4.711,"longitude":-74.0721},
  "items":[{"productId":"aaaaaaaa-0000-0000-0000-000000000001","quantity":2}],
  "payment":{"cardNumber":"4111111111111111"}}'

# Declined payment → 402
curl -s -X POST localhost:3000/orders -H 'content-type: application/json' -d '{
  "customerId":"cccccccc-0000-0000-0000-000000000001",
  "shippingAddress":{"line1":"1 Main","city":"Bogotá","country":"CO","latitude":4.711,"longitude":-74.0721},
  "items":[{"productId":"aaaaaaaa-0000-0000-0000-000000000001","quantity":1}],
  "payment":{"cardNumber":"4000000000000002"}}'

# Cannot fulfil (exceeds stock at any one warehouse) → 409
curl -s -X POST localhost:3000/orders -H 'content-type: application/json' -d '{
  "customerId":"cccccccc-0000-0000-0000-000000000001",
  "shippingAddress":{"line1":"1 Main","city":"Bogotá","country":"CO","latitude":4.711,"longitude":-74.0721},
  "items":[{"productId":"aaaaaaaa-0000-0000-0000-000000000003","quantity":200}],
  "payment":{"cardNumber":"4111111111111111"}}'

# Idempotent retry → run twice with the same key: same order, charged/decremented once
curl -s -X POST localhost:3000/orders -H 'content-type: application/json' -H 'idempotency-key: demo-1' -d '{
  "customerId":"cccccccc-0000-0000-0000-000000000001",
  "shippingAddress":{"line1":"1 Main","city":"Bogotá","country":"CO","latitude":4.711,"longitude":-74.0721},
  "items":[{"productId":"aaaaaaaa-0000-0000-0000-000000000003","quantity":1}],
  "payment":{"cardNumber":"4111111111111111"}}'

# No coordinates → server geocodes "Medellín" and fills from the Medellín DC
curl -s -X POST localhost:3000/orders -H 'content-type: application/json' -d '{
  "customerId":"cccccccc-0000-0000-0000-000000000001",
  "shippingAddress":{"line1":"1 Main","city":"Medellín","country":"CO"},
  "items":[{"productId":"aaaaaaaa-0000-0000-0000-000000000001","quantity":1}],
  "payment":{"cardNumber":"4111111111111111"}}'
```

## Design highlights

Full rationale in [`PRD.md`](./PRD.md). The parts worth calling out:

- **No overselling under concurrency.** Stock is reserved with an atomic conditional decrement
  (`UPDATE … WHERE quantity >= n`) inside a transaction; a lost race rolls back. Decrements run in a
  deterministic `productId` order to avoid deadlocks.
- **Reserve → charge → confirm (a small saga).** Inventory is reserved and the order created in one
  transaction; the payment call happens *outside* it (so locks aren't held across network I/O); a
  decline compensates by restoring stock.
- **Idempotency** via an insert-first `Idempotency-Key` claim with store-and-replay.
- **Ports & adapters.** The use-case depends on interfaces (`PaymentGateway`, `Geocoder`,
  repositories) wired in `composition-root.ts`; it has no Prisma, HTTP, or provider imports.
- **Geocoding.** Shipping coordinates are taken from the request when present; otherwise the address
  is geocoded behind the `Geocoder` port.
- **Money** is integer minor units (cents), computed server-side from the product catalogue.

## Layout

```
src/
  domain/          pure business logic + errors (distance, order errors)
  application/     use-cases (CreateOrder) + ports (interfaces)
  infrastructure/  adapters: Prisma repositories, mock payment gateway, mock geocoder
  http/            Fastify server, routes, controller, error mapping
  composition-root.ts   wires the object graph
prisma/            schema, migrations, seed
tests/             unit + HTTP-level tests (in-memory fakes)
```
