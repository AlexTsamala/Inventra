module.exports = {
  forbidden: [
    {
      name: "domain-no-infrastructure",
      comment:
        "domain/ owns business rules and must not depend on infrastructure/ (Prisma, HTTP, message brokers, ...).",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain" },
      to: { path: "^src/modules/[^/]+/infrastructure" },
    },
    {
      name: "modules-via-public-surface-only",
      comment:
        "A module's public surface is its *.module.ts (or an index.ts barrel). Reaching into " +
        "another module's internals compiles fine but bypasses what that module chose to export, " +
        "and is what makes a module impossible to move or reason about later.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/",
        pathNot: [
          // Within one module, reach for whatever you like.
          "^src/modules/$1/",
          // The shared kernel is deliberately open to everyone.
          "^src/modules/shared/",
          // The two forms of public surface.
          "^src/modules/[^/]+/index\\.ts$",
          "^src/modules/[^/]+/[^/]+\\.module\\.ts$",
        ],
      },
    },
    {
      name: "shared-depends-on-nothing",
      comment:
        "shared/ holds primitives every module builds on (Result, DomainError, Prisma). If it " +
        "imports a feature module, the dependency runs backwards and nothing can be extracted.",
      severity: "error",
      from: { path: "^src/modules/shared/" },
      to: { path: "^src/modules/(?!shared/)[^/]+/" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
