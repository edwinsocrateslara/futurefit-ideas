# FutureFit AI Pathways — Architecture Reference

Factual reference for how the FutureFit AI Pathways product is built. Two repositories make up the system:

- **`web-client`** — the React 19 SPA frontend.
- **`ffai-pathways`** — the backend monorepo (NestJS microservices, Python ML/data services, AWS Lambdas, shared packages, CDK infra).

The doc is organized so a reader can scope a feature request without spelunking the codebases. Module, app, package, and concept names are used throughout; file paths and line numbers are intentionally omitted.

---

## Part A — System Overview

### Product

A multi-tenant career-pathway platform. Job seekers (`END_USER`), case-management coaches, recruiters, and tenant administrators all share one product, served per-tenant from one frontend deployment and one backend gateway. A sizeable Employment Ontario ("EO" / Empyra) integration constitutes a significant slice of backend code.

### Repo split at a glance

- The **frontend** (`web-client`) is a single-package pnpm project. It is the only thing users see. It talks to exactly one backend endpoint.
- The **backend** (`ffai-pathways`) is a pnpm + Turborepo monorepo containing 22 NestJS services, 8 Python services, ~35+ Lambdas, plus shared Node and Python packages and AWS CDK stacks. Its `mesh-gateway` service is what the frontend connects to; everything else sits behind it.

### Typical request flow

```
Browser (web-client)
  → urql GraphQL client (single auth-injecting client)
  → ffai-pathways mesh-gateway   (GraphQL Mesh, stitches subgraphs)
  → individual NestJS subgraph(s) (per-service GraphQL or REST internally)
  → Postgres (Prisma) or Mongo (Mongoose), depending on the service
  → optionally invokes Lambdas via lambda-proxy or async events
```

Async work uses Cognito hooks, S3 events, SNS/SQS, and EventBridge schedules — wired in CDK.

---

## Part B — Shared Concepts

These contracts span both repos; the reader needs to understand them once.

### AuthN — AWS Cognito

- Cognito User Pools per stage; tenant-specific app-client IDs.
- The frontend uses AWS Amplify 6 for sign-in / TOTP / forced-password-reset / federated SSO flows. Amplify is mid-migration from v5 → v6.
- Backend services and the gateway both verify JWTs. The shared `nest-auth-utils` package is the source of truth on the backend; the frontend's urql `authExchange` fetches tokens via `fetchAuthSession` and refreshes preemptively.
- Cognito hook Lambdas (`cognito-post-sign-up-lambda`, `cognito-pre-sign-up-lambda`, `cognito-pre-token-lambda`, `cognito-pre-authentication-lambda`, `cognito-messaging-lambda`, `cognito-update-tenant-id`) shape sign-up / sign-in.
- Tokens carry a `tenant_id` claim and an `is_machine` claim. Machine tokens authorize service-to-service traffic and commonly grant cross-tenant operations.

### AuthZ — roles and slugged permissions

- **Roles:** `super-admin`, `admin`, `coach`, `end-user`, `machine`, plus `recruiter` on the frontend and tenant-defined custom roles on the backend.
- **Permissions:** slug-encoded `resource:action:scope` strings, with `*` wildcards permitted in action/scope. Same shape on both sides.
- The slug registry lives in the `permissions` package inside `ffai-pathways` and is **synced into `access-control-service`'s Postgres DB on service startup**. The frontend reads its effective set via the GraphQL gateway.
- The permission system is **gated by a feature flag (`granular_permissions`)**. When off, the frontend falls back to role checks (`hasPermissions ?? isAdmin`); when on, slug checks become authoritative.
- Adding or renaming a permission therefore involves: updating the `permissions` package, redeploying `access-control-service`, updating defaults, and (often) wiring the new slug into the frontend's `useHasPermissions()` callsites.

### Multi-tenancy

- **Implicit, by JWT claim**, not by foreign key. The gateway reads `tenant_id` from the token and propagates it; services rarely have a hard `tenantId` FK — they have nullable columns and rely on per-service scoping logic.
- The frontend rarely thinks about tenant except when bootstrapping unauthenticated flows: a `?tc=<code>` URL param (base64-URL-encoded tenant UUID) selects the tenant for the sign-in screen.
- **Cross-tenant data leaks are an architectural risk** — any new query or mutation must scope by tenant.

### Feature flags — Statsig (with a legacy GraphQL source running alongside)

- **Statsig** is the primary system. Initialized in nearly every backend service via the shared `statsig` package; consumed on the frontend via `@statsig/react-bindings`.
- A **legacy GraphQL source** (`getUserFeatures`, `getTenantFeatures`) exists on both sides; the frontend treats it as authoritative when running in **shadow mode**, computing Statsig values in parallel and diff-logging them. Disabling shadow mode flips authority to Statsig.
- The in-house **`features-service`** (Postgres) is yet another source, used for tenant/user-scoped overrides on the backend.
- Cypress tests use a local-overrides adapter to flip flags via a global.

### GraphQL Mesh as the single public API surface

- All public traffic enters through `mesh-gateway`. It stitches every subgraph schema into a single endpoint.
- The gateway enforces global query-budget limits (depth, token count, cost, alias count), verifies JWTs via a custom fetcher, and uses `filterSchema` transforms in `.meshrc.yml` to hide internal-only subgraph operations.
- **REST exists inside the backend cluster only** — for internal `lambda-proxy` calls and OpenAPI-described services — and is not routed publicly.
- The gateway's `.mesh/` output is generated; never hand-edited. Any subgraph schema change requires a gateway rebuild.
- The frontend mirrors the schema in-repo as `schema.graphql` (~11k lines: 231 root queries, 329 root mutations) and runs `graphql-codegen` to produce typed hooks.

### Observability — New Relic everywhere

- Backend services run the New Relic agent and `@newrelic/apollo-server-plugin`. `mesh-gateway` configures an extensive `newrelic:` plugin block (including operation-name extraction from headers).
- The frontend dynamically imports `@newrelic/browser-agent`, gated on an env flag, and wraps it in a `monitor` utility (`noticeError`, `setUserId`, `setAttribute`, `addPageAction`).
- A custom urql `eventHeaderExchange` adds tracing headers to outgoing operations.
- **No Sentry, Datadog, or OpenTelemetry.** Heap is wired in addition to New Relic for product analytics.

### Other shared infrastructure

- **Intercom** — chat widget on the frontend; user-tag attribute sync from the backend (`tagging-service`) and lifecycle hooks in `user-profile-service`.
- **Locize / i18next** — translation backend used by the frontend; backend `translation-service` serves keyed strings via GraphQL for server-rendered content.
- **AWS** — Cognito, S3, SES, SNS/SQS, EventBridge, Lambda, ECS/Fargate, RDS Postgres (shared + reporting), MongoDB Atlas, ElastiCache Redis, SSM Parameter Store, Secrets Manager, ECR.
- **1Password** — deploy-time secrets, passed via `OP_SERVICE_ACCOUNT_TOKEN`.
- **DVC** — ML artifact versioning for Python data services.

### Common conventions across both repos

