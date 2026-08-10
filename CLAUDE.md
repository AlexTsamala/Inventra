# CLAUDE.md

## Project

Inventra — a multi-tenant ERP for industrial/MRO wholesale distribution. NestJS modular monolith,
Prisma/Postgres, RabbitMQ, Next.js.

**The architecture is Catalog / Document / Register.** Everything in the system is one of three
things: a catalog (reference data, freely editable), a document (a business event with header and
lines, DRAFT or POSTED), or a register (append-only movements, written only by `post()`).

Full plan and business rules live in `PLAN.md`. Read the sections for the **current phase only**
when starting work, plus §2 (the Catalog/Document/Register pattern), §3 (business requirements)
and §4 (glossary) as needed. Do not read ahead
to later phases — building toward a phase before reaching it defeats the point of the sequence.

## Working mode — read this first

This is a **learning project**. The developer is building it to understand these patterns, not to
ship fast. Optimise for their comprehension, not for lines of code.

- **Explain before generating.** For any non-trivial task, describe the pattern and the trade-off
  first, then write code. If the explanation would be long, ask whether to proceed.
- **Small steps.** One use case, one aggregate method, one endpoint per turn. Never scaffold an
  entire module unprompted.
- **Test first in the domain layer.** Write the failing test, confirm it fails for the right
  reason, then implement.
- **Ask before adding a dependency.** The stack in PLAN.md §6 is deliberate. Proposing an
  alternative is welcome; installing one silently is not.
- **Say when something is over-engineered.** If a simpler solution fits, say so even if the plan
  says otherwise. The plan is a guide, not scripture.
- **Never invent business rules.** If a requirement is ambiguous, ask. Do not guess and proceed.

### Code the developer types themselves — do not write these unasked

Some code exists to be learned, not delivered. For the following, **explain the reasoning, sketch
the shape in prose or pseudocode, review what they write — but do not hand over a finished
implementation** unless they explicitly ask after attempting it:

- `post()` and `unpost()`
- document aggregates and their invariants
- the advisory-lock acquisition and key ordering in `post()`
- the `SalesOrder` state machine and `CreditLimitPolicy`
- the `Money` and `Quantity` value objects
- the fulfilment saga's state transitions and compensation paths
- any test in `domain/`

If they ask for one of these directly, first ask whether they want to attempt it — once. If they
say yes, write it. Their call, not a negotiation.

Everything else — config, Docker, CI, Prisma schema, migrations, controllers, DTOs, mappers,
module wiring, UI components, seed scripts, report queries — write fully and without ceremony.

When they hit a bug in their own code, **ask what they think is happening before diagnosing it.**
One question, then help.

## Hard rules — do not violate

**Layering.** In `documents` and `sales` (the two modules with full DDD layering — see PLAN.md §7):
- `domain/` imports nothing from `application/`, `infrastructure/`, or `presentation/`.
- `domain/` imports no framework code — no `@nestjs/*`, no `@prisma/client`, no `zod`.
- Repository *interfaces* live in `domain/`; implementations live in `infrastructure/`.
- Prisma types never cross out of `infrastructure/`. Mappers convert at the boundary.
- Enforced by `dependency-cruiser` in CI. If a rule blocks you, fix the design, not the rule.

**Money.** Integer minor units only, via the `Money` value object. No floats, no `number` for
currency, no arithmetic outside `Money`. Adding two different currencies must throw.

**Stock — the rule the whole system exists to protect.** There is NO stored balance column.
Ever. Stock on hand is `SUM(qty_delta)` from the `stock_on_hand` register. If you are tempted to
cache it for performance, the answer is a monthly snapshot table at 100k+ rows — never an editable
column. Proposing a cached balance is the single worst thing you can do to this codebase.

**Registers.** Only `post()` writes to a register. Not a use case, not a controller, not a
migration, not a seed script. Registers have no UI and no create/update/delete endpoints, ever.

**`post()` is written once and reused by every document type.** If a new document seems to need
changes inside `post()`, the abstraction is wrong — stop and say so rather than adding a branch.
It must: run in one transaction, take advisory locks on sorted `(tenant, item, warehouse)` keys,
delete this document's existing register rows first, validate every line before writing any, then
insert. Unpost is the same without the insert.

**Concurrency.** The balance check in `post()` is read-then-write and races under READ COMMITTED.
Locking is mandatory, not optional, and is proven by a concurrency test — never by reasoning about
the code. The mechanism is `pg_advisory_xact_lock` on sorted `(tenant, item, warehouse)` keys
(PLAN.md BR-6; ADR-012 confirms it in Phase 4). SERIALIZABLE was considered and rejected — do not
re-propose it without new evidence.

