# Companion Incus Fork — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork The Companion as `companion-incus`, replacing Docker with Incus as the sole container runtime.

**Architecture:** Delete `container-manager.ts` and write `incus-manager.ts` from scratch using Incus-native concepts (names not hex IDs, system containers with systemd, disk/proxy devices, UID 1000 `code` user). Replace `image-pull-manager.ts` with `image-provision-manager.ts` that builds images locally via a user-editable provision script. Update all consumers and frontend strings.

**Tech Stack:** TypeScript, Bun, Hono, React 19, Zustand, Vitest, Incus CLI

**Spec:** `docs/superpowers/specs/2026-03-18-companion-incus-fork-design.md`

---

## Phase 0: Fork, Rebrand & Attribution

### Task 0.1: Create GitHub repo and set up remotes

**Files:** n/a (git operations only)

- [ ] **Step 1: Create the new GitHub repo**

```bash
gh repo create bketelsen/companion-incus --public --description "Incus-powered fork of The Companion — web UI for Claude Code & Codex"
```

- [ ] **Step 2: Replace origin remote, add upstream**

```bash
git remote set-url origin https://github.com/bketelsen/companion-incus.git
git remote add upstream https://github.com/The-Vibe-Company/companion.git
```

- [ ] **Step 3: Push to new repo**

```bash
git push -u origin main
```

---

### Task 0.2: Attribution — LICENSE and README

**Files:**

- Modify: `LICENSE`
- Modify: `README.md`

- [ ] **Step 1: Update LICENSE with dual copyright**

Replace the copyright line with:

```text
Copyright (c) 2025 The Vibe Company
Copyright (c) 2026 Brian Ketelsen
```

- [ ] **Step 2: Add attribution section to README.md**

Add near the top, after the project title/description:

```markdown
## Attribution

Companion Incus is a fork of [The Companion](https://github.com/The-Vibe-Company/companion) by [The Vibe Company](https://github.com/The-Vibe-Company), originally created by Stan Girard. This fork replaces Docker with [Incus](https://linuxcontainers.org/incus/) as the container runtime for improved isolation and security.

We're grateful to the original authors for building and open-sourcing The Companion under the MIT license. If you don't need Incus-specific features, we recommend using the upstream project.
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE README.md
git commit -m "docs: add fork attribution to LICENSE and README"
```

---

### Task 0.3: Package rename — root and web package.json

**Files:**

- Modify: `package.json`
- Modify: `web/package.json`
- Modify: `release-please-config.json`

- [ ] **Step 1: Update root package.json**

Change `name` to `"companion-incus"`, `description` to `"Incus-powered web UI for Claude Code & Codex agents"`, `author` to `"Brian Ketelsen"`, add `"contributors": ["Stan Girard (The Vibe Company) — original The Companion project"]`. Remove the `"the-companion": "^0.2.2"` dependency.

- [ ] **Step 2: Update web/package.json**

Change `name` to `"companion-incus"`. Update `bin` to `{"companion-incus": "./bin/cli.ts", "companion": "./bin/cli.ts"}`. Update `author`, add `contributors`. Add `"incus"` to keywords. Update `description`.

- [ ] **Step 3: Update release-please-config.json**

Change `"package-name": "the-companion"` to `"package-name": "companion-incus"`.

- [ ] **Step 4: Commit**

```bash
git add package.json web/package.json release-please-config.json
git commit -m "chore: rename package to companion-incus"
```

---

### Task 0.4: CLI and service rename

**Files:**

- Modify: `web/bin/cli.ts`
- Modify: `web/server/service.ts`

- [ ] **Step 1: Update cli.ts usage text and status messages**

Replace `"The Companion"` with `"Companion Incus"` in printUsage() and status output strings. Replace `"companion"` binary references with `"companion-incus"` in usage text.

- [ ] **Step 2: Update service.ts unit names**

Replace systemd unit name `"the-companion"` with `"companion-incus"`. Replace launchd plist identifier with `"com.companion-incus"`.

- [ ] **Step 3: Run typecheck and tests**

```bash
cd web && bun run typecheck && bun run test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/bin/cli.ts web/server/service.ts
git commit -m "chore: rename CLI and service identifiers to companion-incus"
```

---

### Task 0.5: Delete Docker artifacts and CI workflows

**Files:**

