# Phase 0 — Foundations: comprehension notes

Half a page, no code, in your own words. This is a comprehension check, not documentation.

## Questions to answer

1. Why does Turborepo's cache make a monorepo viable?
2. What does the Fastify adapter change, compared to Nest's default (Express)?
3. Why do architecture rules — like `domain/` not importing `infrastructure/` — belong in CI,
   enforced by a tool, rather than living in a code review checklist?

---

## Notes

1. Because otherwise lint/typecheck/test/build commands will rebuild everytime packages even if no one changed them.As the repo grows ,that gets slow enough that the workflow stops being usable day-to-day.

2. Fastify adapter changes raw throughput.It was built from scratch to be fast.It has better JSON serialization which is good for JSON-heavy APIs, which is exactly what this backend is.Express has (req, res, next)-style middleware with a huge ecosystem (helmet, multer, etc.); Fastify doesn't use that pattern at all — it has its own plugin system, so i reach for @fastify/helmet, @fastify/multipart, and so on instead.

3. A checklist only works if someone actually reads it and catches the mistake — and on this
project there's no second reviewer, it's just me. A tool like dependency-cruiser checks the same
rule the same way on every single change, without getting tired, skimming past it in a big diff,
or getting talked into "just this once" under deadline pressure. If the rule only lived in a
checklist, a rushed change could quietly break the domain/infrastructure boundary and nobody
would notice — until a domain test suddenly needed a database to pass, by which point the
violation is already merged and tangled into other code. Putting it in CI catches the mistake at
the door instead of after it's already expensive to undo.
