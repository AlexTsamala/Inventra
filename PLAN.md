# Inventra ERP — Build Plan (v2)

A wholesale-distribution ERP, built solo, phase by phase, as a learning vehicle for correct ERP
architecture, domain modelling, event-driven design, and production operations.

**Timeline:** ~13 weeks part-time
**Vertical:** industrial and MRO supplies — fasteners, tools, safety equipment, packaging.
Non-perishable, non-serialized, no variants.
**Rule:** ship to production at Phase 6, when the warehouse module is complete.

> **v2 changes:** restructured around the Catalog / Document / Register pattern. The warehouse
> module is now built first and completely, before sales. See §5 ADR-009 for what changed and why.

---

## 0. How to use this document

1. **One phase per working block.** Phase N assumes Phase N-1 is merged and green.
2. **Ask for the explanation before the code.** "Explain what `post()` must guarantee and why,
   then show me the test first."
3. **Test first for anything in `domain/`.** If you can't express the rule as a test, you don't
   understand the rule yet.
4. **Every non-obvious decision becomes an ADR** in `docs/adr/`. Five sentences: context, options,
   decision, consequences, date.
5. **Refuse code you cannot explain.** Delete it, ask for a simpler version.
6. **Write `docs/notes/phase-N.md` before starting the next phase.** Half a page, no code, in your
   own words. This is a comprehension check, not documentation.

### Who writes which code

Claude writes most of this project. That is normal and fine. But reading code and judging it
correct is a weaker skill than producing it — recognition feels like understanding while it's
happening, and the gap only appears in a live interview or a 2am outage.

So the split is by **category**, not by phase:

| Claude writes it fully | **You type it yourself** |
|---|---|
| Config, tooling, Dockerfiles, CI YAML | **`post()` and `unpost()`** |
| Prisma schema and migrations | **Document aggregates and their invariants** |
| CRUD controllers, DTOs, validation | **The locking logic (Phase 4)** |
| Mappers, module wiring, boilerplate | **Every test in `domain/`** |
| React/Angular components, forms, tables | **The saga's compensation paths (Phase 8)** |
| Seed scripts, reports, queries | **The `Money` and `Quantity` value objects** |

The right-hand column is roughly 15% of the codebase and close to 100% of what you'll be asked
about in an interview. It is also fast to type — a document aggregate is 80 lines of pure logic,
not 800 lines of scaffolding. You lose almost no time and gain the thing you are here for.

Phases marked **✍️ TYPE IT YOURSELF** below are where you slow down.

### Two habits that make "I'll validate it" real

- **The close-the-laptop test.** Once per phase, shut everything and rewrite one function from
  memory on a blank file. Structure and reasoning, not perfection. If you can't reconstruct why
  `post()` deletes before it inserts, you read it — you didn't learn it.
- **Debug it yourself first.** When something breaks, spend fifteen minutes forming a hypothesis
  before pasting the stack trace. Debugging transfers most directly to a job and atrophies fastest
  when delegated.

---

## 1. Business context

### The business

Inventra serves **small-to-mid wholesale distributors of industrial and MRO supplies** — bolts,
hand tools, gloves, cleaning chemicals, packaging — sold to construction firms, factories, and
facilities managers.

These businesses run on spreadsheets plus an accounting package. Their core pain is that **stock
numbers lie.** Sales promises inventory the warehouse has already picked for someone else. Nobody
can explain where 40 units went. Invoices go out late.

### The four sentences

> A distributor can see exactly what stock they have, in which warehouse, and explain every unit's
> history. They can take orders from business customers, and the system refuses to promise stock
> that isn't there. When an order ships, an invoice goes out automatically. And they can see who
> owes them money.

Everything in this plan exists to make those sentences true and provable. If a task doesn't serve
one of them, question it.

### Deliberately out of scope

Batches and expiry dates, serial numbers, storage bins, barcodes, multi-currency, multi-company,
payroll, HR, manufacturing/BOM, double-entry general ledger, EDI. Each is real; each would change
the shape of the register schema or double the code. Stated openly in the README.

---

## 2. The architecture in three words

**Everything in this system is a Catalog, a Document, or a Register.** Learn these and the design
follows almost mechanically.

| Block | Answers | Mutable? | Examples |
|---|---|---|---|
| **Catalog** | What exists? | Yes, edit freely | Items, Warehouses, Partners, Users, Reasons |
| **Document** | What happened, and when? | Yes — but must be re-posted | Goods Receipt, Goods Issue, Transfer |
| **Register** | What are the numbers now? | **Never by hand.** Only `post()` writes here | StockOnHand, StockCost, StockReserved |

```
CATALOGS              DOCUMENT                    REGISTER
(reference)           (the event)                 (the numbers)

Item: HEX-M8-50 ─┐
Warehouse: WH1 ──┼──▶  Goods Receipt #17   ═══▶  StockOnHand
Partner: Acme ───┘     03 Aug, 30 pcs             +30 HEX-M8-50 / WH1
```

A document **points at** catalogs and **writes into** registers. Nothing else ever writes into a
register.

### The one rule

**Never store a stock quantity as a number you edit.** Store the movements: `+30`, `+40`, `−20`.
The balance is `SUM(qty_delta)`.

An editable balance will eventually be corrupted by a bug, a race, or a well-meaning user, and
then nobody in the company can explain where the stock went. History cannot lie. This is why banks
store transactions, not balances.