- Delete: `web/docker/Dockerfile.the-companion`
- Delete: `platform/Dockerfile`
- Delete: `scripts/build-push-companion-server.sh`
- Delete: `.github/workflows/docker.yml`
- Delete: `.github/workflows/docker-server.yml`
- Modify: `.github/workflows/publish.yml`

- [ ] **Step 1: Delete Docker files**

```bash
rm -f web/docker/Dockerfile.the-companion platform/Dockerfile scripts/build-push-companion-server.sh
rm -f .github/workflows/docker.yml .github/workflows/docker-server.yml
```

- [ ] **Step 2: Update publish.yml**

Remove the entire `docker:` job (lines 66-97). Update the npm publish step to use `companion-incus` package name.

- [ ] **Step 3: Commit**

```bash
git add web/docker/Dockerfile.the-companion platform/Dockerfile scripts/build-push-companion-server.sh .github/workflows/docker.yml .github/workflows/docker-server.yml .github/workflows/publish.yml
git commit -m "chore: remove Docker artifacts and CI workflows"
```

---

## Phase 1: IncusManager — Core Container Operations

### Task 1.1: Types and helpers — `incus-manager.ts` scaffold

**Files:**

- Create: `web/server/incus-manager.ts`
- Create: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Create incus-manager.ts with types, helpers, and empty class**

Create `web/server/incus-manager.ts` with:

- All type exports: `IncusContainerConfig`, `PortMapping`, `IncusContainerInfo`
- `shellEscape()` helper (same logic as container-manager.ts)
- `validateContainerName()` — accepts `^[a-zA-Z][a-zA-Z0-9-]*$` (Incus naming rules)
- Empty `IncusManager` class with the full API surface as stubs throwing `"not implemented"`
- `export const incusManager = new IncusManager()`

- [ ] **Step 2: Write tests for shell escape and name validation**

Create `web/server/incus-manager.test.ts` with tests that import `shellEscape` and `validateContainerName` from `./incus-manager.js`:

- `shellEscape` passes through safe strings unchanged, wraps strings with special chars
- `validateContainerName` accepts `"companion-abc12345"`, rejects `"../bad"`, `""`, strings starting with `-`

- [ ] **Step 3: Run tests**

```bash
cd web && bun run test -- incus-manager.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): scaffold IncusManager with types and helpers"
```

---

### Task 1.2: Availability checks — `checkIncus()` and `getIncusVersion()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Mock `execSync` and verify: `checkIncus()` returns `true`/`false` based on `incus version` success. `getIncusVersion()` parses version string or returns `null`.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement both methods**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement availability checks"
```

---

### Task 1.3: Image management — `imageExists()` and `listImages()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test `imageExists()` with mock `incus image info <alias>` success/failure. Test `listImages()` parsing JSON output from `incus image list --format json`.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement both methods**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement image existence and listing"
```

---

### Task 1.4: Exec methods — `execInContainer()`, `execInContainerAsync()`, `buildExecCommand()`, `hasBinaryInContainer()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test that `execInContainer()` builds correct `incus exec --user <uid> --group <gid> --env HOME=<homeDir> <name> -- <cmd>` command. Test `buildExecCommand()` for interactive and detached (nohup-wrapped) modes. Test `hasBinaryInContainer()` uses `which`. Test `execInContainerAsync()` returns exitCode + output.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement exec methods**

All exec methods look up container info for `user.uid`, `user.gid`, `homeDir`. `buildExecCommand()` returns a string array for Bun.spawn. `execInContainerAsync()` uses `Bun.spawn` with streaming and timeout (port from Docker version).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement exec methods with unprivileged user context"
```

---

### Task 1.5: Host address discovery — `getHostAddress()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test bridge IP parsing from `ip -4 addr show incusbr0` output. Test caching. Test `COMPANION_INCUS_BRIDGE` env var override. Test error when bridge not found.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `getHostAddress()`**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement host address discovery with configurable bridge"
```

---

### Task 1.6: Container creation — `createContainer()` with profile resolution

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests for profile resolution**

Test 3-tier fallback: `config.profiles` → `COMPANION_INCUS_PROFILES` env → `["default"]`.

- [ ] **Step 2: Write failing tests for the creation flow**

Test correct command sequence: findFreePort → incus launch with profiles → getent passwd 1000 → disk devices → proxy devices → systemd readiness → auth seeding. Test container stored in map. Test cleanup on failure. Test port EADDRINUSE retry.

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Implement `createContainer()`**

Profile resolution, host temp dir at `/tmp/companion-ws-<sessionId>`, `findFreePort()` with retry, `getent passwd 1000` parsing.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement container creation with devices, profiles, and user resolution"
```

