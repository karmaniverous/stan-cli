# External dependency failures (design‑first policy)

When a third‑party (or internal) dependency is broken (API change/regression, build/install/runtime failure, platform incompatibility, licensing/security issue), do NOT immediately “code around” the problem. Prefer a short, explicit design iteration first.
Always offer to generate a “Dependency Bug Report” for the upstream owner (see section “Dependency Bug Report”) as part of this discussion.

## What to do first (quick design loop, ~10–15 minutes)

1. Summarize the failure concisely
   - What failed (name@version)?
   - Evidence: minimal log/excerpt, repro steps, target platform(s).
   - Is the failure deterministic and isolated to our usage?

2. Enumerate viable options with trade‑offs
   - Switch dependency
     • Identify 1–3 actively‑maintained alternatives (Open‑Source First).
     • Compare API fit, maturity, licenses, size, and ecosystem risk.
   - Fix upstream
     • If we own the dependency (same org/monorepo), prefer fixing at source.
     • Otherwise consider filing an issue/PR with a minimal repro and patch.
   - Temporary pin/patch
     • Pin to a known‑good version; or vendor a minimal patch with clear provenance.
     • Define an explicit removal plan (how/when to unpin or drop the patch).
   - Code around (shim)
     • Last resort. Isolate behind our ports/adapters layer; keep business logic out of the shim.
     • Minimize scope; add tests that encode the workaround’s assumptions.

3. Recommendation + rationale
   - State the preferred option, primary trade‑offs, expected scope/impact, and test/doc changes.
   - Include a short rollback/removal plan if choosing a pin/patch/shim.

4. Next steps
   - List concrete actions (e.g., “pin X to 1.2.3; open upstream issue; add adapter Y; add tests Z”).

See also: “Dependency Bug Report” for a valid‑Markdown template suitable for filing upstream issues.

## Ownership and Open‑Source First

- If we own the dependency (same org/repo ecosystem), fix it at the source when practical; do not bake copies of fixes downstream.
- Otherwise, prefer robust alternatives with healthy maintenance; submit upstream issues/PRs where feasible.

## If a shim is required

- Isolate the workaround behind an interface (ports & adapters); do not leak special cases into orchestration or business logic.
- Add tests that capture the intended behavior at the seam.
- Create a tracking item in the development plan (stan.todo.md) with a clear removal path and target date.

## Recording the decision

- Requirements & policy: if the decision results in a lasting rule for this repo, record it in `<stanPath>/system/stan.project.md`.
- Plan & execution: capture the concrete next steps and the removal plan in `<stanPath>/system/stan.todo.md` (Completed/Next up as appropriate).

## Why this policy

When the unexpected happens, a short design iteration almost always produces a better outcome than ad‑hoc workarounds:

- It forces us to consider switching dependencies, fixing upstream, or shimming—in that order of preference.
- It keeps tech debt contained (ports/adapters), visible (plan entries), and actionable (removal plan).
- It aligns with Open‑Source First and avoids silent divergence from upstream behavior.
