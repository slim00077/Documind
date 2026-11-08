# DocuMind — DevOps, CI/CD & Production Deployment

Status date: 2026-11-08. Every status below is one of:

| Label | Meaning |
|---|---|
| **VERIFIED** | Executed on the development machine, real result recorded below |
| **VALIDATED (static)** | File checked by a linter / official schema; it has not run on its target platform yet |
| **NOT RUN** | Configured, needs a push to GitHub and/or platform credentials before it can run |
| **MISSING** | Not implemented |

> Starting point (audit): the repository contained **no** CI/CD workflow, Dockerfile, compose file,
> Kubernetes manifest, SonarQube, Vercel or Render configuration, and no health endpoint. Everything
> below was added in this delivery. No pipeline has run on GitHub yet and nothing has been deployed.

---

## A. DevOps architecture

```
 developer ──push──▶ GitHub (private repo slim00077/DocuMind)
                         │
        ┌────────────────┴──────────────────┐
        ▼                                   ▼
 CI - Backend (backend/**)           CI - Frontend (frontend/**)
  build · audit · 47 tests+coverage   ESLint gate · audit · tsc+vite build · localhost guard
  SonarQube gate · Docker smoke test  SonarQube gate · Docker smoke test
  push image → GHCR (main)            push image → GHCR (main)
        │ success on main                   │ success on main
        ▼                                   ▼
 CD - Backend (Render)               CD - Frontend (Vercel)
  deploy hook (tested commit)         vercel pull/build/deploy --prebuilt --prod
  wait "live" → /api/health → smoke   bundle guard → SPA + CORS smoke tests
        │                                   │
        ▼                                   ▼
 Render web service (Docker)  ◀──HTTPS── Vercel (static SPA, HTTPS, SPA rewrites)
  NestJS API · disk /app/uploads           browser calls VITE_API_URL
  pre-deploy: pgvector + migrate deploy
        │
        ▼
 PostgreSQL + pgvector (DATABASE_URL)      AI providers over HTTPS: Gemini → OpenRouter → Groq → OpenAI
                                           (Ollama only if a reachable remote OLLAMA_BASE_URL exists)

 Same images also run with docker compose (local full stack) and on Kubernetes/kubeadm (k8s/).
```

## Tools — what, why, where, how

| Tool | What it does | Why DocuMind uses it | Configured in | Role in the pipeline |
|---|---|---|---|---|
| GitHub Actions | Runs workflows on GitHub-hosted Ubuntu runners | Repo already on GitHub; free CI minutes | `.github/workflows/*.yml` | Executes the 2 CI + 2 CD pipelines |
| npm ci / npm audit | Reproducible install from lockfile / known-CVE scan | Same dependency tree everywhere; supply-chain check | `package-lock.json`, workflow steps | Install step; audit fails CI on high/critical prod vulnerabilities |
| TypeScript (tsc) | Type-checks and compiles | Catches type errors before deploy | `backend/tsconfig.json`, `frontend/tsconfig*.json` | `npm run build` gate |
| Prisma 7 | ORM, client generation, migrations | Schema-driven DB access; `migrate deploy` is non-destructive | `backend/prisma/`, `backend/prisma.config.ts` | `prisma generate` in build; `migrate deploy` at release |
| node:test + V8 coverage | Test runner + LCOV coverage | Already used by the 47 integration tests | `backend/scripts/run-tests.js`, `backend/test/` | `npm run test:coverage` → `coverage/lcov.info` |
| PostgreSQL 18 + pgvector | Relational DB + vector similarity search | Semantic search on `vector(384)` embeddings | service containers, `docker-compose.yml`, `k8s/postgres.yaml` | Real DB for CI tests and smoke tests |
| ESLint (budget gate) | Static analysis of the React code | Prevents new lint errors while 33 old ones are fixed | `frontend/eslint.config.js`, `frontend/scripts/lint-budget.mjs` | Fails CI if errors > 33; report exported to Sonar |
| SonarQube | Code quality/security analysis with a quality gate | Required quality gate; tracks bugs, smells, hotspots, coverage | `backend/` and `frontend/sonar-project.properties` | `sonarqube` job; `sonar.qualitygate.wait=true` fails the job when the gate is red |
| Docker | Builds immutable runtime images | Same artifact for compose, Kubernetes and Render | `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore` | CI builds, runs and smoke-tests images, pushes to GHCR |
| GHCR | Container registry of GitHub | No extra account; uses the built-in `GITHUB_TOKEN` | CI `docker` jobs | Stores `documind-backend` / `documind-frontend` images (`:sha`, `:latest`) |
| nginx (unprivileged) | Static server + reverse proxy | Serves the SPA, routes `/api` to the API in compose/K8s | `frontend/nginx.conf.template` | Frontend runtime image |
| Render | Managed container hosting | Backend target chosen in the internship report | `render.yaml` | CD 1 deploys the CI-tested commit via deploy hook |
| Vercel | Static hosting + CDN with HTTPS | Frontend target chosen in the internship report | `frontend/vercel.json` | CD 2 builds and deploys with the Vercel CLI |
| Kubernetes (kubeadm) | Container orchestration | Self-hosted deployment option with probes, PVCs, replicas | `k8s/` (kustomize) | `kubectl apply -k k8s/` with GHCR images |
| actionlint / kubeconform | Workflow linter / K8s schema validator | Validate configs without a live platform | (dev tools, not in repo) | Used for the static validation below |