---

### Task 1.7: Auth seeding — `seedAuthFiles()`, `seedCodexFiles()`, `seedGitAuth()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test `${homeDir}/.claude` paths (not `/root/.claude`). Test git auth: host token extraction, gh login, credential helper, identity copy, gpgsign disable, safe.directory, SSH→HTTPS rewrite. Test best-effort (failures don't crash).

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement seeding methods**

Port from container-manager.ts replacing `/root/` with `${homeDir}/`. Use `this.execInContainer()`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement auth seeding with dynamic home directory"
```

---

### Task 1.8: Container lifecycle — `startContainer()`, `removeContainer()`, `isContainerAlive()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test `removeContainer()` calls `incus delete --force` + cleans up `hostWorkspaceDir` via `rmSync`. Test `isContainerAlive()` parses JSON from `incus list <name> --format json`. Test `startContainer()` calls `incus start` + re-seeds auth.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement lifecycle methods**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement container lifecycle (start, remove, alive check)"
```

---

### Task 1.9: Workspace copy and git operations

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test `copyWorkspaceToContainer()` builds correct tar pipe command via `incus exec`. Test `gitOpsInContainer()` runs fetch/checkout/pull sequence via `execInContainer()`.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement both methods**

`copyWorkspaceToContainer()`: tar pipe via Bun.spawn with timeout. `gitOpsInContainer()`: same shell logic as Docker version, called via `this.execInContainer()`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement workspace copy and git operations"
```

---

### Task 1.10: Persistence and tracking — `persistState()`, `restoreState()`, `retrack()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test `persistState()`/`restoreState()` round-trips container info via JSON file. Test `retrack()` matches by `name` (not containerId). Test `restoreContainer()` verifies via `incus list <name> --format json`.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement persistence methods**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Run full test suite**

```bash
cd web && bun run test
```

- [ ] **Step 6: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement state persistence and container tracking"
```

---

## Phase 2: Image Provisioning

### Task 2.1: Provision script

**Files:**

- Create: `web/incus/provision-companion.sh`

- [ ] **Step 1: Write the provision script**

Base on `bketelsen/clincus` `scripts/build/clincus.sh`. Must include: `configure_dns_if_needed`, `install_base_dependencies`, `create_code_user` (ubuntu→code), `configure_tmp_cleanup`, `configure_power_wrappers`, `install_nodejs`, `install_claude_cli` (native installer), `install_codex_cli`, `install_bun`, `install_docker` (with primary group socket permissions), `install_github_cli`, `install_code_server`, `install_browser_preview`, `cleanup`.

- [ ] **Step 2: Make it executable**

```bash
chmod +x web/incus/provision-companion.sh
```

- [ ] **Step 3: Commit**

```bash
git add web/incus/provision-companion.sh
git commit -m "feat(incus): add provision script for image building"
```

---

### Task 2.2: ImageProvisionManager

**Files:**

- Create: `web/server/image-provision-manager.ts`
- Create: `web/server/image-provision-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test state machine: `getState()` → "ready"/"idle". Test `ensureImage()` triggers build when idle. Test `rebuild()` triggers even when ready. Test `waitForReady()` resolves after build. Test `onProgress()` callbacks. Test provision script copy-to-user-dir logic.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement ImageProvisionManager**