**Corollary:** do not add a cached `on_hand` column "for performance." When `SUM` becomes slow —
at 100,000+ register rows, not before — the fix is a **monthly snapshot table**: store each
month's closing balance and sum only the rows after it. Premature optimisation here destroys the
architecture.

---

## 3. Business requirements

### BR-1 — Tenancy and isolation
- Every catalog, document, and register row belongs to exactly one tenant.
- A user belongs to exactly one tenant.
- Enforced at the database level with Postgres row-level security, not only in application code.
- Tenant identity comes from the authenticated session. Never from a request body or header.

### BR-2 — Users and roles

| Role | Can do |
|---|---|
| Owner | Everything, including inviting users and changing settings |
| Sales rep | Create and edit draft sales orders, view catalogs, cannot override credit limits |
| Warehouse operator | Create and post receipts, issues, transfers, write-offs, stock counts |
| Accountant | Issue invoices, record payments, set credit limits, view all financials |
| Auditor | Read-only everywhere, including the audit log |

Permissions are checked as permissions (`document:post`), not as role-name string comparisons.

### BR-3 — Catalogs
Exactly six. Resist adding fields; you can add them next month, you cannot easily remove a wrong
architecture.

| Catalog | Fields |
|---|---|
| **Items** | id, tenant_id, code, name, unit (pcs/kg/l), item_group_id, is_active |
| **Item Groups** | id, tenant_id, name, parent_id (nestable) |
| **Warehouses** | id, tenant_id, code, name, allow_negative_stock, is_active |
| **Partners** | id, tenant_id, name, tax_id, is_supplier, is_customer — **one table, two flags** |
| **Users** | id, tenant_id, name, login, password_hash, role |
| **Reasons** | id, tenant_id, name (Damaged, Expired, Stolen, Sample) — a list, never free text |

- Item `code` is unique **within a tenant** (composite unique index).
- Case packs come later, in Phase 7 with sales. Phase 2 items are single-unit only.

### BR-4 — Registers
Append-only movement tables. You `INSERT`. You never `UPDATE` a row's values. To undo, you delete
the rows a document created and write new ones — and only `post()` may do that.

**Register 1 — `stock_on_hand`** (physical quantity)

| Column | Meaning |
|---|---|
| id | row id |
| tenant_id | isolation |
| doc_type, doc_id | which document created this row — the audit trail |
| date | when it happened (business date, not insert time) |
| warehouse_id | where |
| item_id | what |
| qty_delta | `+30` incoming, `−20` outgoing. **Signed.** |

**Register 2 — `stock_cost`** (value)
Same shape plus `amount_delta`. Kept separate deliberately: quantity and money answer different
questions and get corrected at different times.

**Register 3 — `stock_reserved`** (Phase 7)
Same shape. Sales orders write here, never into `stock_on_hand`. `available = SUM(on_hand) −
SUM(reserved)`.

**Registers have no user interface. Ever.** Users create documents; the numbers follow.

### BR-5 — The `post()` function
One function, used by every document type. The most important code in the system.

```
post(doc):
  BEGIN TRANSACTION
    lock the (item, warehouse) pairs this document touches   # see BR-6
    DELETE FROM stock_on_hand WHERE doc_type=? AND doc_id=?  # always delete first
    DELETE FROM stock_cost    WHERE doc_type=? AND doc_id=?
    for each line:                                           # check BEFORE writing
      if not warehouse.allow_negative_stock:
        if balance(item, warehouse) + line.delta < 0:
          ROLLBACK → error 'Not enough stock'
    for each line:
      INSERT INTO stock_on_hand (...)
    doc.status = POSTED
    append to audit_log (who, when, action=POST, doc)
  COMMIT
```

- **Delete-first makes re-posting safe** and removes the need for separate edit logic.
- **Unpost** is the same function without the insert step: delete rows, set status `DRAFT`.
- A `DRAFT` document has **zero** effect on stock.
- Posting the same document twice must not double the stock. This is a required test.

### BR-6 — Concurrency (the guide's gap, closed here)
The balance check in `post()` is read-then-write. Under Postgres READ COMMITTED, two concurrent
posts can both read a balance of 10, both pass the check, and both insert `−6`, producing `−2`.

**Decision: `pg_advisory_xact_lock`** on a hash of `(tenant_id, item_id, warehouse_id)`, acquired
in a stable sort order so two documents touching the same items in different orders cannot deadlock.

Rejected: `SERIALIZABLE` with retry-on-serialization-failure. It protects a `SUM` over a range using
predicate locks, and aggregate reads are precisely where Postgres's SSI produces false serialization
failures — you get retry storms from transactions that never truly conflicted. Advisory locks name
the contended resource exactly and the critical section is short.

Accepted cost: advisory locks are opt-in, so a code path that forgets one silently loses protection.
Acceptable here because **only `post()` writes to registers** — there is exactly one place to get
right. Write ADR-012 in Phase 4 *after* watching the failing test oversell, and record what you
rejected.

**Required test:** 20 concurrent posts issuing 6 units each against a balance of 10 → exactly 1
succeeds, 19 fail cleanly. Run it 50 times.

### BR-7 — Documents
Six document types, all with the same two-table shape: **header** (tenant, date, number, status,
warehouse, partner) and **lines** (item, quantity, price).

