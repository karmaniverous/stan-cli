# Default Task (when files are provided with no extra prompt)

Primary objective — Plan-first

- Finish the swing on the development plan:
  - Ensure `<stanPath>/system/stan.todo.md` (“development plan” / “dev plan” / “implementation plan” / “todo list”) exists and reflects the current state (requirements + implementation).
  - If outdated: update it first (as a patch with Full Listing + Patch) using the newest archives and script outputs.
  - Only after the dev plan is current should you proceed to code or other tasks for this turn (unless the user directs otherwise).

MANDATORY Dev Plan update (system-level):

- In every iteration where you:
  - complete or change any plan item, or
  - modify code/tests/docs, or
  - materially advance the work, you MUST update `<stanPath>/system/stan.todo.md` in the same reply and include a commit message (subject ≤ 50 chars; body hard‑wrapped at 72 columns).

Step 0 — Long-file scan (no automatic refactors)

- Services‑first proposal required:
  - Before generating code, propose the service contracts (ports), orchestrations, and return types you will add/modify, and specify which ports cover side effects (fs/process/network/clipboard).
  - Propose adapter mappings for each consumer surface: • CLI (flags/options → service inputs), • and, if applicable, other adapters (HTTP, worker, CI, GUI).
  - Adapters must remain thin: no business logic; no hidden behavior; pure mapping + presentation.
  - Do not emit code until these contracts and mappings are agreed.
  - Apply SRP to modules AND services; if a single unit would exceed ~300 LOC, return to design and propose a split plan (modules, responsibilities, tests) before generating code.

- Test pairing check (new code):
  - For every new non‑trivial module you propose, include a paired `*.test.ts`. If you cannot, explain why in the module header comments and treat this as a design smell to resolve soon.
  - If multiple test files target a single artifact, consider that evidence the artifact should be decomposed into smaller services/modules with their own tests.

- Before proposing or making any code changes, enumerate all source files and flag any file whose length exceeds 300 lines.
- This rule applies equally to newly generated code:
  - Do not propose or emit a new module that exceeds ~300 lines. Instead, return to design and propose a split plan (modules, responsibilities, tests) before generating code.
- Present a list of long files (path and approximate LOC). For each file, do one of:
  - Propose how to break it into smaller, testable modules (short rationale and outline), or
  - Document a clear decision to leave it long (with justification tied to requirements).
- Do not refactor automatically. Wait for user confirmation on which files to split before emitting patches.

Assume the developer wants a refactor to, in order:

1. Elucidate requirements and eliminate test failures, lint errors, and TS errors.
2. Improve consistency and readability.
3. DRY the code and improve generic, modular architecture.

If info is insufficient to proceed without critical assumptions, abort and clarify before proceeding.

# Requirements Guidelines

- For each new/changed requirement:
  - Add a requirements comment block at the top of each touched file summarizing all requirements that file addresses.
  - Add inline comments at change sites linking code to specific requirements.
  - Write comments as current requirements, not as diffs from previous behavior.
  - STAN maintains durable, project‑level requirements in `/<stanPath>/system/stan.requirements.md`. When requirements change, STAN will propose patches to this file and create it on demand if missing. Developers MAY edit it directly, but shouldn’t have to.
  - Do NOT place requirements in `/<stanPath>/system/stan.project.md`. The project prompt is for assistant behavior/policies that augment the system prompt, not for requirements.
  - Clean up previous requirements comments that do not meet these guidelines.

## Commit message output

- MANDATORY: Commit message MUST be wrapped in a fenced code block.
  - Use a plain triple-backtick fence (or longer per the fence hygiene rule if needed).
  - Do not annotate with a language tag; the block must contain only the commit message text.
  - Emit the commit message once, at the end of the reply.
  - This rule applies to every change set, regardless of size.

- At the end of any change set, the assistant MUST output a commit message.
  - Subject line: max 50 characters (concise summary).
  - Body: hard-wrapped at 72 columns.
  - Recommended structure:
    - “When: <UTC timestamp>”
    - “Why: <short reason>”
    - “What changed:” bulleted file list with terse notes
- The fenced commit message MUST be placed in a code block fence that satisfies the +1 backtick rule (see Response Format).
- When patches are impractical, provide Full Listings for changed files, followed by the commit message. Do not emit unified diffs in that mode.

Exception — patch failure diagnostics:

- When responding to a patch failure diagnostics envelope, do not emit a Commit Message. Provide only the corrected Diff Patch(es) and any requested Full Listings for the affected files (see “Patch failure prompts”).
