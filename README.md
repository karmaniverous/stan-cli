> **_STAN is a CLI that bridges your IDE with your favorite LLM and drives a rapid, powerful, low-friction, design-first iterative development process. Real-world AI-assisted development for professional engineers!_**

# STAN — STAN Tames Autoregressive Nonsense

[![npm version](https://img.shields.io/npm/v/@karmaniverous/stan-cli.svg)](https://www.npmjs.com/package/@karmaniverous/stan-cli) ![Node Current](https://img.shields.io/node/v/@karmaniverous/stan-cli) <!-- TYPEDOC_EXCLUDE --> [![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/stan) [![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/stan-cli/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE --> [![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/stan-cli/tree/main/LICENSE)

![STAN Loop](https://github.com/karmaniverous/stan-cli/raw/main/assets/stan-loop.png)

STAN produces a single source of truth for AI‑assisted development: a tarball of your repo plus deterministic text outputs from your build/test/lint/typecheck scripts.

You get portable, auditable, reproducible context—locally and in CI.

Because a freaking chatbot shouldn’t gaslight your code.

---

## Getting Started

Please see the [Getting Started](./guides/getting-started.md) guide for setup instructions.

---

## The STAN Loop

STAN drives a rigorous, iterative development process:

1.  **Build & Snapshot** (`stan run`)
    - Execute tests, lint, and build scripts.
    - Capture deterministic outputs and snapshot the codebase into a portable archive.

2.  **Share & Baseline** (`stan snap`)
    - Attach the archive to your AI chat context.
    - The assistant loads your project's system prompt directly from the archive.

3.  **Discuss & Patch** (`stan patch`)
    - Iterate on requirements and code in natural language.
    - Receive plain unified diffs and apply them safely.
    - If a patch fails, STAN provides actionable diagnostics for the assistant to self-correct.

---

## Why STAN?

- **Reproducible context:** one archive captures exactly the files to read.
- **Structured outputs:** test/lint/typecheck/build logs are deterministic and easy to diff.
- **Always‑on diffs:** STAN writes archive.diff.tar for changed files automatically.
- **Preflight guardrails:** nudges you to update prompts when the baseline changes.
- **Patch workflow:** paste a unified diff or read from a file; STAN applies it safely and opens modified files in your editor. If a patch fails, STAN provides an improved patch and a full listing just for good measure.

---

## Configuration (stan.config.yml)

Minimal example:

```
stanPath: .stan
includes: []
excludes: []
scripts:
  build: npm run build
  lint: npm run lint
  test: npm run test
  typecheck: npm run typecheck
```

See [STAN Configuration](./guides/configuration.md) for more!

---

## Commands at a glance

- **Run** (build & snapshot)
  ```bash
  stan run                 # runs all configured scripts and writes archives
  stan run -s test         # run only “test”
  stan run -S              # do not run scripts (combine with -A/-p)
  stan run -x test         # run all except “test”
  stan run -q -s lint test # sequential run subset in provided order
  stan run -c -s test      # combine archives & outputs
  stan run -A              # do not create archives
  stan run -p              # print plan only, no side effects
  stan run -P              # do not print the plan first
  ```
- **Snap** (share & baseline)
  ```bash
  stan snap  stan snap undo | redo | set <index> | info
  stan snap -s # stash before snap; pop after
  ```
- **Patch** (discuss & patch)
  ```bash
  stan patch               # from clipboard
  stan patch --check       # validate only
  stan patch -f file.patch # from file
  ```

See [CLI Usage & Examples](./guides/cli-examples.md) for more!

---

## Documentation

- [API reference](https://docs.karmanivero.us/stan)
- Guides:
  - [Getting Started](./guides/getting-started.md) — Set up your agent and run your first loop.
  - [The STAN Loop](./guides/the-stan-loop.md) — How Build & Snapshot → Share & Baseline → Discuss & Patch work together.
  - [CLI Usage & Examples](./guides/cli-examples.md) — Common flags and invocation patterns, including `-p`, `-P`, `-S`, `-A`, and `-c`.
  - [Migration — Namespaced Configuration](./guides/migration.md) — Upgrade legacy configs using `stan init` (backs up `.bak`; supports `--dry-run`).
  - [Stan Configuration](./guides/configuration.md) — All config keys, includes/excludes semantics, and phase‑scoped CLI defaults.
  - [Patch Workflow & Diagnostics](./guides/patch-workflow.md) — Unified diff policy, diagnostics envelopes, and assistant expectations.
  - [Archives & Snapshots](./guides/archives-and-snapshots.md) — What goes into `archive.tar`/`archive.diff.tar`, combine mode, and snapshot history. Additional references:
- [Reference: The Bootloader](./guides/bootloader.md) — How the assistant loads `.stan/system/stan.system.md` from attached archives.
- The following documents are maintained by STAN and live under `<stanPath>/system/` in your repo:
  - `stan.project.md` contains your evolving project requirements.
  - `stan.todo.md` contains your evolving development plan.

- Case studies:
  - [rrstack](./guides/case-studies/rrstack.md) — how STAN enabled rapid development in a couple of days.
- Comparison: [Why STAN Over Alternatives?](./guides/why-stan-over-alternatives.md)
- [FAQ](./guides/faq.md) — answers to common questions and pitfalls.
- Contributing: [Dev Quickstart](./contributing.md)

---

## Troubleshooting

- “system prompt missing”: ensure <stanPath>/system/stan.system.md is included in the attached archive; otherwise attach it directly as stan.system.md.
- Patch failures: use --check to validate first; if a patch fails, STAN writes a concise diagnostics envelope (attempt summaries + jsdiff reasons) and copies it to your clipboard (stdout fallback) so you can get a corrected patch.
- Large files: STAN may flag very long source files (~300+ LOC) and ask for a split plan before proceeding.

---

## Contributing

- See the [Contributing — Dev Quickstart](./contributing.md) for local setup and workflow tips.

- Keep the loop simple. Each stage ends with one command.
- Favor small, testable modules; treat >300 LOC as design feedback.
- Improve the project prompt (<stanPath>/system/stan.project.md) when repo‑specific policies evolve.

---

## Built With Stan

[aws-api-gateway-tools](https://github.com/karmaniverous/aws-api-gateway-tools) - Tools and get-dotenv plugin for AWS API Gateway (REST APIs, stage cache, API keys).

[aws-secrets-manager-tools](https://github.com/karmaniverous/aws-secrets-manager-tools) - Tools and get-dotenv plugin for AWS Secrets Manager env-map secrets.

[aws-xray-tools](https://github.com/karmaniverous/aws-xray-tools) - Guarded AWS X-Ray capture utilities for AWS SDK v3 clients.

[cached-axios](https://github.com/karmaniverous/cached-axios) - Tag‑aware caching for Axios: stable cache IDs, simple tag invalidation, and a drop‑in Orval mutator on top of axios‑cache‑interceptor.

[electron-react-template](https://github.com/karmaniverous/electron-react-template) - A modern Electron + React starter built on Electron Forge and Vite, with a batteries-included TypeScript/tooling setup for shipping production desktop apps.

[entity-client-dynamodb](https://github.com/karmaniverous/entity-client-dynamodb) - Convenience wrapper for DynamoDB SDK with enhanced batch processing & EntityManager support.

[entity-manager](https://github.com/karmaniverous/entity-manager) Rational indexing & cross-shard querying at scale in your NoSQL database so you can focus on your application logic.

[entity-manager-demo](https://github.com/karmaniverous/entity-manager-demo) - A working demonstration of Entity Manager in action.

[entity-tools](https://github.com/karmaniverous/entity-tools) - Types & low-level functions for entity operations.

[get-dotenv](https://github.com/karmaniverous/get-dotenv) - Manage environment variables from dotenv files across multiple environments. Supports async/CLI operations, dynamic variables, custom CLI creation & more!

[hook-form-semantic](https://github.com/karmaniverous/hook-form-semantic) - React Hook Form components with Semantic UI React integration - date pickers, WYSIWYG editor, phone input, JSON editor, and more.

[identity-engine](https://github.com/karmaniverous/identity-engine) - Deterministic identity-resolution engine in TypeScript: Zod-validated handlers, mocked deps, and a CLI that mirrors the future HTTP API.

[mock-db](https://github.com/karmaniverous/mock-db) - Mock DynamoDB-style query & scan behavior with local JSON data.

[npm-package-template-ts](https://github.com/karmaniverous/npm-package-template-ts) - A feature-rich NPM package template for TypeScript projects.

[react-component-npm-package-template-ts](https://github.com/karmaniverous/react-component-npm-package-template-ts) - A modern, batteries‑included React 18 component library template for TypeScript with ESM‑only bundling, Vite playground, Vitest, ESLint/Prettier, TypeDoc, release‑it, STAN, and optional cloud backup.

[rrstack](https://github.com/karmaniverous/rrstack) - Manage a stack of RRULEs.

[stan-cli](https://github.com/karmaniverous/stan-cli) & [stan-core](https://github.com/karmaniverous/stan-core) - The command-line interface for STAN, a tool for managing snapshots, patches, and archives in software development.

[smoz](https://github.com/karmaniverous/smoz) - SMOZ: a TypeScript toolkit for AWS Lambda combining Serverless, Middy, OpenAPI 3.1 and Zod for schema‑first apps with robust HTTP middleware and typed validation.

[string-utilities](https://github.com/karmaniverous/string-utilities) - Handy tagged template functions & other string utilities.

## License

BSD‑3‑Clause

---

Built for you with ❤️ on Bali! Find more great tools & templates on [my GitHub Profile](https://github.com/karmaniverous).