- Commit style: `<type>: <subject>` (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`).
- PRs follow each repo's `.github/PULL_REQUEST_TEMPLATE.md`. `ffai-pathways` requires a `jira_url:` line linking to `ffai.atlassian.net/browse/TICKET-###`.
- Pre-commit hooks run `lint-staged` (prettier + eslint); `web-client` additionally runs full-project `tsc`.

---

## Part B.1 — Product Entities (what each data piece means)

The product vocabulary cuts across the frontend and backend. These are described in product terms; persistence/ownership is noted parenthetically.

### People

- **User** — A person with credentials in AWS Cognito. Can belong to one or more tenants and holds one role per tenant. Cognito owns the identity; everything _about_ the user (career data, skills, work history, preferences, consent) lives in **Profile**. (Identity: Cognito; profile data: `user-profile-service` / Mongo. Authz joins: `access-control-service` / Postgres.)
- **Profile** — A user's working portfolio: career goal, skills (both self-declared and machine-inferred — the distinction is first-class), work experience, education, location, account preferences, consent settings, case notes, recommender search terms, notification settings, external identities. The most-read, most-written entity in the product. (`user-profile-service`.)
- **End-user / Job seeker** — User role `END_USER`. The primary subject of the product. Receives recommendations, takes assessments, saves jobs/courses/resources, follows an assigned roadmap of next steps, may be paired with a coach. The unauthenticated/onboarding flow ends with the user landing in this role.
- **Coach** — User role `COACH`. Manages a caseload of end-users — reviews their profile, assigns next steps, sets their roadmap, leaves case notes, communicates. Assignments are managed individually or via **Groups**.
- **Admin / Super-admin** — Tenant administrators. Roles `ADMIN` and `SUPER_ADMIN` (the latter has cross-cutting platform reach). Configure tenant content (resources, careers, learning providers, navigation), manage users/coaches, run reports.
- **Recruiter** — User role `RECRUITER`. Works on the employer side: views **Candidates**, saves talent, runs candidate searches, manages employer integrations. (`partners-service`.)
- **Candidate** — An end-user as seen from a recruiter's perspective. Same underlying profile; recruiter-facing presentation and saved-talent semantics.

### Organizations

- **Tenant** — A customer organization (typically a workforce-development agency, employment service, school board, or employer). Tenants partition all product data; the current tenant is resolved from the user's JWT claim. Each tenant has its own branding, navigation, learning providers, integrations, business resources, and feature-flag overrides. (Registry: `tenants-service` / Go + Postgres. Configuration: `customer-management` / Mongo.)
- **Employer** — A partner organization that hires through the platform. Has recruiter users, ATS-style integrations, groups/associations, onboarding state, and outbound email flows. (`partners-service` / Postgres.)
- **Group** — A grouping of users used for coach caseload assignment, analytics segmentation, or invitations. Admin-managed.
- **Invitation** — A pending join/onboarding record for a user not yet active in the platform (recruiter joins, employer onboarding, lead sign-up). Lifecycle is driven by `lead-sign-up-lambda` and related flows.

### Career domain

- **Career** — A target occupation (e.g. "Registered Nurse", "Software Developer"). Carries typical skills, salary information, education level, related roles, and recommender metadata. Drives the recommender outputs and the career-pathway visualization. (`career-service` / Mongo.)
- **CareerArea** — A grouping/category of careers (e.g. "Healthcare", "Skilled Trades"). Used for discovery, filtering, and per-tenant catalogue scoping.
- **Role (job-role)** — A specific role within a career. Sometimes synonymous with career, sometimes more granular. **Distinct from the RBAC "Role"** (see Authorization below).

### Employment

- **Job** — A real employment opportunity sourced from external job-board providers (LINKUP, REVELIO are the two known sources in the cache merge logic). Has two halves: relational metadata (applications, employer joins, saved-job state) in Postgres, and the searchable document corpus in Mongo (`mongo-jobs/ffai_v2`). Job search is one of the biggest product surfaces.
- **SavedJob** — A user's record of having saved a job. Junction-table data plus tracker state.
- **JobTrackerStage** — The stage a saved job is in (e.g. interested, applied, interview, offer, rejected). Tracked as append-only history; transitions are not validated client-side.

### Learning

- **Course / Learning** — A learning offering: an online course, in-person program, micro-credential, or training. Sourced from per-tenant configured learning providers. Recommended by `course-recommender`. Users save them via `save-learning`. (Catalogue: `career-service`. Provider config: `customer-management`. Saves: `save-learning` / Postgres.)
- **SavedLearning** — A user's saved-learning junction with `isRemoved` soft-delete.
- **Resource** — A generic piece of supportive content surfaced to users: an article, guide, video, or external service link. Recommended by `resource-recommender`. (Saves: `save-resource` / Postgres.)
- **BusinessResource** — A tenant-administered local resource — a real-world service offered in the user's area (food bank, childcare, transit subsidy, mental-health support). Surfaced primarily by coaches to address barriers to employment. Distinct from generic Resource: BusinessResources are tenant-curated and locally-relevant, generic Resources are catalogue content. (`customer-management` / Mongo.)
- **SavedCareer / SavedResource** — User saves for careers and resources, parallel to SavedJob/SavedLearning. (`save-career` / Postgres, `save-resource` / Postgres.)

### Assessments

- **Assessment** — A standardized test or questionnaire used to evaluate a user's skills, personality, or aptitudes. Delivered through external providers (Vervoe, Jofi). Results are persisted internally and consumed by recommenders, profile views, and coach surfaces. (`assessments-service` / Mongo, with `external-assessments/providers/{vervoe,jofi}`.)

### Journey

- **NextStep** — A single actionable item assigned to a user along their journey (e.g. "Complete resume", "Take skills assessment", "Apply to 3 jobs this week"). Configurations and metadata are per-tenant; user-specific progress lives separately. (`next-steps-service` / Mongo.)
- **Roadmap** — A coach-assignable sequence of NextSteps representing a user's plan. The roadmap is the surface a coach uses to direct a user's journey.
- **EmploymentActionPlan (EAP)** — An Employment Ontario-specific case document tracking an unemployed person's planned activities, services received, milestones, and outcomes through the EO program. EAPs have a strict state machine governed by EO/Empyra rules and are the most business-rule-heavy area of the entire backend. Synced bidirectionally with the external Empyra API via the `eo-*` lambdas and the `empyra-client` / `eo-client` packages. (`employment-services-connector` / Mongo.)

### Forms

- **Form / FormVersion** — A dynamic form schema a tenant configures for intake, surveys, or in-product questionnaires. Schemas are versioned because they evolve over time. (`form-builder` / Postgres.)
- **FormSubmission** — A filled instance of a FormVersion. Pinned to the specific FormVersion it was filled against so submissions remain readable after schema changes.

### Segmentation

- **Tag** — A taxonomy entry used to segment users (e.g. "needs-mentoring", "EO-eligible", "high-priority"). Both system-defined and tenant-defined tags exist.
- **UserTag** — The per-user application of a tag. Tag events also sync to Intercom as user attributes for marketing/comms. (`tagging-service` / Mongo.)

### Authorization (RBAC sense)

- **Role (RBAC)** — A named bundle of permissions: `super-admin`, `admin`, `coach`, `end-user`, `machine`, plus tenant-defined custom roles. A role can inherit from a base role via `inheritedFrom`. **Distinct from job-Role above.** A user holds one role per tenant.
- **Permission** — A `resource:action:scope` slug (e.g. `roles:view:all`, `users:assign-role:all`) describing a single capability. `*` wildcards permitted in action/scope. The `permissions` package is the source of truth.
- **UserPermission / TenantPermission / DefaultPermission** — Override layers. `DefaultPermission` is per-role baseline; `TenantPermission` is per-tenant override; `UserPermission` is per-user grant.
- **RevokedToken** — A JWT marked invalidated before its natural expiry (logout, forced re-auth). Checked on the auth path.

### Files

- **File** — A user- or system-uploaded artifact stored in S3 (resumes, exports, attachments). Issued via presigned URL through `file-management-service`, with SNS/SQS events for downstream consumers (e.g. `user-resume-parser` reacts to resume uploads).
- **Resume** — A specific file type with downstream parsing. Raw file in S3; parsed structured output in `ffai_resumeparser` (Postgres). Parsing is orchestrated through `user-resume-parser` + `llm-service`.

### Translations

- **Translation** — A keyed i18n string for a given locale, served via GraphQL. Used for server-rendered content (emails, exports, dynamic UI strings). Distinct from frontend i18next bundles. (`translation-service` / Mongo.)

---

## Part C — `web-client` (React 19 SPA)

### Purpose

The frontend for the platform. Serves five distinct user roles (`END_USER`, `COACH`, `ADMIN`, `SUPER_ADMIN`, `RECRUITER`) plus an onboarding flow, gated by both feature flags and granular permissions. Deployed per-tenant; authenticates against a per-stage AWS Cognito user pool; talks to the `mesh-gateway` for all data.

### Top-level structure

The repo is a single-package pnpm project (no monorepo). Conceptually it splits into:

- **Application source** — feature-organized React/TypeScript code (routes, pages, templates, components, contexts, hooks, utilities).
- **An internal design system** — a shadcn-style component library colocated with the app, with its own conventions doc and Storybook setup.
- **GraphQL operations and their generated TypeScript** — hand-written `.graphql` operation files plus a (very large) generated-types module produced by `graphql-codegen`.
- **A Cypress test suite** — both E2E specs organized by role, and component tests colocated next to the components they exercise.
- **A small Vitest unit-test layer** — limited in coverage; most logic is exercised through Cypress instead.
- **Per-environment config templates** — `.env.*` files copied locally during setup, plus shell scripts that pull Cognito/SSM config and provision tenants.
- **Custom ESLint rules** — local rules enforce design-system and Cypress selector conventions (logical CSS properties only inside the design system, `data-testid` only in Cypress, no `cy.waitForGraphqlIdle`).
- **GitHub Actions workflows** — separate build, unit-test, component-test, e2e, dev-promote, prod-promote, and storybook-deploy pipelines.

### Tech stack and versions

- **Language / build**: TypeScript ~5.4 (strict), Vite 7, Node version pinned via `.nvmrc`. pnpm enforced via `preinstall` hook.
- **UI runtime**: React 19.2, react-router-dom 6.30.3 (pinned — `useBlocker` depends on `navigator.block()`, which constrains upgrade paths).
- **Data layer**: urql 3 with `@urql/exchange-graphcache` 5, `@urql/exchange-auth` 1, `@urql/exchange-retry`, and `@urql/exchange-multipart-fetch`. No Apollo, no React Query, no REST client.
- **Auth**: AWS Amplify 6 (Cognito flows), `jwt-decode`, in-house `@futurefit-ai/jwt-claims-reader`.
- **Styling**: Tailwind v4 (PostCSS plugin), `class-variance-authority`, `tailwind-merge`, `clsx`. Multiple Radix UI primitives, `lucide-react` icons, in-house `@futurefit-ai/ffui` package, plus legacy `styled-components` 6 (discouraged in new code).
- **Forms**: react-hook-form 7, `validator`.
- **i18n**: i18next 25 + react-i18next 16, `i18next-chained-backend`, `i18next-locize-backend`, `locize`, `locize-lastused`. Bundled locales: `en-US`, `fr-CA`. Locize-only: `es-ES`, `pt-PT`.
- **Feature flags**: `@statsig/js-client` 3 + `@statsig/react-bindings`. `@statsig/js-local-overrides` is wired only for Cypress.
- **Monitoring**: `@newrelic/browser-agent` (dynamically imported, gated on an env flag). Heap analytics. Intercom chat widget.
- **Rich text / DnD**: `lexical` 0.42 + `@lexical/react`; `@hello-pangea/dnd`.
- **Codegen**: `@graphql-codegen/cli` 6 with `typescript-urql` and `typescript-urql-graphcache` plugins, plus two local CJS plugins (operation-name unions and raw documents).
- **Testing**: Vitest 3 + Testing Library (unit, very limited usage); Cypress 15 + `cypress-real-events`, `cypress-axe`, `@cypress/code-coverage`, `cypress-network-idle`, `cypress-terminal-report` (E2E and component).
- **Storybook**: 10.3 with `addon-a11y`.

A `graphql-ws` dependency exists in `package.json` but `unclear:` whether any active subscription operations use it.

### Architecture

#### Backend boundary

- **One GraphQL endpoint** is the entire backend surface. The same Mesh gateway URL is used for authenticated and unauthenticated traffic; an additional URL is used by codegen at build time, with an API key.
- **No internal REST**. A single Vite dev proxy exists for a recommender-image asset path.
- **No active GraphQL subscriptions**, despite `graphql-ws` being installed.
- **Auth header injection** is handled by the urql `authExchange`, which fetches Cognito tokens via `fetchAuthSession` and refreshes preemptively when expiry is near.

#### Code-generated vs hand-written

- **Hand-written** by feature authors: `.graphql` operation files (queries, mutations, fragments) and React/TypeScript code that consumes the resulting hooks.
- **Generated** from the schema + operation files by `pnpm run gen`: a typed-hooks module (≈35k lines), a `rawDocuments` module (operation text indexed by name, used for Cypress intercepts), an `operationNames` module (string-literal unions of query/mutation names), and a schema mirror. These outputs are committed but are never edited by hand; they regenerate before every dev start and are required for typecheck.

#### Provider tree and routing

Application bootstrap mounts a single router whose layout wraps `AppRoutes` in a fixed chain of providers, ordered:

`Suspense → I18next → Auth → Graph → Statsig → Feature → SatisfactionRating → Downvote → StyleSheetManager → Page`

The top-level route split reads `useAuth()` and lazy-loads either the authenticated or unauthenticated app. Inside the authenticated app, a single component owns role-routing: it fetches the current user's tenant, profile, and role, then renders one of the role-scoped route trees — `StaffRoutes`, `AdminRoutes`, `CoachRoutes`, `RecruiterRoutes`, `BaseUserProfilingRoutes`, `OnboardingRoutes`, or the default end-user `AuthenticatedRoutes`. The branch on `granular_permissions` (the "staff path") routes admins, coaches, and recruiters into a unified staff layout when the flag is on and the user is onboarded; otherwise a role switch is used.

Most route components are `React.lazy`'d, so initial navigation incurs a chunk load.

#### State

- **Primary state container is React Context.** Auth, the urql client, feature flags, page metadata, onboarding/profiling state, and a few cross-cutting UI flags each have their own provider.
- **Jotai is installed but considered legacy** — not for new code.
- **Server state is the urql graphcache**, configured centrally with explicit `keys`, `resolvers`, `updates`, and `optimistic` entries (especially for saved jobs and saved candidates).
- **localStorage / sessionStorage** are used for tenant favicon/title, Cognito identity-provider keys (cleared on signout), tenant-code overrides, and a set of catalogued keys for ephemeral filter state.

The urql client is **recreated whenever `user.token`, the session getter, or `i18n.language` changes**, which tears down the in-memory cache. This is load-bearing for language switching but means in-flight state is lost on those transitions.

### Domain model (frontend view)

#### Entities the frontend cares about

- **Tenant** — multi-tenancy root. Resolved server-side from the user's token (or via `?tc=<code>` for anonymous traffic).
- **User** — Cognito-backed identity. `UserProfile` (career, skills, work history) is a separate entity.
- **UserRole** — enum: `END_USER`, `COACH`, `ADMIN`, `SUPER_ADMIN`, `RECRUITER`. An `isAdmin` helper covers `ADMIN | SUPER_ADMIN`.
- **Permission** — `resource:action:scope` slug with `*` wildcards. Effective set fetched only when `granular_permissions` is on.
- **Career, CareerArea, Role** — career-domain entities returned by recommender services.
- **Course, Resource** — learning content, served by separate recommenders.
- **Job, SavedJob, JobTrackerStage** — work-domain entities. Saved-job state has a viewable-stages set and is tightly coupled to urql graphcache optimistic resolvers.
- **Candidate** — recruiter-facing entity.
- **BusinessResource** — admin-managed resources for tenant business services.
- **Form / FormVersion / FormSubmission** — dynamic form-builder entities.
- **NextStep / Roadmap** — coach-assignable user roadmap entities.
- **Assessment** — third-party assessment integrations.
- **Group / Coach assignments** — admin-managed coach groups.
- **Employer / Recruiter / Invitation** — business-services side.

#### State machines

- **Sign-in challenges**: regular sign-in may resolve directly, request TOTP confirmation, or require a forced new password. Handled in the sign-in template and `AuthContext`.
- **Onboarding flows**: separate provider tree and route trees for onboarding/profiling. A user must reach an "onboarded" state before the role-specific layout activates.
- **Job tracker stages**: tracked as append-only history; transitions are not validated client-side.
- **Token revocation**: on signout, the client makes a best-effort revocation call; the JWT remains valid in Cognito until natural expiry. Cross-tab logout is broadcast via a `BroadcastChannel`.

### Extension surfaces

#### Adding a GraphQL operation

Write a `.graphql` file in the appropriate `graphql-mesh/{queries,mutations,fragments}` folder. The operation name in the file is the basename in camelCase. Run codegen, which produces a typed `useXQuery` / `useXMutation` hook, a `XDocument` node, and the variable/result types. Import the hook and use it. Cache resolvers and optimistic updates are **not** auto-wired — if the mutation affects cached entities, you must extend the central graph context to keep the cache in sync.

#### Adding a route

Routes are not auto-discovered. Add a `const enum` entry in the routes constants module (route strings are never hardcoded), add a thin page component, optionally add a template that holds the business logic, and wire it into the appropriate role-scoped routes file. Routes are typically lazy-loaded. End-user navigation entries are additionally gated on a tenant `configuredNavItems` list and a `NavDisplayTabEnum`.

Routes are typically gated by some combination of: a feature flag (`useFeatures()`), a permission check (`useHasPermissions()`), a tenant configuration value, and the user's role.

#### Adding a feature flag

Add a slug to the `Feature` enum (currently ~42 entries). Add a typed boolean to the feature context type and compute it from the flag set in the provider's value object. If the flag has a Statsig gate counterpart, add the mapping in the shadow-mode utility. The flag is then consumable via `useFeatures()`.

#### Adding a shared UI component

Components in the internal design system follow a stricter convention than feature components. They must use Tailwind + CVA, the `cn()` utility, semantic `data-slot`/`data-variant`/`data-size` attributes, and **CSS logical properties only** (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`/`text-start`/`text-end`) — a local ESLint rule blocks physical-direction utilities inside the design-system folder. Each component needs a Storybook story and a Cypress component test that enables auto-a11y (axe-core). Outside the design system, shared feature components live next to the features that use them and may also pull from the in-house `@futurefit-ai/ffui` package; some legacy code still uses `styled-components`.

#### Adding a Cypress test

E2E specs are organized under `cypress/e2e/Flows/{Job_Seeker,Recruiter,Super_Admin}` with sub-folders for major areas (Onboarding, Localization, Resources, Work). Selectors must be `[data-testid]` based — multiple local ESLint rules ban CSS-class selectors, tag-only selectors, nested selectors, multiple `cy.get` chains, and `cy.contains`-as-action. `cy.waitForGraphqlIdle` is banned; waits should be on UI feedback. `cy.type` is globally overridden to `cypress-real-events`'s `realType` for React 19 compatibility. Dynamic test accounts are created and torn down per spec. Cypress runs in Chrome only, with `runMode` retries set to 2.

Component tests are colocated with the component file as `*.component.cy.tsx` and use `cy.mount` with mock providers.

#### Adding an external integration

There is no generic pattern — current integrations are scattered: Cognito flows live inside `AuthContext`, New Relic is abstracted by a thin `monitoring` wrapper, Intercom and Heap are wired as global side-effects, Statsig has a dedicated provider, Google Places is consumed via the npm package directly inside location-input components, and the Merge API is wrapped by a single hook. Pick the closest analog when adding a new one; if it is user-facing data, prefer routing it through the GraphQL gateway over a direct fetch.

### Cross-cutting concerns (frontend specifics)

- **Error handling.** A class-component `ErrorBoundary` reports React render errors to New Relic with an `errorType: 'react-error-boundary'` tag. GraphQL errors flow through an `errorExchange` in the urql pipeline that forwards them to New Relic. Auth errors trigger token refresh via the `authExchange`'s `didAuthError` / `willAuthError` / `getAuth` hooks. Cognito-specific errors are pattern-matched by name and message string in sign-in templates.
- **Caching.** urql graphcache is configured in one central module covering explicit `keys` resolvers (many embedded types return `null` to be treated as values), pagination resolvers (notably custom merge logic for `searchJobsV2` across LINKUP/REVELIO providers), updates resolvers, and inline optimistic resolvers for saved-jobs and saved-talents mutations. The optimistic resolvers duplicate fragment shapes inline via tagged-template `gql` literals; any change to those entity fragments has to be mirrored here. The cache is keyed in part on `i18n.language`, so switching languages clears it.
- **i18n.** `en-US` and `fr-CA` are bundled at build time; `es-ES` and `pt-PT` are Locize-only. The Locize write API key is sensitive and is only attached to the runtime config when `VITE_ENV === 'local'` — it must never ship to deployed builds. Live translation behaviour is gated by a feature flag.
- **Configuration and secrets.** Stage-specific `.env.*` files are copied from `config-v2/` during local setup. A shell script pulls Cognito IDs from AWS SSM into `aws-exports.json`. Tenant fixtures for local dev are JSON files referenced by a provisioning script. Vite injects `VITE_*` env vars into `index.html` via a custom plugin. Critical env vars include the GraphQL host (runtime and codegen variants), the Cognito API key, the Statsig client key, the New Relic toggle, the Locize key (local only), and the Intercom app id.

### Friction points (factual)

- **The central graph context module is a single large file** that owns the urql client config, every cache `keys`/`resolvers`/`updates`/`optimistic` entry, every pagination merge function, and the inline fragment definitions used by optimistic resolvers. There is no per-domain split; saved-jobs logic alone is a significant fraction of the file.
- **The auth context module is similarly broad**: it owns Amplify configuration, Cognito sign-in flow handling, Intercom lifecycle, cross-tab logout via `BroadcastChannel`, and token-revocation HTTP.
- **A single component decides role layout** for the authenticated app — it fetches user/tenant/role/profile, owns the staff-path predicate based on `granular_permissions`, mounts onboarding and profiling providers, and applies title/favicon/Intercom side-effects.
- **Route enums are split across multiple `const enum`s** in the routes constants module. `const enum` values are inlined at compile time, which can affect refactoring tools.
- **Vitest coverage is sparse** — only a handful of `*.spec.ts(x)` files exist in `src/`. Most behavior is covered by Cypress component or E2E tests, which are slower to run and debug. The urql cache logic has no visible unit tests.
- **Two feature-flag systems coexist** (legacy GraphQL features + Statsig) running in shadow mode by default. Migrations and rollouts have to consider both.
- **The pinned `react-router-dom` cap (6.30.3)** is required for `useBlocker`'s use of `navigator.block()`. A dedicated migration plan doc tracks this work.
- **Generated GraphQL types are required for typecheck**, which is enforced at pre-commit by `tsc` running on the whole project (not just staged files). Forgetting `pnpm run gen` after pulling fails the commit.
- **`aws-exports.json` is referenced as a typed import** but is generated, not committed; missing it breaks typecheck and Cypress config.
- **Some loose runtime contracts exist** — `(window as any).Intercom(...)` calls, `as any` casts in optimistic resolvers where graphcache generics don't line up, and an `IUser` shape with optional `token` / `cognitoUser` / `error` that callers must runtime-guard.

### Conventions

- Pages live under `pages/`, named `<Name>Page.tsx`, and are typically thin wrappers that render a template.
- Templates live under `templates/<domain>/` and carry the business logic for a feature.
- Feature components live under `components/<domain>/`. The `.component.tsx` suffix is used in some places and not others — the convention is mixed.
- Design-system components use PascalCase file names inside kebab-case directories and follow the stricter rules described above.
- Unit tests are `*.spec.ts(x)`. Cypress component tests are `*.component.cy.tsx` (preferred) or `*.cy.tsx` (legacy). E2E specs are `cypress/e2e/Flows/<Role>/<feature>.cy.ts`.
- GraphQL operation files use camelCase basenames matching their operation name.
- Route strings are never hardcoded; values come from typed `const enum`s.
- Imports use relative paths — there is **no `@/*` path alias** even though `vite-tsconfig-paths` is installed.

---

## Part D — `ffai-pathways` (Backend Monorepo)

### Purpose

The backend for the platform. Bundles NestJS/TypeScript microservices, Python/FastAPI ML/data services, AWS Lambda functions, shared Node and Python packages, and AWS CDK infrastructure. The product domain centers on user career-pathway management — user profiles, assessments, careers, jobs, skills, learning, partner integrations — with a sizeable Employment Ontario integration.

### Workspace structure

The repo is a pnpm + Turborepo workspace with three "app" trees, two "package" trees, plus infra, e2e, scripts, and templates.

#### `apps/eng_services/` — TypeScript/NestJS microservices

- `access-control-service` — RBAC: users, roles, permissions, and their tenant-scoped joins (`UserRolesPerTenant`, `TenantPermission`, `UserPermission`, `DefaultPermission`, `RevokedToken`). Postgres via Prisma. GraphQL subgraph. Syncs permission slugs from the `permissions` package on startup. The authoritative source for "what is this user allowed to do."
- `assessments-service` — User assessments and external-assessment provider integrations (Vervoe and Jofi adapters under `external-assessments/providers/`). Persists assessment runs and results in Mongo, brokers traffic to external providers for delivery/scoring, and exposes results via GraphQL for downstream surfaces (recommenders, profile, next-steps).
- `career-service` — Career-pathway and learning catalogue domain: careers, career areas, career search, courses, role search, generic resources, and recommender image references. GraphQL. Mongo. Several of the Python recommender services consume data shaped here.
- `customer-management` — Tenant/customer configuration and content. Per-tenant configuration of business resources, careers, courses, learning providers, country/division settings, integrations, Looker insight definitions, miles-chat config, asset references, and pipeline metadata. Mongo. The most common place to add a new per-tenant toggle or content type.
- `employment-services-connector` — Employment Ontario (EO / Empyra) integration. Owns the Employment Action Plan (EAP) lifecycle and its state machine — the most business-rule-heavy area in the repo. REST + GraphQL. Mongo. Coordinates with `eo-*` lambdas for async work and relies on the `empyra-client` / `empyra_api_types` / `eo-client` / `eo_api_types` packages.
- `features-service` — In-house feature-flag store (complement to Statsig). Postgres. Supports global feature definitions plus tenant-scoped and user-scoped overrides (`tenant_features`, `user_features`).
- `file-management-service` — S3 presigned-URL issuer for uploads/downloads. Emits SNS/SQS file events that other services and lambdas subscribe to. Postgres for file metadata. Still on AWS SDK v2 (one of the highest-complexity remaining v3 migrations).
- `form-builder` — Dynamic form schemas and submissions. Exposes both REST controllers and GraphQL. Postgres via Prisma, plus a bespoke `nodejs-migrations` runner alongside Prisma migrations, and an in-process cache layer.
- `job-service` — Job listings and job search. Two halves: relational metadata (saved jobs, applications, employer joins) in Postgres via Prisma; large search-document corpus in the `mongo-jobs` Mongo cluster (`ffai_v2` database). Holds the bulk of search/query logic in the monorepo and the most `any`-typed surfaces.
- `lambda-proxy` — GraphQL facade that invokes downstream Lambdas synchronously or asynchronously, fronting flows that don't run inside long-lived services (CSV export, bulk delete, find-users-to-notify, etc.). Used to keep heavy or scheduled workloads out of always-on services.
- `mcp-service` — Model Context Protocol service for internal AI tooling. _unclear: whether this is purely internal or has user-facing reach._
- `mesh-gateway` — GraphQL Mesh subgraph stitching. The public API surface; routes most external traffic, enforces global query-budget limits (depth/token-count/cost/alias-count), verifies JWTs via a custom fetcher, and applies `filterSchema` transforms in `.meshrc.yml` to hide internal-only subgraph operations. The generated `.mesh/` output must never be hand-edited.
- `next-steps-service` — User journey "next steps" and roadmap. Owns next-step configurations and metadata per tenant, user-specific progress state (`user-next-steps`), and downstream integrations that act on next-step events (`user-next-steps-integrations`). Mongo.
- `partners-service` — Employer and recruiter management. Covers employers, recruiters, employer onboarding / groups / associations / integrations, recruiter profiles, saved talent, group invitations, and outbound email flows. Postgres via Prisma.
- `save-career`, `save-learning`, `save-resource` — Three near-identical CRUD subgraphs. Each is a thin "save / un-save" junction table (`userUuid + <entity>Uuid`) with `isRemoved` soft-delete and nullable `tenantId` for multi-tenancy. Postgres via Prisma. Useful as a reference template for new lightweight subgraphs.
- `tagging-service` — Tag taxonomy plus per-user tagging. Includes Intercom sync for user-tag attributes, AWS SNS integrations for tag-driven events, and per-tenant tag configurations. Mongo.
- `tenants-service` — Multi-tenancy registry: tenant lifecycle, configuration, and tenancy metadata. The only Go service in the monorepo. Postgres. Migrations are raw SQL under its `db/` folder, applied via the service's own migrate command.
- `translation-service` — i18n string bundles for the product. Mongo-backed translation store served over GraphQL; consumers fetch translations by key/locale rather than embedding strings.
- `user-profile-service` — De-facto user system of record. Owns profile, preferences, settings, consent, Cognito integration, Intercom sync, geocoding, profile export reports, work experience, ratings, account preferences, skills (inferred vs non-inferred), onboarding config, seeders, a CLI, and cron jobs. Mongo. Most user-related features end up routing through this service.
- `user-resume-parser` — Resume parsing, storage, and retrieval. Accepts uploaded resumes, drives parsing (via lambdas + `llm-service`), and stores structured parsed output for downstream consumers (recommenders, profile, search). Postgres (`ffai_resumeparser` database).
- `wiremock-service` — Wiremock instance used to mock external partners (EO/Empyra and other third-party HTTP dependencies) in tests and local development. No business logic of its own.

#### `apps/data_services/` — Python / Poetry services

- `candidate-recommender`, `career-recommender`, `course-recommender`, `resource-recommender`, `work-recommender` — Five Python recommender services built on the Connexion / swagger-codegen `swagger_server` pattern. Each owns its own recommendation logic and model/data inputs. `candidate-recommender` and `work-recommender` ship explicit `guardrail/` modules; `career-recommender` additionally serves a career-pathway visualization and bundles a `data_loader`. Most data inputs come from CSV / pickled artifacts, several of which are DVC-tracked.
- `llm-service` — OpenAI inference and embeddings hub. Hosts many feature-area routers — `attributes_generation`, `course_attributes_generation`, `recommender_search_terms`, `recommender_guardrails`, `skills_proficiency`, `resume`, `search`, `work` — so most LLM-using product surfaces converge here. FastAPI. The single highest-leverage service for adding new generative-AI features.
- `job-title-classifier` — FastAPI service that classifies/normalizes job titles. Loads DVC-tracked model artifacts at startup; exposes FastAPI routers under `server/routers/`.
- `skill-classifier` — FastAPI service that extracts and classifies skills from free-form text (resumes, course descriptions, job postings). Includes a separate `credential_classifier` for credentials/certifications and a generic `extractor`. Uses DVC-tracked model artifacts.

#### `apps/lambdas/` — TypeScript AWS Lambda functions

Categories (not exhaustive):

- **Cognito hooks** — `cognito-post-sign-up-lambda`, `cognito-pre-sign-up-lambda`, `cognito-pre-token-lambda`, `cognito-pre-authentication-lambda`, `cognito-messaging-lambda`, `cognito-update-tenant-id`.
- **Employment Ontario async** — `eo-entity-sync-lambda`, `eo-auto-healing-lambda`, `eo-eap-*`, `eo-failure-detection-lambda`, `eo-metrics-lambda`.
- **File/document workflow** — `file-upload-url-lambda`, `file-download-url-lambda`, `delete-s3-lambda`, `next-steps-*-doc-lambda`.
- **Profile/user lifecycle** — `bulk-delete-users-lambda`, `move-users-lambda`, `lead-sign-up-lambda`, `export-profile-*-lambda`, `find-users-to-notify-lambda`.
- **Tagging / notification** — assorted.

The full deployable list is enumerated in `deploy_config.json`.

#### `apps/docker_lambdas/` — Container-image Python Lambdas

- `hello-world-python-lambda` (example), `resume-content-retriever`.

#### `packages/node_packages/` — Shared TypeScript libraries

- `nest-auth-utils` — JWT verification, `AuthGuard`, `MachineGuard`, `PermissionGuard`, `RoleGuard`, `TenantGuard`, plus decorators (`@Token`, `@Roles`, `@RequirePermissions`, `@SessionRestricted`). Wires the Redis-backed `PermissionCacheService`.
- `permissions` — Single source of truth for permission slugs and default role-to-permission mappings. Synced into the access-control DB on service startup.
- `jwt-verifier` — Cognito JWT verification primitives.
- `logging-lib` — `FFAILogger`, NestJS logger module, New Relic-aware Apollo plugin.
- `nest-utils` — Misc NestJS helpers (ALB keepalive, etc.).
- `nest-cli-utils` — Helpers for `nest-commander` CLI scripts.
- `statsig` — Statsig server-SDK wrapper module (feature flags) with shadow-mode support.
- `eo-client`, `eo_api_types`, `empyra-client`, `empyra_api_types` — Generated/typed clients for the Employment Ontario / Empyra APIs (generated from OpenAPI).
- `common-service-connector` — Shared HTTP client/connector patterns between services.
- `db-query-ir` — Cross-DB filter expression normalization. _unclear: full list of consumers and whether this represents a migration path._
- `mongodb-atlas-utils`, `html-utils`, `lambda-runners`, `lambda-utils`, `signup-utils`, `shared-types`, `locking-lib`, `eslint-plugin-ffai`.

#### `packages/python_packages/` — Shared Python libraries

- `py-permissions`, `py-pathways-statsig`, `py-data-models`, `py-ffai-api-client`, `jwt-claims-reader-py`, `ffai-heap-logging`, `ffai-skill-match-artifact`, `ffai-career-distance-matrix`.

#### Other top-level trees

- `infra/` — AWS CDK (TypeScript) stacks. Reusable constructs plus per-service stacks.
- `e2e_testing/` — `api_tests`, `ui_tests`, `perf`.
- `scripts/` — One-off migrations, local services CLI, build helpers.
- `templates/` — Boilerplate for new services and lambdas.
- `deploy_config.json` — Declarative manifest of every deployable service/lambda/docker-lambda, validated by `deploy_config_schema.json`. Used by CI and CDK.

### Tech stack

- **Node** 20+ (`.node-version` is 20; root `engines` is `>=20`; some lambda packages target Node 24 via `@types/node`; CLAUDE.md states "Node 24+" — see Known Drift).
- **pnpm** 8.15.9 (pinned via `packageManager`).
- **Turborepo** 2.9.5.
- **Python** 3.10 / 3.12 via Poetry.
- **Go** 1.23 (tenants-service only).
- **NestJS** 11.1.x with `@nestjs/graphql` 13.2.5, `@nestjs/apollo` 13.2.1, `@apollo/server` 5.0.0 (mid-migration from 4 to 5).
- **GraphQL** federation via subgraphs stitched by `mesh-gateway` (GraphQL Mesh).
- **Prisma** 6.19.x for Postgres-backed services.
- **Mongoose** 11.0.3 via `@nestjs/mongoose` for Mongo-backed services.
- **FastAPI** for Python data services.
- **AWS SDK** mid-migration from v2 to v3.
- **Cache** via `cache-manager` 6 + `ioredis` 5; shared Redis referenced through SSM parameters.
- **Observability** via New Relic agent and `@newrelic/apollo-server-plugin` per service; logs via `FFAILogger`.
- **DVC** for ML artifacts (CSV/parquet/pickle/model).
- **Testing** via Jest 29 (TS) and pytest (Python). Cypress for UI e2e (_unclear: exact Cypress version_).

### Architecture

#### Service communication layers

1. **Edge — `mesh-gateway`.** GraphQL Mesh stitches every subgraph schema into a single endpoint. The gateway enforces global query budget limits (depth, token count, cost, alias count), verifies JWTs via a custom fetcher, and uses `filterSchema` transforms in its `.meshrc.yml` to hide specific subgraph operations (e.g. internal-only mutations).
2. **Engineering services.** Each NestJS service exposes its own GraphQL endpoint (or REST controllers in a few cases like `save-resource`). Each service independently authenticates JWTs via `AuthGuard`. Service-to-service traffic uses HTTP with machine tokens obtained from `TokenClient` (in `@futurefit-ai/shared-utils`).
3. **Async/event.** Lambdas triggered by Cognito hooks, S3 events, SNS/SQS, EventBridge bridges (declared in CDK), and scheduled triggers (`*-poll-lambda`). `lambda-proxy` bridges GraphQL to Lambda for synchronous flows like CSV export and bulk-delete.

#### Generated vs hand-written code

- `mesh-gateway/.mesh/` is **generated** by Mesh from subgraph schemas. Never hand-edit. Any subgraph schema change requires a gateway rebuild.
- Each NestJS service's `schema.graphql` is **autogenerated from TypeScript decorators** (code-first). Do not hand-edit; regenerate via `gen-typings`.
- `eo_api_types` and `empyra_api_types` contain **generated** types from upstream OpenAPI specs.
- Prisma client output is per-service (`output = "../node_modules/.prisma/client/<service>"`) to avoid type clobbering in the workspace; imports look like `from '.prisma/client/<service>'`. Each service's `main.ts` calls `newrelic.instrumentLoadedModule('@prisma/client', prisma)` before NestFactory to wire APM to the non-standard path.

### Domain model

There is no single domain model; each service owns its own schema, and several core entities (User, Tenant, Job, Profile) appear with different shapes across services. The gateway uses type-renaming transforms to reconcile, and `db-query-ir` exists to normalize cross-DB filter expressions.

#### Core entities and owners

- **User, UserRolesPerTenant, Role, Permission, UserPermission, TenantPermission, DefaultPermission, RevokedToken** — owned by `access-control-service` (Prisma/Postgres). Many-to-many user ↔ tenant ↔ role via composite-keyed `UserRolesPerTenant`. Roles inherit from a base role via `inheritedFrom`. Permissions are slug-encoded.
- **Profile** — owned by `user-profile-service` (Mongoose). Contains nested objects covering career area, skills, education, work experience, external identities, case notes, account preferences, notifications, and recommender search terms. Inferred vs non-inferred skills are first-class.
- **SavedResource / SavedCareer / SavedLearning** — owned by the respective `save-*` services. Simple junction tables (`userUuid + resourceUuid`) with `isRemoved` soft-delete and nullable `tenantId` (multi-tenant scoping enforced at the service layer).
- **EmploymentActionPlan (EAP)** — owned by `employment-services-connector` (Mongoose). The state machine here is the most business-rule-heavy area in the repo.
- **Job** — split: relational metadata in `job-service`'s Postgres half; search documents in `job-service`'s Mongo half (`mongo-jobs/ffai_v2`).
- **Tenant** — registered in `tenants-service` (Go + Postgres).

#### Cross-service invariants

- **Multi-tenancy by JWT claim, not foreign key.** JWTs carry `tenant_id`; services read it from request context. Machine tokens may override via `x-tenant-id` header. Every query/mutation must scope by tenant; loss of scoping is a cross-tenant data leak. Schemas typically have a nullable `tenant_id` column rather than a hard FK.
- **Permissions are code, not DB-managed.** The `permissions` package is source of truth for slugs and default mappings. `access-control-service` syncs them on startup. Adding a permission requires updating the package, redeploying `access-control-service`, and often updating default-permission mappings.
- **Session-restricted tokens.** Users in flows like forced-password-reset hold session-restricted tokens. `AuthGuard` rejects them by default; resolvers/controllers must opt-in via `@SessionRestricted()`.
- **Machine tokens.** `is_machine` claim authorizes service-to-service calls and commonly grants cross-tenant operations. Service-to-service callers must use `TokenClient.getMachineToken()`.
- **Soft delete.** `save-*` services use `isRemoved` flags. `user-profile-service` similarly soft-deletes profiles.
- **Default role is `end-user`.** When no role row exists, the role service returns `end-user` rather than denying access. "No record" is not the same as "unauthorized."

### Persistence map

#### PostgreSQL — `postgres` (shared RDS instance)

One database per service:

- `access_control_service` (Prisma)
- `features_service` (Prisma)
- `file_management_service` (Prisma)
- `form_builder` (Prisma)
- `job_service` (Prisma; relational half only)
- `partners_service` (Prisma)
- `save_career_service` (Prisma)
- `save_learning_service` (Prisma)
- `save_resource_service` (Prisma)
- `tenants_service` (Go service; raw migrations in its `db/` folder)
- `ffai_resumeparser` (Prisma; `user-resume-parser`)

#### PostgreSQL — `postgres-reporting`

Separate RDS instance for analytics, reporting queries, and S3 data exports. Isolated from transactional workloads.

#### MongoDB Atlas — `mongo` (global cluster)

Databases: `profile`, `global`, `nest`. Used by: `user-profile-service`, `assessments-service`, `tagging-service`, `next-steps-service`, `career-service`, `customer-management`, `translation-service`, `employment-services-connector`.

#### MongoDB Atlas — `mongo-jobs`

Database: `ffai_v2`. Used by: `job-service` (search half).

#### Migration models

- **Prisma services:** edit the service's `schema.prisma`, generate a migration with `prisma migrate dev --name <name>`, commit the timestamped migration folder. `prisma migrate deploy` runs at service start. The per-service `output` line on the Prisma generator must be preserved.
- **Mongo services:** add a `@Schema()` class and register it via `MongooseModule.forFeature`. There is no Mongoose-driven migration framework; indexes are managed via Atlas plus ad-hoc scripts under `scripts/atlas_index_migration` and `scripts/mongo_ttl_index_migration`. Data migrations are one-off scripts under each service's `scripts/` or under top-level `scripts/`.
- **Go service:** SQL migration files under `tenants-service/db/`, applied via the service's migrate command.

### Auth model (backend specifics)

- **JWT verification** lives in `nest-auth-utils`. `AuthGuard` calls `FFAIPathwaysJwtVerifier.verify()`. The Cognito user pool ID is injected via `AuthGuardModule.forRoot({ userPoolId })` in each service's app module.
- **Roles** enforced via `@Roles(...)` + `RoleGuard` / `LocalRoleGuard`.
- **Permissions** enforced via `@RequirePermissions('slug')` + `PermissionGuard` / `LocalPermissionGuard`. Per-user permission lookups are cached in Redis via `PermissionCacheService`.
- **Tenancy:** Enforced by `TenantGuard`, or inline by reading `token.tenant_id`.
- **Machine identity:** `MachineGuard` + `MachineTokenModule`. Service-to-service callers acquire tokens through `TokenClient`.
- **Session restriction:** Opt-in per resolver/controller via `@SessionRestricted()`.

### Extension surfaces

#### Adding a GraphQL operation to an existing service

Add a NestJS module (`feature.module.ts`, `feature.resolver.ts`, `feature.service.ts`, `dto/`, `entities/`, co-located `*.spec.ts`). Register guards via `@UseGuards` and decorators (`@Roles`, `@RequirePermissions`, optionally `@SessionRestricted`). Import the module into the service's `app.module.ts`. `schema.graphql` regenerates from decorators. For public exposure, the gateway must be rebuilt to pick up the new subgraph types, and `.meshrc.yml` filter transforms may need updating.

#### Adding a REST endpoint

Use NestJS `@Controller` + verb decorators + `@Version('N')`. Same guard decorators apply. REST is generally not exposed publicly via the gateway; it is used for internal calls and OpenAPI-described services.

#### Adding a permission

Declare the slug in the `permissions` package, add it to the appropriate role's defaults, redeploy `access-control-service` (which re-syncs slugs to the DB at startup), then guard resolvers/controllers with `@RequirePermissions('new-slug')`. Renames are a coordinated multi-PR effort because of the sync.

#### Adding a background job or Lambda

- **In-service cron:** NestJS `@Cron` under the service's `cron/` folder.
- **Standalone TS Lambda:** scaffold from `templates/sample-lambda/`, add an entry to `deploy_config.json` (with `workspace_name`, `parent_dir`, `artifact_name`, `node_version`), and add a CDK stack under `infra/stacks/lambdas/`.
- **Docker Lambda (Python):** scaffold from `templates/sample-docker-lambda` and `templates/sample-python-Dockerfile`, with `python_version` and optional `uses_dvc` in `deploy_config.json`.
- For S3 / Cognito / EventBridge triggers, wire the event source in the CDK stack. For cross-service e2e participation, add the lambda to the e2e turbo `dependsOn` list (a lint rule enforces this).

#### Adding a database table or collection

Per persistence-map flow above.

#### Adding an external API integration

Generate the typed client into `packages/node_packages/<service>_api_types/` (model on `empyra_api_types` / `eo_api_types`, which are generated from OpenAPI). Wire actual client logic into a sibling `*-client` package. Consume via `workspace:*`. Add credentials to `deploy_config.json` and provision via SSM/Secrets Manager in the consumer's CDK stack.

#### Adding a shared package

Scaffold from `templates/sample_node_package/`. Add to `pnpm-workspace.yaml` if outside default globs (the existing globs cover `packages/node_packages/*` and `packages/python_packages/*`, so usually no change). Consumers reference via `"@futurefit-pathways/<name>": "workspace:*"`. NestJS-injectable libraries expose a `*.module.ts` with `forRoot()` / `forRootAsync()` (see `statsig` and `nest-auth-utils` for the pattern). Turbo picks the package up via `^build` automatically.

### Cross-cutting concerns (backend specifics)

- **Observability.** New Relic per-service `newrelic.js` config; Apollo NR plugin in every NestJS GraphQL module; `mesh-gateway` configures an extensive `newrelic:` plugin block. `FFAILogger`'s `setContextData()` attaches `user_id`, `tenant_id`, `client_id`, `is_machine` to every log line via `AuthGuard`. Heap analytics for Python services via `ffai-heap-logging`.
- **Error handling.** NestJS-style exception throwing (`HttpException`, `BadRequestException`, `UnauthorizedException`, `UnprocessableEntityException`, `NotFoundException`), handled by NestJS's built-in exception filter. `employment-services-connector` defines additional custom exception handlers. The gateway defines `ERROR_CODE` constants (`FORBIDDEN`, `UNAUTHORIZED`, `INTERNAL_SERVER_ERROR`) exposed via `additionalTypeDefs`.
- **Caching.** Redis-backed `PermissionCacheService` in `nest-auth-utils` for permission lookups. `@nestjs/cache-manager` used at the resolver level for hot in-process lookups (e.g. in `user-profile-service`).
- **Configuration and secrets.** Per-service `.env` files generated by `scripts/local_services_cli` from deployed dev configs. Deploy-time secrets via 1Password (`OP_SERVICE_ACCOUNT_TOKEN` passed through Turbo) and SSM / Secrets Manager in CDK stacks (pattern: `lookupSystemParameterStrings`). `deploy_config.json` is the manifest of all deployable workloads, schema-validated by `deploy_config_schema.json` via `ajv-cli`. Each entry specifies workspace name, parent directory, artifact name, and runtime versions; some specify `uses_dvc: true`. Root `Makefile` builds `.mcp.json` from 1Password for read-only MCP DB access.
- **Scheduled jobs.** In-service crons via NestJS `@Cron`. Standalone scheduled Lambdas (`*-poll-lambda`) wired via CDK EventBridge schedules.

### Notable ownership facts

Concentrations of code/logic to be aware of when scoping work:

- `user-profile-service` owns user profile, preferences, settings, consent, Cognito integration, Intercom, geocoding, export-report, work experience, ratings, account preferences, skills, onboarding config, seeders, CLI, and cron. Anything user-related typically routes through this service.
- `employment-services-connector` plus the `eo-*` lambdas plus `empyra-client` / `empyra_api_types` / `eo-client` / `eo_api_types` packages collectively form the EAP state-machine domain. A field change can ripple across multiple lambdas and the connector.
- `access-control-service` and the `permissions` package are tightly coupled. The startup sync makes any slug rename or addition a coordinated deploy.
- `mesh-gateway` funnels all public traffic. Every subgraph schema change requires a gateway rebuild; transformations live in `.meshrc.yml`.
- Workspace dependencies cross apps: `access-control-service` depends on `user-profile-service` (`workspace:*`), and `tenants-service` (Go) does the same. Shared-type changes force coordinated redeploys.
- The Job entity exists in two stores (Postgres + Mongo) inside `job-service` with no single source of truth.

### Pending upgrades and tracked tech debt

These tracker docs exist at the repo root and represent live, partially executed migrations:

- `upgrade-apollo-server-4-to-5.md` — Apollo Server 4 → 5; ~19 package.json files; partially migrated across services.
- `upgrade-aws-sdk-v2-to-v3.md` — AWS SDK v2 → v3; 4 services still on v2 (`file-management-service` is the highest-complexity remaining).
- `upgrade-eslint-8-to-9.md` — ESLint 8 → 9 with flat-config migration; ~24 `.eslintrc.js` files.
- `upgrade-graphql-request-to-v6.md` — `graphql-request` v3/v4 → v6; mixed across 4 lambdas and 4 services.
- `upgrade-nestjs-ecosystem.md` — NestJS ecosystem version bumps; requires coordination across all services (a partial bump previously caused a `Reflector` DI failure).
- `upgrade-nestjs-platform-multer.md` — Multer security upgrade across ~20 services.
- `upgrade-elliptic-removal.md` — Single dev-only fix in `e2e_testing/perf`.
- `upgrade-xlsx-replacement.md` — Replace SheetJS in an EO connector utility.
- `pathways-dep-fixups.md` plus `pathways-dep-fixups-outstanding.md` — Master Dependabot remediation backlog (~141 alerts at last count). Includes pnpm overrides for `tar-fs`, `pbkdf2`, `fast-json-patch`, `uWebSockets.js` (`OVERRIDES.MD`).
- `back-fill-sum.txt`, `bruce-county-prod-1password-requirements.md`, `eo-eap-user-creation-investigation.md`, `testing-plan.md` — Operational notes.

#### Known drift

- **Node version:** `.node-version` is 20 and root `engines` is `>=20`, but CLAUDE.md states Node 24+ and several lambda `package.json` files target `@types/node: ^24`.
- **Apollo Server:** Some services already on v5, others still on v4.
- **pnpm:** Pinned to 8.15.9; renovate keeps it fixed.

### Conventions

- NestJS modules are foldered: `feature/feature.module.ts`, `feature.service.ts`, `feature.resolver.ts` (or `feature.controller.ts`), `dto/`, `entities/`, `schemas/`, with sibling `*.spec.ts` per file.
- Source files: `.ts`; unit tests: `*.spec.ts`; e2e: `*.e2e-spec.ts` under `test/`.
- Snake_case for migration timestamps; kebab-case for service / lambda / package names; camelCase for TS identifiers.
- DTOs use `class-validator` / `class-transformer`.
- Per-service `schema.graphql` is the public contract (autogenerated for code-first services).
- Permissions are slugged `resource:action:scope`.

#### Branch and release flow

CI workflows imply: PR → premerge tests → merge to main → `deploy.yml` triggers per-service CDK deployments. `post-deploy-tests-*.yml` runs in dev / prod-us / prod-eu.

#### Turborepo task pipeline

- `build` depends on upstream `^build` and upstream `^dvc-pull` (so any data-service consumer transitively triggers DVC pulls).
- `test` depends on `build`.
- `e2e` depends on `^e2e` and `build`. A per-app `turbo.json` can extend the root to declare cross-service e2e ordering.
- `cdk:diff` and `cdk:deploy` depend on `package` (lambda artifact build) and pass through `APP_ENV`, `SERVICE_INITIAL_DEPLOYMENT`, and `OP_SERVICE_ACCOUNT_TOKEN`.
- `.deploy-cache-bust` is a globalDependency knob to bust caches.

#### Testing layout

- **Unit:** Jest 29; co-located `*.spec.ts`. Each TS service maintains its own jest config in `package.json`.
- **Integration:** opt-in per service via `test:int` script backed by `test/jest-int.json`.
- **E2E:** per-service `jest-e2e.json` plus the cross-service suite in `e2e_testing/api_tests/`. The e2e Turbo task `dependsOn` list is hand-maintained and lint-enforced.
- **Python:** pytest under each data service's `tests/`.
- **Perf:** `e2e_testing/perf/`.
- **UI:** `e2e_testing/ui_tests/` (Cypress family).

#### Pre-commit and worktrees

- `.husky/pre-commit` runs `lint-staged` (eslint + prettier).
- Worktrees under `.claude/worktrees/` rely on the root `.eslintrc.js` having `root: true` so ESLint stops config traversal and avoids loading `@typescript-eslint` twice.