---

## B. CI pipeline 1 — `CI - Backend`

File `.github/workflows/ci-backend.yml`. Trigger: push to `main` or pull request touching `backend/**` (or the workflow), plus manual run.

| Job | Steps | Fails when |
|---|---|---|
| `build-test` | checkout → Node 24 (npm cache) → `npm ci` → `npm audit --omit=dev --audit-level=high` → `npm run build` (prisma generate + tsc) → cache embedding model → `npm run test:coverage` against a `pgvector/pgvector:pg18` service → upload `lcov.info` | vulnerable prod dependency, type error, any failing test |
| `sonarqube` | checkout (full history) → download coverage → `SonarSource/sonarqube-scan-action@v8` with `projectBaseDir: backend` | quality gate red (scanner waits for it) |
| `docker` | buildx → build image → run `npm run migrate:deploy` **inside the image** on an empty pgvector DB → start container → `/api/health` must be green → `/api/documents` must return 401 → on `main`: push to GHCR | image doesn't build, migrations fail, container unhealthy, auth not enforced |

- **No AI quota in CI**: `LLM_PROVIDER_ORDER=none` selects the existing `NullLlmProvider`. No provider key exists in CI.
- The test runner creates an isolated `<db>_test` database, installs pgvector and replays **all 17 migrations from scratch**, which proves the migration chain on every run.
- **Local result (VERIFIED)**: build OK, `npm audit` 0 production vulnerabilities, **47/47 tests pass**, coverage **56.6 % lines / 62.6 % branches / 57.8 % functions** (110 files).
- **On GitHub: NOT RUN** (workflow VALIDATED by actionlint, 0 findings).

## C. CI pipeline 2 — `CI - Frontend`

File `.github/workflows/ci-frontend.yml`. Trigger: push to `main` or pull request touching `frontend/**`, plus manual run.

| Job | Steps | Fails when |
|---|---|---|
| `lint` | `npm ci` → `npm run lint:ci` (ESLint + error budget) → upload `eslint-report.json` | ESLint errors > budget (33) |
| `build` | `npm ci` → `npm audit --omit=dev --audit-level=high` → `npm run build` (`tsc -b && vite build`) with a placeholder `VITE_API_URL` → guard: bundle must not contain `localhost:3000` and must contain `VITE_API_URL` | vulnerability, type error, build error, bundle targeting localhost |
| `sonarqube` | scan `frontend/` with the ESLint report imported | quality gate red |
| `docker` | build same-origin image → run → `/healthz` 200, `/` and `/documents` return the SPA (React Router fallback) → on `main`: push to GHCR | image or nginx config broken |

- **Lint debt is visible, not hidden**: 33 errors exist today (19 `react-hooks/set-state-in-effect`, 11 `react-refresh/only-export-components`, 3 others in 23 files). Fixing them touches UI components, which was out of scope. The gate blocks any *new* error, and every run prints a warning with the current count.
- **Local result (VERIFIED)**: build OK, 0 production vulnerabilities, lint gate passes at 33/33, bundle contains the configured API URL and no `localhost`. Vite warns that the main JS chunk is 528 kB (warning only).
- **On GitHub: NOT RUN** (VALIDATED by actionlint).

## D. CD pipeline 1 — `CD - Backend (Render)`

File `.github/workflows/cd-backend.yml`. Trigger: `workflow_run` when `CI - Backend` **completes successfully for a push on `main`**, or manual run. Deployments never run in parallel.