**Costing.** Every posted line writes a `stock_cost` row, not just receipts. Average cost is
`SUM(amount_delta) / SUM(qty_delta)`, computed inside `post()` under the same lock as the quantity
check — never stored, never read outside the lock. See PLAN.md BR-8 for the per-document table and
the undefined-average guard.

**Numbering.** Document numbers are sequential but may have gaps, and are assigned at draft
creation. Invoice numbers are gapless and assigned only at issue. These are different rules for
different reasons — do not unify them.

**Documents.** A DRAFT document has zero effect on stock. Posting twice must not double the stock.
Posted documents are never deleted — only unposted, edited, re-posted. Line quantities are always
positive; direction comes from the document type.

**Tenancy.** Tenant id comes from `TenantContext` (populated from the JWT by a guard). Never from
a request body, query param, or header. Every tenant-owned table has an RLS policy.

**Orders.** State transitions go through the `SalesOrder` aggregate's state machine. Illegal
transitions throw `InvalidStateTransitionError`. Lines are immutable once `CONFIRMED`. Orders write
to the `stock_reserved` register, never to `stock_on_hand`; shipping creates a Goods Issue document
which does that.

**Events.** Domain events are written to the `outbox` table inside the same transaction as the
state change. Never publish to RabbitMQ directly from a use case. All consumers are idempotent.

**Audit.** `audit_log` is append-only with UPDATE and DELETE revoked at the database role level.
It records posting actions, catalog edits, and credit-limit overrides. It exists precisely because
`post()` deletes register rows.

**Invoices.** Numbers are gapless and sequential per tenant per year. Never `MAX(number) + 1`.

## Testing

- Domain tests: Vitest, no database, no mocks of our own code, whole suite under one second.
- Integration tests: Testcontainers with real Postgres/RabbitMQ. No in-memory fakes for these.
- Every invariant in PLAN.md §3 has at least one test naming the rule it protects.
- Required tests that must never be weakened or skipped: posting twice does not double stock;
  unpost returns the balance to zero; edit-then-repost corrects the balance with no recalculation;
  20 concurrent issues against insufficient stock produce exactly one success.
- Concurrency-sensitive code (reservations, invoice numbering) gets a parallel-execution test.
- Don't write a test that only asserts the implementation you just wrote. Assert the rule.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`. No non-null assertions (`!`).
- Domain errors are typed classes extending `DomainError`, never bare `Error` or strings.
- Use cases return a `Result<T, E>`; exceptions are for genuinely exceptional cases only.
- Files: `kebab-case.ts`. Classes: `PascalCase`. One aggregate per file.
- Name things in the ubiquitous language (PLAN.md §4). Say `post`, `unpost`, `movement`,
  `on hand`, `available` — not `save`, `submit`, `record`, `qtyLeft`.
- Zod schemas for integration events live in `packages/contracts` and are versioned.
- Commits: conventional commits, scoped by module — `feat(documents): ...`, `fix(catalogs): ...`.

## Never do these

- Generate a whole phase at once because it seems efficient.
- Add a package, a Docker service, or an env var without saying so explicitly.
- Put business logic in a controller, a Prisma call, or a React component.
- Use `prisma.$queryRaw` to work around a domain rule.
- Add a cached or denormalised stock balance column, in any form, for any reason.
- Write to a register from anywhere except `post()`.
- Add fields to the six catalogs beyond PLAN.md §3 — batches, expiry, serials, bins, barcodes are
  all explicitly deferred.
- Weaken or skip a test to make a build pass. Say the test is failing and why.
- Write comments that restate the code. Comment *why*, never *what*.
- Add a `try/catch` that swallows an error.
- Introduce `localStorage` for auth tokens. Tokens live in httpOnly cookies (ADR-003).

## Commands

```
pnpm dev              # all apps in watch mode
pnpm test             # full test suite
pnpm test:domain      # domain unit tests only — fast, run constantly
pnpm lint             # eslint + dependency-cruiser boundaries
pnpm typecheck
pnpm db:migrate       # prisma migrate dev
pnpm db:seed
pnpm api:spec         # regenerate OpenAPI spec + packages/api-client
docker compose up -d  # postgres, redis, rabbitmq, minio, mailpit
```

Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test`.

## Current state

**Phase:** 0 — Foundations
**Next task:** `docker-compose.yml` with Postgres

Update these two lines at the end of every session.