Port structure from `image-pull-manager.ts`. Replace `startPull()` → `startBuild()`. Remove registry pull. Build reads from `~/.companion/incus/provision-companion.sh`, falls back to bundled.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/image-provision-manager.ts web/server/image-provision-manager.test.ts
git commit -m "feat(incus): implement ImageProvisionManager with local build"
```

---

### Task 2.3: Image build in IncusManager — `buildImage()`

**Files:**

- Modify: `web/server/incus-manager.ts`
- Modify: `web/server/incus-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Test 5-step build flow: launch temp → cloud-init wait → push script → exec → stop → publish → delete. Test progress streaming. Test cleanup on failure.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `buildImage()`**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add web/server/incus-manager.ts web/server/incus-manager.test.ts
git commit -m "feat(incus): implement image build with provision script"
```

---

### Task 2.4: CLI `rebuild-image` command

**Files:**

- Modify: `web/bin/cli.ts`

- [ ] **Step 1: Add `rebuild-image` case to CLI switch and update usage**

- [ ] **Step 2: Manual verification**

```bash
cd web && bun bin/cli.ts help
```

Expected: `rebuild-image` appears in usage output

- [ ] **Step 3: Commit**

```bash
git add web/bin/cli.ts
git commit -m "feat(incus): add rebuild-image CLI command"
```

---

## Phase 3: Consumer Updates

### Task 3.1: Delete old Docker files

**Files:**

- Delete: `web/server/container-manager.ts`
- Delete: `web/server/container-manager.test.ts`
- Delete: `web/server/image-pull-manager.ts`
- Delete: `web/server/image-pull-manager.test.ts`

> **Note:** The codebase will NOT compile after this step. Tasks 3.2–3.9 fix all import references. Delete first, then fix all consumers.

- [ ] **Step 1: Delete the files**

```bash
rm web/server/container-manager.ts web/server/container-manager.test.ts
rm web/server/image-pull-manager.ts web/server/image-pull-manager.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add web/server/container-manager.ts web/server/container-manager.test.ts web/server/image-pull-manager.ts web/server/image-pull-manager.test.ts
git commit -m "refactor: remove Docker container-manager and image-pull-manager"
```

---

### Task 3.2: Update `web/server/index.ts`

**Files:**

- Modify: `web/server/index.ts`

- [ ] **Step 1: Swap imports and initialization**

`containerManager` → `incusManager` from `"./incus-manager.js"`. `imagePullManager` → `imageProvisionManager` from `"./image-provision-manager.js"`.

- [ ] **Step 2: Commit**

```bash
git add web/server/index.ts
git commit -m "refactor: wire incusManager and imageProvisionManager into server bootstrap"
```

---

### Task 3.3: Update `web/server/cli-launcher.ts`

**Files:**

- Modify: `web/server/cli-launcher.ts`
- Modify: `web/server/session-types.ts` (grep for `containerId` — change to `containerName`)

- [ ] **Step 1: Find and update the containerId type definition**

Grep `web/server/` for the canonical `containerId` type in `SdkSessionInfo` or similar. Change to `containerName`. Also check `cli-launcher.ts` line ~155 for the `containerId` field definition.

- [ ] **Step 2: Update the 3 docker exec sites**

**Site 1 — Claude launch (~line 564):** Replace `["docker", "exec", "-i", ...]` with `incusManager.buildExecCommand()`.
**Site 2 — Codex WS launch (~line 777):** Replace `["docker", "exec", "-d", ...]` with nohup wrapper via `buildExecCommand()`.
**Site 3 — Codex stdio launch (~line 1014):** Same as Site 1 with `CODEX_HOME`.

- [ ] **Step 3: Update host address resolution (~line 486)**

Replace `host.docker.internal` with `incusManager.getHostAddress()`. Keep `COMPANION_CONTAINER_SDK_HOST` as explicit override.

- [ ] **Step 4: Update CODEX_HOME references (lines 784, 1022)**

Replace `/root/.codex` with `${container.homeDir}/.codex`.

- [ ] **Step 5: Commit**

```bash
git add web/server/cli-launcher.ts web/server/session-types.ts
git commit -m "refactor: update cli-launcher to use incusManager for exec and host resolution"
```

---

### Task 3.4: Update `web/server/session-git-info.ts` and `web/server/session-creation-service.ts`

**Files:**

- Modify: `web/server/session-git-info.ts`
- Modify: `web/server/session-creation-service.ts`

- [ ] **Step 1: Update session-git-info.ts**

Replace `containerManager` import with `incusManager`. Replace hardcoded `docker exec` (line 16) with `incusManager.execInContainer()`. Replace `container?.containerId` with `container?.name`.

- [ ] **Step 2: Update session-creation-service.ts**

Import swap + type changes. `isDockerSession` → `isContainerSession`. `"the-companion:latest"` → `"companion-incus"`. `privileged: true` → `nesting: true`. All `containerManager.*` → `incusManager.*`. `imagePullManager` → `imageProvisionManager`. Error messages: "Docker" → "Incus". Progress labels: "Pulling Docker image..." → "Building container image...".

- [ ] **Step 3: Commit**

```bash
git add web/server/session-git-info.ts web/server/session-creation-service.ts
git commit -m "refactor: update session-git-info and session-creation-service for Incus"
```

---

### Task 3.5: Update `web/server/routes.ts` — heaviest consumer

**Files:**

- Modify: `web/server/routes.ts`

This file has ~24 `containerManager` call sites across 5 functional areas.

- [ ] **Step 1: Replace all containerManager imports and calls**

Replace all `containerManager.*` → `incusManager.*`. Replace `.containerId` → `.name`. Replace `checkDocker()` → `checkIncus()`, `getDockerVersion()` → `getIncusVersion()`.

- [ ] **Step 2: Rename Docker endpoints**

`POST /api/docker/build-base` → `POST /api/incus/build-image`. `GET /api/docker/base-image` → `GET /api/incus/image-status`.

- [ ] **Step 3: Add new Incus API endpoints**

Add provision script endpoints:

- `GET /api/incus/provision-script` — read `~/.companion/incus/provision-companion.sh`
- `PUT /api/incus/provision-script` — write to `~/.companion/incus/provision-companion.sh`
- `POST /api/incus/provision-script/reset` — copy bundled default back

Add profiles endpoint:

- `GET /api/incus/profiles` — `incus profile list --format json`

- [ ] **Step 4: Commit**

```bash
git add web/server/routes.ts
git commit -m "refactor: migrate routes.ts to incusManager with new Incus endpoints"
```

---

### Task 3.6: Update settings and route sub-files

**Files:**

- Modify: `web/server/settings-manager.ts`
- Modify: `web/server/routes/settings-routes.ts`
- Modify: `web/server/routes/system-routes.ts`
- Modify: `web/server/routes/sandbox-routes.ts`
- Modify: `web/server/routes/env-routes.ts`

- [ ] **Step 1: Update settings-manager.ts**

Rename `dockerAutoUpdate` field to `autoRebuildImage` in: field definition, default value, parsing logic, patch logic.

- [ ] **Step 2: Update settings-routes.ts**

Replace ~8 `dockerAutoUpdate` references with `autoRebuildImage`.

- [ ] **Step 3: Update system-routes.ts**

Replace `imagePullManager.pull("the-companion:latest")` → `imageProvisionManager.rebuild("companion-incus")`. Replace `imagePullManager.waitForReady()` → `imageProvisionManager.waitForReady()`.

- [ ] **Step 4: Update sandbox-routes.ts**

Import swap. `containerManager.checkDocker()` → `incusManager.checkIncus()`. Error: "Docker" → "Incus".

- [ ] **Step 5: Update env-routes.ts**

Import swap. Container status checks.

- [ ] **Step 6: Commit**

```bash
git add web/server/settings-manager.ts web/server/routes/
git commit -m "refactor: update settings and route sub-files for Incus migration"
```

---

### Task 3.7: Update remaining server consumers

**Files:**

- Modify: `web/server/novnc-proxy.ts`
- Modify: `web/server/session-orchestrator.ts`
- Modify: `web/server/terminal-manager.ts`
- Modify: `web/server/agent-types.ts`
- Modify: `web/server/codex-adapter.ts`
- Modify: `web/server/ws-bridge.ts`

- [ ] **Step 1: Update novnc-proxy.ts**

Import swap. `.containerId` → `.name`.

- [ ] **Step 2: Update session-orchestrator.ts**

Import swap. `containerId` → `containerName`. `imagePullManager` → `imageProvisionManager`.

- [ ] **Step 3: Update terminal-manager.ts — full rewrite of spawn logic**

This is NOT a simple import swap. The file has:
- `containerId` field on TerminalInstance interface → change to `containerName`
- `containerId` parameter in `spawn()` method → change to `containerName`
- Hardcoded `["docker", "exec", "-it", "-w", ...]` command → replace with `incusManager.buildExecCommand()`
- `containerId` in `getInfo()` return type → `containerName`

- [ ] **Step 4: Update agent-types.ts**

Replace `// -- Docker --` section header and `/** Optional Docker container configuration */` comment with Incus equivalents.

