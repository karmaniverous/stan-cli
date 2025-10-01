# Dependency Bug Report

Purpose
- When a dependency fails, offer a concise, valid‑Markdown bug report that upstream (human or STAN) can consume.
- Keep the report self‑contained (short excerpts inline). Prefer links for large evidence; defer artifacts to a later iteration.

Fence hygiene
- When presenting this template in chat, wrap the entire template body in a fence chosen by the Fence Hygiene (Quick How‑To) algorithm and re‑scan before sending. Do not rely on a fixed backtick count.

Canonical template (copy/paste the body; wrap per fence‑hygiene rules)

# Dependency Bug Report — <package>@<version>

## Summary
- What: <1–2 sentences describing the failure in downstream usage>
- Where: <downstream repo name> (<relative paths>)
- Impact: <blocking | partial | annoyance>; Scope: <modules affected>

## Environment
- Downstream repo: <name> @ <commit or tag>
- Node: <x.y.z> (<os/arch>)
- Package manager: <npm|pnpm|yarn> <version>
- Upstream: <package>@<version>
- Tooling: TypeScript <x.y>, Bundler <rollup/vite/webpack>, ESLint/TSConfig notes (if relevant)

## Reproduction (minimal)
1) <command or step>
2) <command or step>
3) Observe: <expected vs actual>

Example:
```bash
pnpm i
pnpm run build
# Expected: <…>
# Actual: see error excerpt below
```

## Evidence (concise)
Primary error excerpt:
```text
<copy the minimal error lines + 2–5 lines of context>
```

If a minimal code change triggers it, show the tiniest diff:
```diff
diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,4 @@
 import { broken } from '<package>';
 +broken(); // triggers <symptom>
```

## Root cause hypothesis (best‑effort)
- <e.g., subpath export missing; ESM/CJS mismatch; types not published; side effects; changed API signature>
- Why we think so: <brief rationale, links to docs/source lines>

## Proposed fix (what we need from upstream)
1) <concrete change, e.g., “add subpath export ./mutator in package.json”>
2) <build/output change, e.g., “publish .d.ts alongside JS outputs”>
3) <docs note or migration guidance, if applicable>

## Acceptance criteria
- After publishing:
  - <import/build/test> succeeds without local hacks.
  - TypeScript resolves types without path alias overrides.
  - No <specific error codes/warnings> remain in a fresh install.

## Attachments or links (evidence)
- Preferred: links to logs, a minimal repro repo, or a PR that demonstrates the issue clearly.
- Avoid bundling artifacts in the same message as this report to prevent ingestion confusion by tools that auto‑process archives.

## Notes for downstream (we’ll handle)
- <local pin/guard we will apply temporarily; removed after fix>
- <config/doc updates we’ll make once published>

## Maintainer contact
- Upstream repo: <url>
- Issue link (if already filed): <url or “to be filed”>