1. Check `RENDER_DEPLOY_HOOK_URL` (secret) and `BACKEND_URL` (variable). Fail with an explicit message if they're missing.
2. `POST <deploy hook>&ref=<CI-tested commit SHA>`, so Render deploys exactly what CI tested.
3. If `RENDER_API_KEY` and `RENDER_SERVICE_ID` exist: poll the Render API until the deploy is `live`. Fail on `build_failed`, `pre_deploy_failed`, `update_failed` or `canceled`.
4. Poll `BACKEND_URL/api/health` until `status=ok` **and** `version` equals the commit's short SHA (`RENDER_GIT_COMMIT`), which proves the new release is the one serving traffic.
5. Smoke tests with **no AI call and no DB write**:
   - `GET /api/documents` → 401
   - `POST /api/auth/login` for a non-existent user → 401. Failed logins are not audit-logged.
   - CORS preflight from `FRONTEND_URL` → allowed
6. Write a step summary.

On the Render side (`render.yaml`): Docker runtime, `autoDeploy: false` (only CD deploys), `preDeployCommand: npm run migrate:deploy`, `healthCheckPath: /api/health`. Render only switches traffic when the health check is green, so a failing migration or a broken release never replaces the running one.

**Status: NOT RUN / NOT DEPLOYED** — needs the Render service and secrets (section N).

## E. CD pipeline 2 — `CD - Frontend (Vercel)`

File `.github/workflows/cd-frontend.yml`. Trigger: `workflow_run` when `CI - Frontend` succeeds for a push on `main`, or manual run.

1. Check configuration: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VITE_API_URL` (must be `https://`, never localhost) and `FRONTEND_URL`.
2. Check out the CI-tested commit and install `vercel@65`.
3. Build: `vercel pull --environment=production` → `vercel build --prod`, which uses `vercel.json` (`npm ci`, `npm run build`, output `dist`, framework `vite`).
4. **Guard**: the output must contain `VITE_API_URL` and must not contain `localhost:3000`.
5. Deploy: `vercel deploy --prebuilt --prod`, which uploads exactly the artifact that was checked.
6. Smoke tests on the production domain:
   - `/`, `/login` and `/documents` must return 200 with the SPA root. This proves the rewrite to `index.html` for React Router.
   - The API must accept CORS from this origin, which proves frontend ↔ backend connectivity.

`vercel.json` sets `git.deploymentEnabled: false`, so Vercel never deploys code that hasn't passed CI. **Status: NOT RUN / NOT DEPLOYED.**

---

## F. Docker architecture

| Image | Build | Runtime | Port / health | Notes |
|---|---|---|---|---|
| `backend/Dockerfile` | `node:24-bookworm-slim`: `npm ci` → `prisma generate` + `tsc` → `npm prune --omit=dev` → embedding model baked in | `node:24-bookworm-slim`, user `node` (non-root), `NODE_ENV=production`, only `dist/`, prod `node_modules`, `prisma/`, migration helper | 3000, `HEALTHCHECK /api/health` | Debian not Alpine (onnxruntime/sharp need glibc). Migrations are a separate release step, not in `CMD` |
| `frontend/Dockerfile` | `node:24-bookworm-slim`: `npm ci` → `vite build` with `ARG VITE_API_URL` | `nginxinc/nginx-unprivileged:1.28-alpine` (non-root) | 8080, `/healthz` | nginx proxies `/api` to `API_UPSTREAM`; SPA fallback; immutable cache on `/assets` |

- **No secrets in images**: both `.dockerignore` files exclude `.env*`, `uploads/`, `backups/`, `node_modules`, `dist`. Secrets are injected at runtime only.
- **Uploads**: written to `/app/uploads` and declared as the mount point for a docker volume, Render disk or PVC.
- `docker-compose.yml` (local full stack): `db` (pgvector pg18) → `migrate` (one-shot) → `backend` → `frontend` at http://localhost:8080. Named volumes `pgdata` and `uploads`.
- **Status**: Docker is not installed on the dev machine, so images were **not built locally**. The CI `docker` jobs build and smoke-test both images on every run. Dockerfiles and compose: compose VALIDATED against the Compose JSON schema.

## G. Kubernetes architecture and actual status

`k8s/` (apply with `kubectl apply -k k8s/`):