- [ ] **Step 5: Update comments in codex-adapter.ts and ws-bridge.ts**

Replace "Docker container" references in comments with "container" or "Incus container".

- [ ] **Step 6: Run typecheck**

```bash
cd web && bun run typecheck
```

Expected: PASS (all Docker references eliminated from server code)

- [ ] **Step 7: Commit**

```bash
git add web/server/novnc-proxy.ts web/server/session-orchestrator.ts web/server/terminal-manager.ts web/server/agent-types.ts web/server/codex-adapter.ts web/server/ws-bridge.ts
git commit -m "refactor: update remaining server consumers for Incus"
```

---

### Task 3.8: Update ALL server tests

**Files:**

- Modify: `web/server/cli-launcher.test.ts`
- Modify: `web/server/session-creation-service.test.ts`
- Modify: `web/server/session-orchestrator.test.ts`
- Modify: `web/server/ws-bridge.test.ts`
- Modify: `web/server/routes.test.ts`
- Modify: `web/server/routes/sandbox-routes.test.ts`
- Modify: `web/server/routes/env-routes.test.ts`
- Modify: `web/server/routes/system-routes.test.ts`
- Modify: `web/server/novnc-proxy.test.ts`
- Modify: `web/server/service.test.ts`
- Modify: `web/server/settings-manager.test.ts`
- Modify: `web/server/auto-namer.test.ts`
- Modify: `web/server/ws-bridge-codex.test.ts`
- Modify: `web/server/linear-connections.test.ts`