| # | Document | Effect on `stock_on_hand` |
|---|---|---|
| 1 | **Opening Balance** | `+` the stock you already had on day one. Build first — you need data to test everything else. |
| 2 | **Goods Receipt** | `+` at one warehouse, from a supplier |
| 3 | **Goods Issue** | `−` at one warehouse, to a customer |
| 4 | **Transfer** | `−` at warehouse A and `+` at warehouse B, in one document |
| 5 | **Write-off** | `−` at one warehouse, with a mandatory reason code |
| 6 | **Stock Count** | records what was physically counted, posts only the difference |

Header rules:
- **Document numbers are sequential per tenant, per document type, per year — but NOT gapless.**
  The number is assigned when the draft is created, so an abandoned and deleted draft leaves a gap.
  This is deliberate: internal documents are operational records, not fiscal ones, and a missing
  receipt number has no legal consequence. Contrast BR-11, where invoices are gapless because tax
  authorities require it. Assigning at draft creation also means a draft can be referenced,
  discussed, and printed before it is posted.
- A posted document cannot be deleted — only unposted, then edited, then re-posted.
- Every line requires quantity > 0. Direction is expressed by the document type, not a negative
  quantity entered by a user.

### BR-8 — Costing
**Every posted line writes to `stock_cost`, not only receipts.** That is why `post()` deletes from
both registers.

Weighted average cost is per `(item, warehouse)` and is **computed, never stored**, exactly like
quantity:

```
average_cost(item, warehouse) = SUM(amount_delta) / SUM(qty_delta)
```

| Document | `qty_delta` | `amount_delta` |
|---|---|---|
| Opening Balance | `+qty` | `+qty × cost_per_unit` (**required on each line**) |
| Goods Receipt | `+qty` | `+qty × purchase_price` (the price actually paid) |
| Goods Issue | `−qty` | `−qty × current_average` |
| Write-off | `−qty` | `−qty × current_average` |
| Transfer | `−qty` at A, `+qty` at B | `−qty × average(A)` at A, the **same amount** `+` at B |
| Stock Count surplus | `+qty` | `+qty × current_average` |
| Stock Count shortage | `−qty` | `−qty × current_average` |

Rules:
- The average is read **inside** `post()`, under the same advisory lock as the quantity check.
  Reading it outside the lock reintroduces the race.
- Opening Balance lines require an explicit unit cost — there is no prior average to derive one from.
- A transfer moves value between two warehouse averages; total company value is unchanged.
- **Undefined-average guard:** if `SUM(qty_delta) <= 0` for the pair (possible when
  `allow_negative_stock` is on), use the last non-zero average; if none exists, write
  `amount_delta = 0` and record a warning in the audit log. Never divide by zero.

**Known limitation — accepted, documented, deferred.** Cost is computed at post time and frozen
into the row. Back-dating or re-posting an earlier receipt leaves every later issue valued at a
stale average. Real ERPs fix this with a chronological cost-recalculation run over all documents
after a given date. That is a Phase 12+ concern; until then it is a stated limitation in the README,
not a hidden bug.

Stock valuation report = `SUM(amount_delta)`.

### BR-9 — Reports
All three read from the same register. That's the payoff.

| Report | Shows | Built from |
|---|---|---|
| **Stock Balance** | current quantity per item per warehouse | `SUM(qty_delta) GROUP BY item, warehouse` |
| **Item Card** | every movement of one item in date order with a running balance | rows for that item, ordered by date |
| **Turnover** | opening, total in, total out, closing for a period | sums of positives and negatives between two dates |

Balance on any past date is `AND date <= '2026-06-30'`. Full history for free.

### BR-10 — Sales orders (Phase 7)
- Lifecycle: `DRAFT → PLACED → CONFIRMED → PICKING → SHIPPED → COMPLETED`, plus `CANCELLED` and
  `BACKORDERED`.
- Confirming an order posts into `stock_reserved`, not `stock_on_hand`.
- Shipping creates a **Goods Issue document**, which releases the reservation and posts to
  `stock_on_hand`. The order does not write to registers directly — it produces a document.
- Order lines are immutable once `CONFIRMED`.
- All money as integer minor units via a `Money` value object. No floats, ever.
- **Credit limit:** cannot confirm if `outstanding invoices + this order > credit limit`, unless an
  Accountant explicitly overrides, which is recorded in the audit log.
- Reservations expire after 30 minutes if unconfirmed.

### BR-11 — Invoicing (Phase 9)
- Issued when an order reaches `SHIPPED`.
- **Gapless sequential numbers per tenant per year** — the one place in the system where gaps are
  forbidden, because invoices are fiscal documents. Advisory lock or `SELECT … FOR UPDATE` on a
  counter row. Never `MAX(number) + 1`.
- **The number is assigned at issue, never at draft.** A draft invoice has no number. This is what
  makes gaplessness achievable — a number is only consumed once the document is real.
- An issued invoice is **never deleted**. It is voided by a credit note, and its number stays used.
  This is the practical difference from BR-7's documents, which may be unposted, edited, deleted.