| Resource | Details |
|---|---|
| `Namespace` documind | — |
| `ConfigMap` documind-config | NODE_ENV, PORT, LLM order without Ollama, CORS, embedding provider |
| `Secret` documind-secrets | **template only** (`secret.example.yaml`, excluded from kustomize); created with `kubectl create secret` |
| `StatefulSet` postgres + headless `Service` | pgvector pg18, 10 Gi PVC on `/var/lib/postgresql`, `pg_isready` probes, requests 250m/256Mi, limits 1 CPU/1Gi |
| `Deployment` backend + `Service` (ClusterIP) + `PVC` uploads 5 Gi | **1 replica, `Recreate`** (RWO upload volume and in-process AI counters). Init container runs `npm run migrate:deploy`. Startup/liveness on `/api/health/live`, readiness on `/api/health` (DB). Requests 250m/512Mi, limits 1 CPU/1.5Gi. Non-root, `fsGroup` 1000 |
| `Deployment` frontend + `Service` NodePort 30080 | **2 replicas**, rolling update with `maxUnavailable: 0`, `/healthz` probes, limits 250m/128Mi, non-root |
| `Ingress` (optional, `ingress.example.yaml`) | For clusters with an ingress controller. Not needed: the NodePort and nginx's `/api` proxy expose the whole app |

**Actual status: NOT DEPLOYED.** No `kubectl` or kubeconfig on this machine, and no kubeadm cluster was reachable, so nothing was applied. The manifests are VALIDATED with `kubeconform -strict` (11/11 resources valid against Kubernetes schemas). Remaining work on the cluster: install a StorageClass (kubeadm has none by default, e.g. local-path-provisioner), create the two secrets, `kubectl apply -k k8s/`, then open `http://<node-ip>:30080`. Prometheus, Grafana and metrics-server are **not** part of this delivery.

## H. SonarQube configuration and results

- Two projects: `slim00077_documind-backend` (sources `src`, tests `test`, LCOV coverage) and `slim00077_documind-frontend` (sources `src`, ESLint report imported as external issues).
- `sonar.qualitygate.wait=true`: the CI job **fails when the quality gate is red**.
- Server selection: `SONAR_HOST_URL` variable (defaults to SonarQube Cloud `https://sonarcloud.io`) + `SONAR_ORGANIZATION` (Cloud only) + `SONAR_TOKEN` secret.
- Until `SONAR_TOKEN` exists, the job **skips with a visible warning**. It never reports a fake pass.
- **Results: none yet.** No analysis has run, so there's no quality gate result, issue count or rating to report. The coverage that will be sent is the measured 56.6 % (backend). The frontend has no unit tests, so the default "Sonar way" condition (≥ 80 % coverage on new code) may fail the frontend gate. Check the first analysis and adjust the gate or add tests consciously.

## I. Production deployment architecture

| Layer | Configuration | Status |
|---|---|---|
| **Frontend (Vercel)** | build `npm run build`, output `dist`, framework `vite`, SPA rewrite `/(.*) → /index.html`, HTTPS by Vercel, `VITE_API_URL` = Render URL (build time) | Configured, VALIDATED (Vercel schema), NOT DEPLOYED |
| **Backend (Render)** | Docker runtime, plan `standard` (2 GB), `PORT` injected by Render, `healthCheckPath /api/health`, pre-deploy migrations, `CORS_ORIGIN` = Vercel URL, `JWT_SECRET` generated by Render, AI keys `sync: false` | Configured, VALIDATED (Render Blueprint schema), NOT DEPLOYED |
| **Uploads** | Render persistent disk `/app/uploads` (5 GB) | Configured. Without it, files are **lost on every deploy/restart** |
| **PostgreSQL** | `DATABASE_URL` provided in Render (Render Postgres or any provider allowing `CREATE EXTENSION vector`; add `?sslmode=require` for external providers) | NOT PROVISIONED |
| **Ollama** | Kept in code as the last fallback. Removed from the production `LLM_PROVIDER_ORDER`. Code guard: in `NODE_ENV=production`, `local` is skipped unless `OLLAMA_BASE_URL` is a non-localhost URL | VERIFIED locally |

Production-readiness fixes made in this delivery (each one verified):

