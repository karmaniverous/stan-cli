# System‑level lint policy

Formatting and linting are enforced by the repository configuration; this system prompt sets expectations:

- Prettier is the single source of truth for formatting (including prose policy: no manual wrapping outside commit messages or code blocks).
- ESLint defers to Prettier for formatting concerns and enforces TypeScript/ordering rules (see repo config).
- Prefer small, automated style fixes over manual formatting in patches.
- Keep imports sorted (per repo tooling) and avoid dead code.

Assistant guidance
- When emitting patches, respect house style; do not rewrap narrative Markdown outside the allowed contexts.
- Opportunistic repair is allowed for local sections you are already modifying (e.g., unwrap manually wrapped paragraphs), but avoid repo‑wide reflows as part of unrelated changes.
