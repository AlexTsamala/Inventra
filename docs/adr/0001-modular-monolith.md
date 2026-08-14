# ADR-0001: Modular monolith first, extract selectively

## Context

Inventra is a single-developer, ~13-week learning project building an ERP for small-to-mid
wholesale distributors of industrial and MRO supplies — fasteners, hand tools, gloves, cleaning
chemicals, packaging — sold to construction firms, factories, and facilities managers. With one
developer, an unproven domain model, and no real production traffic yet, the system's eventual
scaling and failure characteristics are unknown, so the architecture needs to support fast
iteration now while keeping the option to split into services later without a rewrite.

## Options considered

**Microservices** — independently deployable, isolated failure domains (one service failing
doesn't take down the rest), but requires network boundaries, service discovery, and
distributed-transaction handling from day one, none of which is justified yet.
**Modular monolith** — a single deployable with module boundaries enforced in-process, low
operational overhead, and a lightweight CI/CD pipeline, at the cost of the whole application
scaling and deploying as one unit.

## Decision

Start with a modular monolith: it minimizes overhead, complexity, and cost while the system and
its real scaling needs are still unproven. Extraction stays deferred as long as the team isn't
blocked and velocity holds — additional infrastructure gets added only when a genuine need
appears, not preemptively. Because the design is already split into modules with enforced
boundaries, any module can be extracted into its own service later without redesigning the
domain underneath it.

## Consequences

The boundaries between modules are enforced entirely by discipline and tooling
(`dependency-cruiser`), not by a network boundary — if that enforcement erodes, the codebase
degrades into a plain monolith with no real separation left, and extraction later becomes a
redesign instead of a mechanical split. Operationally, the system is a single deployable: cheap
to run, easy to test end-to-end, and simple to deploy — but it also scales and fails as one unit,
so a spike or a bug in one area affects the whole app until that piece is actually extracted.

## Date

2026-08-14