| Problem found | Impact | Fix |
|---|---|---|
| `npm start` ran `dist/main.js`, but tsc emits `dist/src/main.js` | Backend could not start in production | `start: node dist/src/main.js` |
| `build` was only `tsc`, and the Prisma client is gitignored | Build fails on any fresh checkout (CI/Render) | `build: prisma generate && tsc` |
| No migration creates the `vector` extension | `migrate deploy` fails on a fresh production DB | `scripts/ensure-pgvector.js` + `npm run migrate:deploy` |
| No health endpoint | No probe for Render, Docker, K8s or CD | `GET /api/health` (DB + pgvector) and `/api/health/live` |
| Tracked `frontend/.env` = `http://localhost:3000` is loaded by production builds | Deployed frontend would call localhost | CI/CD guards + explicit `VITE_API_URL`; `.dockerignore` excludes `.env` |
| Local embedding of a whole document in one ONNX call | **2.06 GB RSS for 128 chunks**: OOM on Render/K8s | Batches of 16 → **0.69 GB** peak, faster, vectors bit-identical |
| Ollama defaults to `localhost:11434` | On a cloud host that is the server itself | Production guard + config without `local` |
| Real `JWT_SECRET` and DB password copied into tracked `backend/.env.example` (not pushed) | Secret leak on next commit | Replaced with placeholders (`.env` untouched) |
| 16 known vulnerabilities in prod deps (1 critical) | Audit gate would fail | `npm audit fix` (no `--force`, lockfile only) → 0; tests re-run green |
| npm 11 blocks dependency install scripts by default | Prisma's Linux engines missing on fresh installs | `allowScripts` for `prisma` and `@prisma/engines` only |
| No graceful shutdown | Dropped DB pool on SIGTERM | `app.enableShutdownHooks()` |

## J. Monitoring

What really exists (nothing invented):

| Signal | Where |
|---|---|
| Health/readiness: DB status, pgvector version, uptime, RSS memory, environment, running commit | `GET /api/health`, `GET /api/health/live` (new) |
| AI provider usage: per-provider counters, WARN/HIGH/CRITICAL thresholds, quota cooldown, fallback chain | `UsageMonitorService` logs + admin page (`/api/admin/ai-monitoring`) |
| Security/audit trail: actor, action, target, organization | `AuditLog` table + admin page (`/api/admin/audit-logs`) |
| Application logs | Nest logger on stdout → Render Logs / `docker logs` / `kubectl logs` |
| CPU, memory, HTTP metrics | Render dashboard (built-in). Vercel deployment logs |
| Deployment status | GitHub Actions run history, step summaries and environments (`production-backend`, `production-frontend`) |
| Kubernetes | Liveness, readiness and startup probes only. **No** Prometheus, Grafana or metrics-server |

Missing: alerting, error tracking (e.g. Sentry), metrics dashboards.

---

## K. Commands

Validation commands executed for this report (results above):

```bash
# backend (AI keys blanked so no provider quota is used)
npx tsc --noEmit -p .
LLM_PROVIDER_ORDER=none GEMINI_API_KEY= OPENROUTER_API_KEY= GROQ_API_KEY= OPENAI_API_KEY= npm run test:coverage
npx prisma migrate status          # read-only: 17 migrations, "Database schema is up to date"
npm audit --omit=dev               # 0 vulnerabilities after `npm audit fix`
npx prisma generate && npx tsc --outDir <tmp>   # production build, then compiled server started with
                                                # NODE_ENV=production for 9 smoke checks (all PASS)
# frontend
VITE_API_URL=https://api.ci-check.invalid npm run build && grep -r localhost:3000 dist/assets   # none
npm run lint:ci                    # 33 errors = budget -> pass
npm audit --omit=dev               # 0 vulnerabilities
# configuration
actionlint .github/workflows/*.yml                 # 0 findings
kubeconform -strict -summary k8s/*.yaml            # 11/11 valid
# render.yaml, docker-compose.yml, vercel.json validated against their official JSON schemas
```

Operational commands:

```bash
npm run build | npm start | npm run migrate:deploy | npm test | npm run test:coverage   # backend
npm run build | npm run lint:ci                                                        # frontend
docker compose up --build                       # full stack on http://localhost:8080
kubectl apply -k k8s/                           # Kubernetes (after creating secrets)
kubectl -n documind get pods,svc,pvc ; kubectl -n documind logs deploy/backend
```

## L. Configuration files

New: `.github/workflows/ci-backend.yml`, `ci-frontend.yml`, `cd-backend.yml`, `cd-frontend.yml` · `backend/Dockerfile`, `backend/.dockerignore`, `backend/sonar-project.properties`, `backend/scripts/ensure-pgvector.js`, `backend/src/modules/health/*` · `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf.template`, `frontend/vercel.json`, `frontend/sonar-project.properties`, `frontend/scripts/lint-budget.mjs` · `docker-compose.yml` · `render.yaml` · `k8s/` (8 files) · `DEVOPS.md`.

