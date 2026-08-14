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
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
