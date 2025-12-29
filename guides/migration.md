---
title: Migration — Namespaced Configuration
---

# Migration — Namespaced Configuration

STAN now uses a namespaced configuration layout with top‑level sections:

- stan-core — engine keys (selection and workspace):
  - stanPath: ".stan" (default)
  - includes?: string[]
  - excludes?: string[]
  - imports?: Record<string, string|string[]> (normalized to arrays)
- stan-cli — CLI keys (runner/adapters):
  - scripts: Record<string, string | { script: string; warnPattern?: string }>
  - cliDefaults: phase‑scoped defaults (run/patch/snap) and root defaults (debug, boring)
  - patchOpenCommand?: string
  - maxUndos?: number
  - devMode?: boolean

## How to migrate a legacy config

Use the CLI to migrate safely. It preserves unknown keys, keeps your original file
format (YAML/JSON), and writes a .bak before any rewrite.

Interactive (prompted):
```bash
stan init
```

Non‑interactive (accept sane defaults):
```bash
stan init --force
```

Plan‑only (show what would change; no writes):
```bash
stan init --dry-run
```

Notes:
- The migrator rewrites only recognized legacy keys to:
  - stan-core: { stanPath, includes, excludes, imports }
  - stan-cli:  { scripts, cliDefaults, patchOpenCommand, maxUndos, devMode }
- Unknown top‑level keys remain intact.
- A backup is written next to your config as <filename>.bak.
- The nearest stan.config.yml|yaml|json is used (resolution starts from the current working directory).

## After migrating

- Re‑run your usual loop:
  ```bash
  stan run
  ```
  Verify archives and outputs look normal.

- Optional housekeeping:
  - Remove obsolete local scripts or docs that referenced the legacy (root‑key) shape.
  - If your CI references flags, review cliDefaults in stan-cli to avoid redundant flags.

## Troubleshooting

- If you see “missing ‘stan-core’ section” errors in other tools or CI, ensure the config at the repo root was migrated and committed.
- If you need to revert, use the .bak written during migration or your VCS history.
