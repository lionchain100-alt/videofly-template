# Source quality gate

`pnpm lint` scans `src` and `scripts` with the pinned Biome 1.9.4. `pnpm lint:raw` reports the complete pre-existing debt and currently exits nonzero. No formatter or bulk business-code rewrite is part of AUD-009.

The inherited `biome.json` excludes generated database/schema files, vendored UI/magicui/animate-ui and type declarations. It disables certain inherited rules explicitly. Build outputs, dependency trees, documentation and local runtime files are outside the source lint scope. Typecheck/build and retained service tests independently cover database/application code.

`lint-baseline.json` records only diagnostics already present at AUD-009 entry: relative file, rule, description and exact diagnostic token fingerprint, with occurrence count. Every scan covers the full declared scope; new diagnostics, extra occurrences, syntax/configuration errors and tool failures fail. Line movement does not invalidate debt identity. Removed diagnostics are allowed; no automatic baseline write exists. Baseline/config changes require explicit review and should reduce debt rather than admit new issues. This incremental gate does not claim the historic source is lint-clean.

CI additionally runs frozen dependency installation, typecheck, security audit at moderate severity or above, migration/seed idempotency, retained integration/API suites, production-configuration negative/positive fixtures and production build. It requires no real platform credentials and performs no deployment. Hosted CI results must be obtained after pushing this local commit.
