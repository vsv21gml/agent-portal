# Repository Guidelines

## Project Structure & Module Organization
This repository is a small monorepo managed with npm workspaces and Turbo. Application code lives under `apps/`:

- `apps/web`: user-facing Next.js portal
- `apps/admin-web`: admin Next.js portal
- `apps/api`: NestJS backend

Deployment assets live under `helm/`, with service charts in `helm/charts/*`. Local VS Code runtime images live in `infra/vscode`. Shared root config includes `turbo.json`, `tsconfig.base.json`, `.env.sample`, and `local-values.yaml`.

## Build, Test, and Development Commands
Run commands from the repository root unless noted otherwise.

- `npm run dev`: starts workspace dev tasks in parallel via Turbo
- `npm run build`: builds all apps
- `npm run typecheck`: runs TypeScript checks across workspaces
- `npm run typecheck --workspace @apps/web`: type-check one app
- `npm run build --workspace @apps/api`: build only the API
- `docker build -t agent-portal-web:latest -f apps/web/Dockerfile .`: build a local deploy image
- `helm upgrade --install agent-portal .\\helm --namespace agent-portal --create-namespace -f .\\local-values.yaml`: apply local Kubernetes changes

For changes that affect `apps/api`, `apps/web`, or `apps/admin-web`, assume local deployment is required unless explicitly told otherwise. Use the local deploy workflow and keep Docker/Helm references pinned to `:latest`.

## Coding Style & Naming Conventions
Use TypeScript throughout. Follow the existing style: 2-space indentation, double quotes, semicolons, and small focused functions. Use `PascalCase` for React components and Nest classes, `camelCase` for variables/functions, and kebab-case for non-code filenames where applicable. Prefer colocating page logic in `app/.../page.tsx` and API modules under `src/<domain>/`.

Frontend work in `apps/web` and `apps/admin-web` must use Mantine components and patterns. Do not introduce parallel UI libraries for core layout, forms, buttons, modals, tables, or overlays unless the repository already requires them in that exact area.
For frontend loading states, overlays, drawers, modals, tables, and form controls, use Mantine's built-in components first instead of custom implementations or parallel libraries.
Keep `apps/admin-web` aligned with `apps/web` in information architecture, navigation patterns, page-header structure, color usage, typography scale, and interaction behavior unless the user explicitly asks for an intentional divergence. When adding or revising admin UX, treat the user portal as the baseline reference for CX consistency.

Lint scripts are not configured yet, so `tsc --noEmit` is the minimum required validation.

## Testing Guidelines
There is no established unit test suite yet. Until one is added, treat type-checking and targeted manual verification as required:

- `npm run typecheck`
- validate affected UI flows in `apps/web` or `apps/admin-web`
- verify Helm or Kubernetes changes against the local `docker-desktop` cluster

When adding tests, place them next to the feature or under the owning module, and use clear names such as `workspaces.service.spec.ts`.

## Commit & Pull Request Guidelines
Recent commits use short, task-oriented subjects such as `화면수정, dockerfile,helm 수정` and `기능추가`. Keep commits concise, imperative, and scoped to one change. PRs should include:

- a short summary of user-visible changes
- impacted areas (`apps/web`, `apps/api`, `helm`, etc.)
- verification steps run
- screenshots for UI changes
- rollout notes for Docker or Helm changes

## Security & Configuration Tips
Do not commit real secrets. Use `.env.sample` as the template, and keep local overrides in untracked environment files. For local Kubernetes deploys, keep images pinned to `:latest` and verify Helm values before restarting workloads.

Security rules for all future changes:

- Treat authentication and authorization as part of the feature, not follow-up cleanup. Any new API route or UI flow must be reviewed for `401` and `403` behavior before finishing.
- Do not add or expand auth bypass behavior in production paths. `AUTH_BYPASS`-style shortcuts must remain development-only and must be explicitly gated by non-production environment checks.
- Do not enable permissive CORS by default for production. New API changes must preserve the allowlist model using `CORS_ALLOWED_ORIGINS`, and any production cross-origin requirement should be added deliberately.
- Admin-only APIs must be enforced on the server with role and permission guards. Never rely on hidden buttons or frontend routing alone to protect admin functionality.
- When an admin action needs to operate on resources owned by another user, implement an explicit admin service path such as `adminStop...` instead of reusing owner-scoped methods. Keep owner-scoped and admin-override code paths separate.
- Admin override actions must leave an audit trail that records both the acting admin and the original owner or target context. Favor reusable helper methods that accept an `adminOverride` flag rather than duplicating stop/delete logic.
- In `apps/web` and `apps/admin-web`, keep `401` and `403` handling centralized in shared auth/error helpers or boundaries. Avoid scattering one-off redirect logic across pages when a shared mechanism can enforce the same rule consistently.
- `401` should clear client auth state and redirect to the correct login entry point. `403` should keep the session intact and redirect to a safe page for the current app context instead of silently failing.
- Admin portal flows must verify admin role explicitly and redirect non-admin users back to the user portal rather than leaving them in a broken or partially loaded admin UI.
- Before shipping security-sensitive changes, at minimum run type-checks for every affected workspace and manually verify unauthenticated, authenticated-non-admin, and authenticated-authorized flows when relevant.
