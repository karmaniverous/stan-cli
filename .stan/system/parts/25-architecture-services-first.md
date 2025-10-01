# Architecture: Services‑first (Ports & Adapters)

Adopt a services‑first architecture with clear ports (interfaces) and thin adapters:

- Ports (service interfaces)
  - Define the core use‑cases and inputs/outputs as pure TypeScript types.
  - Keep business logic in services that depend only on ports; avoid hard process/fs/network dependencies.

- Adapters (CLI, HTTP, worker, GUI, etc.)
  - Map from the edge (flags, HTTP params, env) to service inputs; format service outputs for the edge.
  - Remain thin: no business logic, no hidden state management, no cross‑cutting behavior beyond mapping/presentation.
  - Side effects (fs/process/network/clipboard) live at adapter boundaries or in small leaf helpers wired through ports.

- Composition and seams
  - Wire adapters to services in a small composition layer; prefer dependency injection via ports.
  - Make seams testable: unit tests for services (pure), integration tests for adapters over minimal end‑to‑end slices.

- Code organization
  - Prefer many small modules over large ones (see long‑file guidance).
  - Co‑locate tests with modules for discoverability.

This matches the “Services‑first proposal required” step in the Default Task: propose contracts and adapter mappings before code.