- [ ] **Step 1: Update mock imports across all test files**

Replace `vi.mock("./container-manager.js")` → `vi.mock("./incus-manager.js")`. Replace `containerManager` → `incusManager`. Replace `imagePullManager` → `imageProvisionManager`.

- [ ] **Step 2: Update Docker-specific assertions and mock data**

Replace `docker exec` assertions → `incus exec`. Replace `containerId` → `containerName`/`name`. Replace `host.docker.internal` → bridge IP. Replace `CODEX_HOME=/root/.codex` → `CODEX_HOME=/home/code/.codex`. Replace ALL `dockerAutoUpdate` → `autoRebuildImage` in settings mocks (found in settings-manager.test.ts, auto-namer.test.ts, ws-bridge-codex.test.ts, linear-connections.test.ts, routes.test.ts).

- [ ] **Step 3: Run full server test suite**

```bash
cd web && bun run test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/server/
git commit -m "test: update all server tests for incusManager migration"
```

---

## Phase 4: Frontend Changes

### Task 4.1: Store and type changes

**Files:**

- Modify: `web/src/types.ts`
- Modify: `web/src/store/updates-slice.ts`
- Modify: `web/src/store/terminal-slice.ts`
- Modify: `web/src/store/index.ts`

- [ ] **Step 1: Update types.ts**

Replace `containerId?: string` with `containerName?: string`.

- [ ] **Step 2: Update store slices**

`updates-slice.ts`: `dockerUpdateDialogOpen` → `imageUpdateDialogOpen`, `setDockerUpdateDialogOpen` → `setImageUpdateDialogOpen`.
`terminal-slice.ts`: `quickTerminalNextDockerIndex` → `quickTerminalNextContainerIndex`, `target: "docker"` → `target: "container"`, `"Docker ${n}"` → `"Container ${n}"`.
`index.ts`: update initial state field names.

- [ ] **Step 3: Commit**

```bash
git add web/src/types.ts web/src/store/
git commit -m "refactor: update frontend types and store for Incus migration"
```

---

### Task 4.2: API client updates

**Files:**

- Modify: `web/src/api.ts`

- [ ] **Step 1: Update types, endpoints, and settings**

`ContainerCreateOpts`: add `nesting?: boolean`, `profiles?: string[]`. `dockerAutoUpdate` → `autoRebuildImage`. Endpoint renames. Add provision script and profiles methods.

- [ ] **Step 2: Commit**

```bash
git add web/src/api.ts
git commit -m "refactor: update API client endpoints for Incus"
```

---

### Task 4.3: Rename DockerUpdateDialog → ImageUpdateDialog

**Files:**

- Delete: `web/src/components/DockerUpdateDialog.tsx`
- Delete: `web/src/components/DockerUpdateDialog.test.tsx`
- Create: `web/src/components/ImageUpdateDialog.tsx`
- Create: `web/src/components/ImageUpdateDialog.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

- [ ] **Step 1: Copy, rename, and update component**

Copy → rename → delete originals. Update all Docker strings per spec Section 4.1. Update function names, store references. Update `App.tsx` and `App.test.tsx` imports and localStorage key.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ImageUpdateDialog.tsx web/src/components/ImageUpdateDialog.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/components/DockerUpdateDialog.tsx web/src/components/DockerUpdateDialog.test.tsx
git commit -m "refactor: rename DockerUpdateDialog to ImageUpdateDialog"
```