Modified: `backend/package.json` (scripts, `allowScripts`), `backend/package-lock.json` + `frontend/package-lock.json` (audit fix), `backend/scripts/run-tests.js` (`--coverage`), `backend/src/main.ts` (shutdown hooks), `backend/src/app.module.ts` (HealthModule), `backend/src/modules/llm/multi-provider-llm.service.ts` (Ollama production guard), `backend/src/modules/documents/embeddings/local-embedding.provider.ts` (batching), `backend/.env.example` (placeholders + production notes), `backend/.gitignore`, `frontend/package.json` (`lint:ci`, `typecheck`), `frontend/.gitignore`.

## M. Operational status summary

| Fully operational (verified) | Implemented, not yet run on the platform | Missing / to do |
|---|---|---|
| Backend production build + start, health endpoint, auth, CORS, Ollama guard (9/9 smoke checks) | 4 GitHub Actions pipelines (lint-clean) | Platform accounts, secrets, first pipeline run |
| 47/47 integration tests, 56.6 % coverage, migration chain from scratch | SonarQube analysis + gate | SonarQube results |
| Frontend build with production API URL, lint gate | Docker images (built in CI only) | Vercel and Render deployments |
| 0 production vulnerabilities (both apps) | Render Blueprint, Vercel config (schema-valid) | Production PostgreSQL + backup |
| Local DB migrations up to date (17/17) | Kubernetes manifests (schema-valid) | kubeadm cluster access, StorageClass, monitoring stack |
| | docker compose stack (schema-valid) | Fix of 33 ESLint errors; frontend tests |

## N. Manual actions and credentials required

1. **Commit and push** the files above to `main`, which triggers both CI pipelines.
2. **GitHub → Settings → Secrets and variables → Actions**:

   | Secrets | Variables |
   |---|---|
   | `SONAR_TOKEN` | `SONAR_ORGANIZATION` (Cloud), `SONAR_HOST_URL` (only for a self-hosted server) |
   | `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY` (optional, enables deploy-status polling) | `RENDER_SERVICE_ID` (`srv-…`), `BACKEND_URL` (`https://documind-api.onrender.com`) |
   | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `FRONTEND_URL` (`https://<project>.vercel.app`), `VITE_API_URL` (= `BACKEND_URL`) |

3. **SonarQube Cloud**: create an organization from GitHub and create two projects manually with the keys above. **Disable Automatic Analysis** (CI-based analysis is refused while it's on), then generate a token. A self-hosted SonarQube must be reachable from the internet: GitHub runners can't reach `localhost:9000`.
4. **Render**:
   - New → Blueprint → this repo.
   - Fill in `DATABASE_URL`, `CORS_ORIGIN`/`FRONTEND_URL` (Vercel URL) and the AI keys.
   - **Cost decision**: the `standard` plan plus a persistent disk is paid. Free instances have no disk (uploads would be lost) and only 512 MB RAM (OOM while indexing).
   - Copy the Deploy Hook URL and the service ID.
5. **Database**: provision PostgreSQL with pgvector and **take a backup before the first deploy**. The pre-deploy step runs `prisma migrate deploy` (applies pending migrations only, never resets). Moving the restored local data to production is a separate decision: `pg_dump`/`pg_restore` **plus** copying `backend/uploads/` onto the Render disk, because DB rows reference those files.
6. **Vercel**:
   - In `frontend/`, run `npx vercel link` to get the org and project IDs from `.vercel/project.json`.
   - Leave "Root Directory" empty, since the CLI deploys from `frontend/`.
   - Add `VITE_API_URL` as a Production env var and create a token.
7. **Kubernetes**: on the kubeadm control plane:
   - Install a StorageClass.
   - Create `documind-secrets` and `ghcr-pull`, or make the GHCR packages public.
   - `kubectl apply -k k8s/`
8. **Repository hygiene (security, recommended)**: these are tracked in Git:
   - the database dump `backend/backups/*.sql` (accounts and password hashes)
   - 14 user files in `backend/uploads/`
   - `backend/dist/`, `frontend/.env` and `.claude/settings.local.json`

   Untrack them with `git rm -r --cached backend/backups backend/uploads backend/dist frontend/.env` (local files are kept). They remain in history, and the repo is private.