- PDF generated asynchronously, stored in object storage, referenced by key.
- Status: `OPEN`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`.

### BR-12 — Audit
- Separate append-only `audit_log` table with no update or delete path, enforced by database
  permissions.
- Records post, unpost, catalog edits, credit-limit overrides: who, when, what, from → to.
- This exists **because** `post()` deletes register rows. The register tells you the current truth;
  the audit log tells you who changed it.

---

## 4. Ubiquitous language

| Term | Meaning | Not to be confused with |
|---|---|---|
| **Tenant** | A distributor company using the platform | Partner |
| **Partner** | A supplier or customer of the tenant | Tenant, User |
| **Catalog** | A reference list that documents point at | Product catalog (marketing sense) |
| **Document** | A recorded business event with header + lines | Order (an order is one kind) |
| **Register** | Append-only table of movements | Report, table |
| **Post** | Write a document's movements into registers | Save, submit |
| **Unpost** | Remove a document's movements; return it to draft | Delete, cancel |
| **On hand** | `SUM(qty_delta)` from `stock_on_hand` | Available |
| **Reserved** | `SUM(qty_delta)` from `stock_reserved` | Allocated |
| **Available** | on hand − reserved | On hand |
| **Movement** | One register row | Document |
| **Issue** | Stock leaving a warehouse | Shipment (the business event) |
| **Receipt** | Stock entering a warehouse | Purchase order (the intent) |

---

## 5. Architecture decisions

Write each as an ADR in `docs/adr/` as you reach it.

**ADR-001 — Modular monolith first, extract selectively.** All contexts start as modules in one
deployable with enforced boundaries. Notifications (Phase 8) and Reporting (Phase 11) are extracted
because they have genuinely different scaling and failure characteristics. Nothing else.

**ADR-002 — REST + OpenAPI, not tRPC or GraphQL.** tRPC assumes one TypeScript project owns both
ends; NestJS doesn't fit that shape and Angular can't consume it. `@nestjs/swagger` → `orval` →
`packages/api-client`.

**ADR-003 — Thin BFF inside Next.js.** Route Handlers hold the httpOnly session cookie; tokens
never reach browser JavaScript. No separate BFF deployment.

**ADR-004 — Caddy as the only reverse proxy.** Extracted services are reached over RabbitMQ, not
synchronously. No API gateway, no service mesh.

**ADR-005 — Prisma as a persistence adapter behind explicit mappers.** Prisma has no identity map
or unit of work. Prisma models stay in `infrastructure/`; hand-written mappers convert at the
boundary. Repository interfaces live in the domain.

**ADR-006 — Transactional outbox, not dual writes.** Domain events commit in the same transaction
as the state change, to an `outbox` table. A relay publishes to RabbitMQ. Consumers are idempotent.

**ADR-007 — RabbitMQ for workflow; Kafka (Redpanda) for the analytics stream.** RabbitMQ handles
the fulfilment saga, notifications, retries, DLQ. Phase 11 adds Kafka specifically because
replayable log semantics are what rebuilding a read model needs.

**ADR-008 — Terraform written and validated in CI, never applied.** No budget for managed AWS.
MinIO provides the S3 API. The ECS/RDS/S3 stack is real code, `terraform validate`-ed in CI, but
deployment is a single VPS with Docker Compose. Stated openly in the README.

**ADR-009 — Catalog / Document / Register, and no cached balance.** *(new in v2)* Stock balance is
always `SUM(qty_delta)`. There is no maintained `on_hand` column. When it becomes slow at 100k+
rows, the fix is a monthly snapshot table, never an editable balance. Rejected alternative: a
projection updated alongside the ledger — it reintroduces exactly the drift the ledger exists to
prevent.

**ADR-010 — The Document is the aggregate root; the Register is the ledger.** *(new in v2)* DDD
tactical patterns apply to documents: a `GoodsIssue` protects its own invariants (non-empty lines,
positive quantities, cannot post twice, sufficient stock). `post()` is the aggregate's operation
and the transactional boundary. Registers are not aggregates — they are append-only facts. This
replaces v1's `StockItem` aggregate, which conflated the two.

**ADR-011 — Delete-and-reinsert posting, plus a separate immutable audit log.** *(new in v2)*
Re-posting deletes a document's register rows and writes new ones, which gives edit/undo/re-post
from one code path. Consequence: the register is append-only in *operation* but not immutable in
*history*, so a separate `audit_log` records the posting actions themselves.

**ADR-012 — Explicit locking in `post()`.** *(new in v2)* The balance check is read-then-write and
races under READ COMMITTED. Advisory transaction locks on `(tenant, item, warehouse)`, acquired in
sorted order, or SERIALIZABLE with retry. Proven by a concurrency test, not by reasoning.

---

## 6. Tech stack

- **Node 22 LTS**, **TypeScript 5.x** strict, `noUncheckedIndexedAccess`
- **pnpm** workspaces + **Turborepo**
- **NestJS 11** with the **Fastify** adapter
- **Prisma** + **PostgreSQL 17** with row-level security
- **Zod** for validation, shared via `packages/contracts` (`nestjs-zod` bridges into Nest + Swagger)
- **@nestjs/jwt** + **Passport** + **argon2** — auth hand-rolled deliberately
- **@golevelup/nestjs-rabbitmq** — better routing/retry/DLQ control than Nest's built-in transport
- **BullMQ** + **Redis** — reservation expiry, overdue sweeps
- **nestjs-pino** logging, **nestjs-cls** for correlation IDs
- **pdfmake** for invoices (no headless Chromium on a small VPS)
- **@aws-sdk/client-s3** pointed at **MinIO**
- **Vitest** (domain, no DB, sub-second) · **Testcontainers** (integration) · **Supertest** ·
  **Playwright**
- **Next.js 15** App Router, **TanStack Query**, **TanStack Table**, **react-hook-form**,
  **Tailwind** + **shadcn/ui**
- **Caddy**, **GitHub Actions**, **OpenTelemetry** → **Grafana LGTM**, **Terraform**
- Phase 13: **Angular 20** standalone + signals, **PrimeNG**

---

## 7. Repository structure

```
inventra/
├── apps/
│   ├── api/
│   │   └── src/modules/
│   │       ├── identity/        # simple layering
│   │       ├── catalogs/        # simple layering — the six catalogs
│   │       ├── registers/       # register schema, balance queries, snapshot logic
│   │       ├── documents/       # ← full DDD: document aggregates + post()
│   │       │   ├── domain/          # aggregates, VOs, events, repo interfaces — NO framework imports
│   │       │   ├── application/     # use cases
│   │       │   ├── infrastructure/  # Prisma repos, mappers, locking, outbox writer
│   │       │   └── presentation/    # controllers, DTOs
│   │       ├── sales/           # ← full DDD — Phase 7
│   │       ├── invoicing/
│   │       ├── reports/         # read-only query handlers
│   │       └── shared/          # Money, Quantity, Result, DomainEvent, audit, outbox
│   ├── notifications/           # extracted — Phase 8
│   ├── reporting/               # extracted — Phase 11
│   ├── storefront/              # Next.js + BFF route handlers
│   └── back-office/             # Angular — Phase 13
├── packages/
│   ├── contracts/               # versioned Zod schemas for integration events
│   ├── api-client/              # generated by orval
│   ├── eslint-config/
│   └── tsconfig/
├── infra/
│   ├── docker/
│   └── terraform/
├── docs/
│   ├── adr/
│   ├── domain/                  # event storming, context map, deployment diagram
│   └── notes/                   # your phase write-ups
├── .github/workflows/
├── CLAUDE.md
├── PLAN.md
└── README.md
```

Enforce layering with `dependency-cruiser` in CI from Phase 0. Discipline is not a mechanism.

---

## 8. Local infrastructure

| Service | Purpose | Added in |
|---|---|---|
| `postgres` | Everything | Phase 0 |
| `redis` | BullMQ | Phase 7 |
| `rabbitmq` (management) | Broker + UI on :15672 | Phase 8 |
| `mailpit` | Catches outbound email | Phase 8 |
| `minio` | S3-compatible storage | Phase 9 |
| `redpanda` | Kafka-compatible log | Phase 11 |
| `grafana-lgtm` | Traces, metrics, logs | Phase 11 |
| `caddy` | Reverse proxy | Phase 6 |

Fits in roughly 6 GB. Use compose profiles for the heavier Phase 11 services.

---

## 9. Build phases

### Phase 0 — Foundations (3–4 days)

**Goal:** a monorepo where an empty app builds, tests, lints, and passes CI.

- [ ] pnpm workspace, Turborepo pipeline, shared tsconfig + ESLint packages
- [ ] `apps/api` — NestJS + Fastify, `/health` returning build SHA
- [ ] `apps/storefront` — Next.js, one page calling `/health`
- [ ] `docker-compose.yml` with Postgres
- [ ] Prisma initialised, one throwaway migration, connection verified
- [ ] Vitest configured, one passing test
- [ ] GitHub Actions: install → lint → typecheck → test → build on every PR
- [ ] `dependency-cruiser`: `domain/` may not import `infrastructure/`
- [ ] `docs/adr/0001-modular-monolith.md`, in your words

**Done when:** a PR runs green in under three minutes.

**Explain:** why Turborepo's cache makes a monorepo viable; what the Fastify adapter changes; why
architecture rules belong in CI and not a review checklist.

---

### Phase 1 — Identity and tenancy (4–5 days)

- [ ] Schema: `Tenant`, `User`, `Role`, `Permission`, `RefreshToken`
- [ ] Registration creates tenant + Owner in one transaction
- [ ] argon2id password hashing with sensible parameters
- [ ] Access JWT (15 min) + rotating refresh token (7 days)
- [ ] Refresh reuse detection — a reused token revokes the whole family
- [ ] `TenantContext` via `nestjs-cls`, populated by a guard from the JWT
- [ ] **Postgres RLS** on every tenant-owned table; Prisma sets `app.current_tenant` per transaction
- [ ] Permission guard: `@RequirePermission('document:post')`
- [ ] User invitation (email logged to console until Phase 8)
- [ ] **Test: Tenant A cannot read Tenant B's rows even with a query deliberately missing the
      tenant filter**

**Done when:** that last test passes. It is the whole phase.

**Explain:** refresh rotation and reuse detection; RLS as defence in depth; argon2 vs bcrypt; why
tenant identity never comes from client input.

---

### Phase 2 — The six catalogs (3–4 days)

**Goal:** reference data. Simple layering, no aggregates. Resist adding fields.

- [ ] Schema for Items, Item Groups, Warehouses, Partners, Users, Reasons — exactly the fields in BR-3
- [ ] Item `code` unique per tenant (composite index — understand why, not just that)
- [ ] Item Groups nest via `parent_id`; a tree endpoint and a guard against cycles
- [ ] Partners: one table with `is_supplier` / `is_customer` flags
- [ ] Warehouses carry `allow_negative_stock` — the flag `post()` will read
- [ ] CRUD endpoints, Zod validation, OpenAPI annotations
- [ ] `orval` generating `packages/api-client`
- [ ] Back-office screens: item list with search, item groups tree, warehouses, partners
- [ ] Seed: 2 tenants, ~150 real MRO SKUs (`HEX-M8-50-ZN`, `GLV-NIT-L`, `TAPE-DUCT-48`),
      3 warehouses, 20 partners, 5 reasons

**Done when:** you can manage all six catalogs through the UI with realistic data.

**Explain:** why a catalog is freely editable but a register is not; why suppliers and customers
share a table; what a composite unique index does that two separate ones don't.

---

### Phase 3 — Registers, `post()`, and the first document (6–7 days) ← **the heart**

**Goal:** the pattern the entire ERP is built on. Get this right and the rest is repetition.

> ✍️ **TYPE IT YOURSELF:** `post()`, `unpost()`, the `OpeningBalance` aggregate, the `Quantity`
> value object, and every test in this phase. Let Claude write the Prisma schema, the migration,
> the controller, the UI, and the balance query. If you type nothing else in this project, type
> `post()`.

- [ ] Register tables `stock_on_hand` and `stock_cost` — **no screens, ever**
- [ ] Index on `(tenant_id, warehouse_id, item_id, date)` — the shape every query uses
- [ ] `BalanceQuery`: `SUM(qty_delta)` per item/warehouse, optional as-of date
- [ ] **Domain layer** (no framework imports):
  - [ ] `Quantity` value object — positive, unit-aware
  - [ ] `DocumentStatus` — `DRAFT` / `POSTED`, with legal transitions only
  - [ ] `OpeningBalance` document aggregate: header + lines, invariants (≥1 line, qty > 0,
        no duplicate item/warehouse pairs)
  - [ ] Domain events: `DocumentPosted`, `DocumentUnposted`
  - [ ] `IDocumentRepository`, `IRegisterWriter` interfaces
- [ ] **`post()` implemented once**, exactly as BR-5:
  - [ ] single transaction
  - [ ] advisory locks on sorted `(tenant, item, warehouse)` keys (ADR-012)
  - [ ] delete this document's register rows first
  - [ ] validate all lines before writing any
  - [ ] insert movements, set `POSTED`, append to `audit_log`
- [ ] `unpost()` — same minus the insert
- [ ] `audit_log` table, append-only, `REVOKE UPDATE, DELETE` at the database role level
- [ ] Opening Balance UI: header + line editor, Post and Unpost buttons
- [ ] **Stock Balance report** — the first time you see numbers on screen
- [ ] Tests:
  - [ ] posting twice does not double the stock
  - [ ] unposting returns the balance to zero
  - [ ] edit → re-post gives the corrected balance with no manual recalculation
  - [ ] a `DRAFT` document contributes nothing

**Done when:** the guide's proof test passes — post a receipt of 100, post an issue of 40, edit the
receipt to 80, re-post; the balance instantly reads 40 with no recalculation anywhere. *(You'll
need Phase 4's documents to run it fully; write it as a pending test now.)*

**Explain:** why the balance is computed and never stored; what delete-first buys you; why the
stock check lives in `post()` and not in the UI; why registers have no screens.

---

### Phase 4 — Receipt, Issue, and concurrency (5–6 days)

**Goal:** two more documents, and the hardest correctness problem in the project.

> ✍️ **TYPE IT YOURSELF:** the advisory-lock acquisition and its key ordering, plus the concurrency
> test. Ask Claude to explain the race first and to show you a *failing* version — watch it
> oversell before you fix it. Delegate the document classes, numbering, and UI.

- [ ] `GoodsReceipt` document — `+` at one warehouse, from a supplier partner
- [ ] `GoodsIssue` document — `−` at one warehouse, to a customer partner
- [ ] Both reuse `post()` unchanged. If you find yourself editing `post()` per document type,
      the abstraction is wrong — stop and reconsider.
- [ ] Negative-stock rule honouring `warehouse.allow_negative_stock`
- [ ] Weighted average cost recalculated on receipt, written to `stock_cost`
- [ ] Document numbering: sequential per tenant, per type, per year
- [ ] **Concurrency (BR-6):**
  - [ ] advisory-lock or SERIALIZABLE implementation, whichever ADR-012 chose
  - [ ] **test: 20 concurrent issues of 6 units against a balance of 10 → exactly 1 succeeds.
        Run 50 times.**
  - [ ] deadlock test: two documents touching the same two items in opposite order
- [ ] Now run the guide's proof test for real. It must pass.
- [ ] UI for both documents with a posted/draft status badge

**Done when:** the concurrency test is green 50 runs in a row and the proof test passes.

**Explain:** why a transaction alone doesn't prevent overselling; READ COMMITTED vs SERIALIZABLE;
what an advisory lock is and why key ordering prevents deadlock; how weighted average cost is
computed. **This is one of your two strongest interview topics.**

---

### Phase 5 — The remaining documents and reports (4–5 days)

**Goal:** finish the warehouse module. This phase should feel easy — that's the architecture paying off.

- [ ] `Transfer` — `−` at A and `+` at B in one document, one transaction, both locked
- [ ] `WriteOff` — `−` with a mandatory reason from the Reasons catalog; free text rejected
- [ ] `StockCount` — records counted quantities, posts **only the difference** (surplus or shortage)
- [ ] **Item Card report** — every movement of one item in date order with a running balance,
      each row linking back to its source document
- [ ] **Turnover report** — opening, in, out, closing between two dates
- [ ] Balance-as-of-date on the Stock Balance report
- [ ] Stock valuation report from `stock_cost`
- [ ] Note in `docs/notes/phase-5.md`: how much code each new document actually needed

**Done when:** all six documents post, unpost, and re-post correctly, and all three reports read
from the registers.

**Explain:** why a stock count posts a difference rather than an absolute; how three reports come
from one table; what it means that adding a document type took under a day.

---

### Phase 6 — Ship it (4–5 days) ← **do not postpone**

The warehouse module is a complete, useful product. Deploy it now.

- [ ] Multi-stage Dockerfiles, non-root user, images under ~200 MB
- [ ] `docker-compose.prod.yml` with resource limits and restart policies
- [ ] Caddyfile: automatic TLS, routing, gzip
- [ ] Host: **Oracle Cloud Always Free** ARM (2 OCPU / 12 GB, capacity permitting) or
      **Hetzner CX23** (~€5.50/month). Domain ~$10/year.
- [ ] **ARM note:** build multi-arch or build on the server; amd64-only images won't run on Ampere
- [ ] GitHub Actions deploy: build → push to GHCR → SSH → pull → migrate → rolling restart
- [ ] Migrations as a separate step that must succeed before the new image goes live
- [ ] Nightly `pg_dump` to MinIO, **with a restore rehearsed once**
- [ ] `infra/terraform/` written, `validate` and `fmt -check` in CI
- [ ] Uptime monitoring on `/health`
- [ ] Demo tenant with realistic seeded data and published read-only credentials
- [ ] README with the architecture diagram, the four sentences, and a 3-minute Loom

**Done when:** a stranger with the URL can log in, post a receipt, and see the balance change.

**Explain:** your deployment strategy and its downtime characteristics; how migrations sequence
against deploys; what you'd change with a budget, specifically.

---

### Phase 7 — Sales orders and the reservation register (6–7 days)

**Goal:** a second rich aggregate, and orders that don't touch `stock_on_hand`.

> ✍️ **TYPE IT YOURSELF:** the `SalesOrder` state machine, the `Money` value object, and the
> `CreditLimitPolicy`. Delegate price lists, the storefront, the BullMQ job, and all CRUD.

- [ ] `stock_reserved` register — same shape, written only by `post()`
- [ ] `available = SUM(on_hand) − SUM(reserved)`, one query
- [ ] `Money` value object: integer minor units, currency-safe arithmetic, adding USD to GEL throws
- [ ] Price lists: `PriceList`, `PriceListItem`, effective dates; customer → price list assignment
- [ ] Price resolution: customer-specific → customer's list → default
- [ ] Case packs: ordering 1 case of 24 reserves 24 base units
- [ ] `SalesOrder` aggregate: state machine per BR-10, illegal transitions throw
- [ ] Confirming an order posts to `stock_reserved`, reusing `post()` and its locking
- [ ] Shipping **creates a Goods Issue document** which releases the reservation and posts to
      `stock_on_hand`. The order never writes to a register itself.
- [ ] `CreditLimitPolicy` as a domain service; Accountant override recorded in `audit_log`
- [ ] Reservation expiry as a BullMQ repeatable job (add `redis`)
- [ ] Backorder path when reservation fails
- [ ] Storefront: catalog, cart, checkout, order history with a status timeline

**Explain:** why reservations are a register and not a column; why the order produces a document
instead of writing movements; how a state machine in the domain eliminates a class of bug.

---

### Phase 8 — Outbox, RabbitMQ, and the fulfilment saga (6–7 days) ← **interview centrepiece**

> ✍️ **TYPE IT YOURSELF:** the saga's state transitions and every compensation path. This is the
> single thing you will be asked about most in interviews — you cannot afford to have only read it.
> Delegate the RabbitMQ wiring, the notifications service, and the retry configuration.

- [ ] Add `rabbitmq` and `mailpit` to compose
- [ ] **Transactional outbox:** table, events written in the same transaction as `post()`, relay
      polling and publishing
- [ ] Test: kill the relay mid-publish, restart, verify nothing lost and nothing duplicated downstream
- [ ] `packages/contracts` — versioned Zod schemas shared by producer and consumer
- [ ] **Extract `apps/notifications`** — own app, own delivery log, consumes `OrderConfirmed` /
      `DocumentPosted` / `InvoiceIssued`, sends to Mailpit
- [ ] Idempotent consumers via a processed-message table
- [ ] Exponential backoff retry + **dead-letter queue**; a poison message must not block the queue
- [ ] **Rewrite order confirmation as an async saga** with compensation on reservation failure
- [ ] Saga state persisted; a restart mid-flight resumes correctly
- [ ] Timeout → compensate
- [ ] Chaos test: stop RabbitMQ mid-saga, restart, verify convergence

**Explain:** why dual writes are broken and how the outbox fixes it; at-least-once vs exactly-once;
idempotency keys; sagas vs distributed transactions; what actually lands in a DLQ.

---

### Phase 9 — Invoicing and object storage (4–5 days)

- [ ] Add `minio`, provision the bucket in setup
- [ ] `Invoice` aggregate with **snapshotted** lines — an invoice must not change when a price does
- [ ] **Gapless numbering** per tenant per year; test 50 simultaneous issuances → 50 consecutive numbers
- [ ] `InvoiceIssued` → PDF worker → pdfmake → MinIO → store object key
- [ ] Presigned download URLs, short expiry
- [ ] Payment recording, `PARTIALLY_PAID` / `PAID`
- [ ] Scheduled sweep marking `OVERDUE`
- [ ] AR aging report

**Explain:** why invoice lines are snapshotted; how gapless numbering survives concurrency and what
you rejected; what a presigned URL protects against.

---

### Phase 10 — Frontend consolidation and BFF (4–5 days)

- [ ] Next.js Route Handlers as BFF; httpOnly, secure, `SameSite=Lax` cookie
- [ ] Transparent refresh-on-401 with request queueing
- [ ] Server Components for initial load, TanStack Query for interaction — write down where you
      drew the line
- [ ] Optimistic cart updates with rollback
- [ ] Real empty states, skeletons, error boundaries
- [ ] Accessible forms and keyboard-navigable tables
- [ ] Playwright: receipt → order → confirm → ship → invoice

---

### Phase 11 — Reporting service, Kafka, observability (5–6 days)

- [ ] Add `redpanda` and `grafana-lgtm`
- [ ] Outbox relay fans out to Kafka topics alongside RabbitMQ
- [ ] **Extract `apps/reporting`** — builds denormalised read models in its own schema
- [ ] **Rebuild from offset zero produces identical results.** This is why Kafka is here.
- [ ] Consumer lag monitoring and a note on what you'd do if it grew
- [ ] OpenTelemetry trace spanning HTTP → outbox → RabbitMQ → consumer → DB
- [ ] Correlation IDs in message headers and every log line
- [ ] Dashboards: latency, queue depth, saga completion rate, DLQ count
- [ ] Liveness and readiness split

**Explain:** log-based vs queue-based messaging and why each context got what it got; CQRS and
eventual consistency, including how the UI signals staleness; what tracing shows that logs can't.

---

### Phase 12 — Purchasing (4–5 days, optional)

- [ ] `PurchaseOrder` document writing to an **expected** register, not `stock_on_hand`
- [ ] Partial receiving keeps the PO open
- [ ] Over-receipt tolerance (default 5%) requiring explicit confirmation
- [ ] Receiving against a PO creates a Goods Receipt and closes the expected quantity
- [ ] Supplier dashboard

---

### Phase 13 — Angular back office (7–10 days, optional)

Only if you haven't landed a job. Lowest return of any phase.

- [ ] Angular 20 standalone + signals, same OpenAPI client regenerated for HttpClient
- [ ] Screens: stock balance, receiving, issue, item card
- [ ] DI, HTTP interceptor, route guards, reactive forms
- [ ] PrimeNG grid with server-side paging
- [ ] ADR on why two frontends against one API is defensible

---

## 10. Cost summary

| Item | Cost |
|---|---|
| Everything through Phase 5 (local Docker) | **€0** |
| Oracle Cloud Always Free ARM | **€0** (capacity permitting) |
| Hetzner CX23 fallback | **~€5.50/month** |
| Domain | **~$10/year** |
| GitHub Actions (public repo), MinIO, self-hosted Grafana | **€0** |
| AWS | **€0** — Terraform validated, never applied |

**€0–6/month**, and nothing at all until Phase 6.

---

## 11. The README is the deliverable

Ninety seconds is what you get. Before Phase 6 ends:

1. The four sentences from §1, in your own words, no technical terms.
2. The architecture diagram.
3. Live demo URL with read-only credentials.
4. A 3-minute Loom: post a receipt, edit it, re-post, watch the balance correct itself.
5. "Key decisions" — five bullets linking to ADRs, including ones you'd revisit.
6. "Deliberately out of scope" — the honest list.
7. Setup that works: `pnpm install && docker compose up && pnpm db:seed && pnpm dev`.

---

## 12. Failure modes

- **Adding catalog fields early.** Batches, expiry, serials, bins, barcodes each double the
  difficulty of code you haven't written. Say no until the basic system works end to end.
- **Caching the balance "for performance."** The single decision this whole architecture exists to
  prevent. Snapshot table at 100k+ rows, never an editable column.
- **Editing `post()` per document type.** If a new document needs changes to `post()`, the
  abstraction is wrong. Fix the abstraction.
- **Checking stock only in the UI.** The API, an import script, and two simultaneous users all pass
  through `post()`. That's where the rule lives.
- **Gold-plating the domain model.** Three days on the perfect `Quantity` object is hiding from the
  concurrency test.
- **Postponing Phase 6.** It has a date. Meet it.
- **Delegating the 15%.** If you have not typed `post()`, the locking, or the saga yourself, you
  have a portfolio you cannot defend. Check this at the end of Phases 4 and 8 specifically.
- **Stopping the job search.** This supports applications; it doesn't replace them. An offer at
  Phase 5 is the project succeeding.