---

### Task 4.4: Update all remaining frontend components

**Files:**

- Modify: `web/src/components/HomePage.tsx`
- Modify: `web/src/components/SandboxManager.tsx`
- Modify: `web/src/components/SettingsPage.tsx`
- Modify: `web/src/components/SessionItem.tsx`
- Modify: `web/src/components/TopBar.tsx`
- Modify: `web/src/components/SessionTerminalDock.tsx`
- Modify: `web/src/components/UpdateBanner.tsx`
- Modify: `web/src/components/Playground.tsx`
- Modify: `web/src/components/Composer.tsx`
- Modify: `web/src/components/Sidebar.tsx`
- Modify: `web/src/components/MessageFeed.tsx`
- Modify: `web/src/components/TerminalView.tsx`
- Modify: `web/src/components/SessionCreationProgress.test.tsx`

- [ ] **Step 1: Update Docker UI strings in all components**

Per spec Section 4.2 string table. Key: "Docker image ready" → "Container image ready", badges "Docker"/"No Docker" → "Incus"/"No Incus", etc.

- [ ] **Step 2: Update TerminalView.tsx**

Replace `containerId` prop with `containerName` (lines 15, 34, 78, 147).

- [ ] **Step 3: Update Sidebar.tsx containerId references**

Replace `containerId` at lines ~329 and ~433.

- [ ] **Step 4: Replace Docker logo asset**

Remove `public/logo-docker.svg`. Add `public/logo-incus.svg`. Update `SessionItem.tsx`.

- [ ] **Step 5: Update "The Companion" branding to "Companion Incus"**

- [ ] **Step 6: Commit**

```bash
git add web/src/ public/
git commit -m "refactor: replace all Docker UI strings and containerId with Incus equivalents"
```

---

### Task 4.5: Update all frontend tests

**Files:**

- Modify: `web/src/components/SandboxManager.test.tsx`
- Modify: `web/src/components/SettingsPage.test.tsx`
- Modify: `web/src/components/SessionItem.test.tsx`
- Modify: `web/src/components/TopBar.test.tsx`
- Modify: `web/src/components/SessionTerminalDock.test.tsx`
- Modify: `web/src/components/HomePage.test.tsx`
- Modify: `web/src/components/Sidebar.test.tsx`
- Modify: `web/src/api.test.ts`
- Modify: `web/src/store.test.ts`
- Modify: `web/src/utils/routing.test.ts`
- Modify: `web/src/ws.test.ts`
- Modify: remaining `*.test.tsx` files with Docker/containerId references

- [ ] **Step 1: Batch update test strings and imports**

Docker strings → Incus equivalents. `containerId` → `containerName`. `dockerAutoUpdate` → `autoRebuildImage`. `/api/docker/*` → `/api/incus/*`. `"docker-builder"` route → remove or rename.

- [ ] **Step 2: Run full test suite**

```bash
cd web && bun run test
```

Expected: PASS

- [ ] **Step 3: Run typecheck**

```bash
cd web && bun run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/
git commit -m "test: update all frontend tests for Incus migration"
```

---

## Phase 5: Final Verification

### Task 5.1: Full verification pass

**Files:** None (verification only)

- [ ] **Step 1: Grep for any remaining Docker references (including tests)**

```bash
cd web && grep -rn "docker\|Docker\|DOCKER" --include='*.ts' --include='*.tsx' src/ server/ | grep -v node_modules | head -80
```

Expected: zero results, or only intentional references (Docker-inside-Incus in provision script discussion, `install_docker` function name in comments)

- [ ] **Step 2: Grep for remaining containerId references**

```bash
cd web && grep -rn "containerId" --include='*.ts' --include='*.tsx' src/ server/ | grep -v node_modules | head -20
```

Expected: zero results

- [ ] **Step 3: Run full typecheck and test suite**

```bash
cd web && bun run typecheck && bun run test
```

Expected: both PASS

- [ ] **Step 4: Clean up stale files**

```bash
rm -f incus-plan.md
```

- [ ] **Step 5: Final commit**

```bash
git add incus-plan.md
git commit -m "chore: complete Docker-to-Incus migration, remove stale plan"
```

- [ ] **Step 6: Push to origin**

```bash
git push origin main
```
