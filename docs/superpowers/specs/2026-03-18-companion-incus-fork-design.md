# Companion Incus — Fork & Docker-to-Incus Migration Design

**Date:** 2026-03-18
**Status:** Review
**Scope:** Fork The Companion, replace Docker with Incus as the sole container runtime

## Context

The Companion is a web UI for Claude Code & Codex that uses Docker to run containerized sessions. This design describes forking the project as `companion-incus` and replacing all Docker container operations with Incus.

**Why Incus over Docker:**
- Full system containers with systemd init (not process wrappers)
- Unprivileged nesting (`security.nesting=true`) without `--privileged`
- Transparent UID/GID shifting via `shift=true` on disk devices
- Better isolation and security model

**Why a fork, not an abstraction layer:**
- The user does not need Docker support — Incus is a full replacement
- No runtime-switching abstraction means less code, fewer edge cases, simpler testing
- Incus's model (names not hex IDs, system containers, disk devices, proxy devices) is different enough that a Docker-shaped interface creates friction

**Upstream relationship:** This is a respectful community fork under MIT license. Full attribution to The Vibe Company and the original Companion project. Not intended to upstream — the original project can adopt or ignore at their discretion.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Incus only, no Docker | User's infrastructure is Incus; Docker adds unnecessary complexity |
| Abstraction layer | None | No need for `IContainerRuntime` interface when only one runtime exists |
| Approach | Clean rewrite of ContainerManager | Incus's model is different enough that surgical replacement would leave Docker-shaped code |
| Image distribution | Local build via provision script | No Incus equivalent to Docker Hub; build-once-and-cache is sufficient |
| Container user | UID 1000 (unprivileged) | Idiomatic Incus; `shift=true` handles host↔container UID mapping |
| Fork type | Fresh repo (not GitHub fork button) | Avoids fork UI limitations; clean history |
| Package name | `companion-incus` | Clear differentiation from upstream |

---

## Phase 0: Fork, Rebrand & Attribution

### 0.1 Attribution

Attribution appears in three places:

**README.md** — prominent section near the top:

> Companion Incus is a fork of [The Companion](https://github.com/The-Vibe-Company/companion) by [The Vibe Company](https://github.com/The-Vibe-Company), originally created by Stan Girard. This fork replaces Docker with [Incus](https://linuxcontainers.org/incus/) as the container runtime for improved isolation and security.
>
> We're grateful to the original authors for building and open-sourcing The Companion under the MIT license. If you don't need Incus-specific features, we recommend using the upstream project.

**LICENSE** — keep original copyright, add fork copyright:

```
MIT License

Copyright (c) 2025 The Vibe Company
Copyright (c) 2026 Brian Ketelsen
```

**package.json** — contributors field:

```json
{
  "author": "Brian Ketelsen",
  "contributors": [
    "Stan Girard (The Vibe Company) — original The Companion project"
  ]
}
```

### 0.2 GitHub Repository

- Create `bketelsen/companion-incus` as a new repo
- Push current code as initial commit: `fork: companion-incus based on The-Vibe-Company/companion v0.92.4`
- Add `upstream` remote: `git remote add upstream https://github.com/The-Vibe-Company/companion.git`
- Repo description: "Incus-powered fork of The Companion — web UI for Claude Code & Codex"

### 0.3 Package Rename

| What | Before | After |
|------|--------|-------|
| npm package | `the-companion` | `companion-incus` |
| CLI commands | `the-companion`, `companion` | `companion-incus`, `companion` |
| Root package.json name | `the-companion` | `companion-incus` |
| web/package.json name | `the-companion` | `companion-incus` |
| Systemd unit | `the-companion.service` | `companion-incus.service` |
| Home directory | `~/.companion/` | `~/.companion/` (unchanged) |
| Default image alias | `the-companion:latest` | `companion-incus` |
| release-please package-name | `the-companion` | `companion-incus` |

**Files to update:**
- `package.json` — name, description, author, contributors; remove `"the-companion": "^0.2.2"` dependency
- `web/package.json` — name, bin entries, author, contributors, description, keywords (add "incus")
- `web/bin/cli.ts` — usage text, binary name references, status messages
- `web/server/service.ts` — systemd unit name, launchd plist identifiers
- `release-please-config.json` — package-name
- UI strings: "The Companion" → "Companion Incus"

### 0.4 CI/CD Changes

| Workflow | Action |
|----------|--------|
| `publish.yml` | Remove Docker Hub job. Update npm publish for `companion-incus`. |
| `docker.yml` | **Delete** |
| `docker-server.yml` | **Delete** |
| `ci.yml` | Keep, review for Docker-specific steps |
| `coverage-gate.yml` | Keep |
| `a11y.yml` | Keep |
| `preview.yml` | Review for Docker references |

### 0.5 Remove Docker Artifacts

- Delete `web/docker/Dockerfile.the-companion`
- Delete `platform/Dockerfile`
- Delete `scripts/build-push-companion-server.sh`
- Remove `DOCKER_REGISTRY` constant from container-manager.ts (file itself deleted later)

### 0.6 npm Publishing

1. `npm login` under personal account
2. Add `NPM_PUBLISH_TOKEN` secret to GitHub repo
3. First publish: `cd web && npm publish --access public`
4. Users install: `bunx companion-incus`

---

## Phase 1: IncusManager — Core Container Operations

### New file: `web/server/incus-manager.ts`

Replaces `web/server/container-manager.ts`.

### Types

```typescript
export interface IncusContainerConfig {
  image: string;              // Incus image alias (e.g. "companion-incus")
  ports: number[];            // Container ports to expose via proxy devices
  env?: Record<string, string>;
  nesting?: boolean;          // security.nesting=true (replaces Docker --privileged)
  profiles?: string[];        // Incus profiles (e.g. ["default", "fast-storage"])
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
}

export interface IncusContainerInfo {
  name: string;               // Incus container name IS the identifier (no hex IDs)
  image: string;
  portMappings: PortMapping[];
  hostCwd: string;
  containerCwd: string;       // always "/workspace"
  hostWorkspaceDir: string;   // host temp dir mounted at /workspace, cleaned up on removal
  homeDir: string;            // resolved at creation, e.g. "/home/ubuntu"
  user: {                     // resolved at creation
    uid: number;              // e.g. 1000
    gid: number;              // e.g. 1000
    name: string;             // e.g. "ubuntu"
  };
  state: "creating" | "running" | "stopped" | "removed";
}
```

### Class API

```typescript
export class IncusManager {
  // Availability
  checkIncus(): boolean;
  getIncusVersion(): string | null;

  // Image management
  imageExists(alias: string): boolean;
  listImages(): string[];
  buildImage(alias: string, onProgress?: (line: string) => void): Promise<{success: boolean; log: string}>;

  // Container lifecycle
  createContainer(sessionId: string, hostCwd: string, config: IncusContainerConfig): IncusContainerInfo;
  startContainer(name: string): void;
  removeContainer(sessionId: string): void;
  isContainerAlive(name: string): "running" | "stopped" | "missing";
  restoreContainer(sessionId: string, info: IncusContainerInfo): boolean;

  // Exec — always runs as the unprivileged user (uid/gid from container info)
  execInContainer(name: string, cmd: string[], timeout?: number): string;
  execInContainerAsync(name: string, cmd: string[], opts?: { timeout?: number; onOutput?: (line: string) => void }): Promise<{exitCode: number; output: string}>;
  buildExecCommand(name: string, opts: { env?: Record<string, string>; interactive?: boolean; cmd: string[] }): string[];

  // Introspection
  hasBinaryInContainer(name: string, binary: string): boolean;  // incus exec -- which <binary>

  // File transfer
  copyWorkspaceToContainer(name: string, hostCwd: string): Promise<void>;

  // Auth seeding
  reseedGitAuth(name: string): void;

  // Git ops in container
  gitOpsInContainer(name: string, opts: { branch: string; currentBranch: string; createBranch?: boolean; defaultBranch?: string }): { fetchOk: boolean; checkoutOk: boolean; pullOk: boolean; errors: string[] };

  // Host connectivity
  getHostAddress(): string;  // cached incusbr0 bridge IP

  // Container/session tracking
  getContainer(sessionId: string): IncusContainerInfo | undefined;
  getContainerByName(name: string): IncusContainerInfo | undefined;
  listContainers(): IncusContainerInfo[];
  retrack(name: string, newSessionId: string): void;

  // Persistence
  persistState(filePath: string): void;
  restoreState(filePath: string): number;

  // Cleanup
  cleanupAll(): void;
}

export const incusManager: IncusManager;
```

### Container Creation Flow

```
1.  Resolve profiles: config.profiles ?? env COMPANION_INCUS_PROFILES ?? ["default"]
2.  findFreePort() for each requested port (Incus has no auto-assignment)
3.  incus launch <image> <name> [--profile p1 --profile p2] [-c security.nesting=true]
4.  Resolve container user:
      incus exec <name> -- getent passwd 1000 → parse homeDir, username
5.  Add disk devices:
      workspace:     host temp dir → /workspace (shift=true)
      claude-auth:   host ~/.claude → /companion-host-claude (readonly, shift=true)
      codex-auth:    host ~/.codex → /companion-host-codex (readonly, shift=true) [if exists]
      gitconfig:     host ~/.gitconfig → /companion-host-gitconfig (readonly, shift=true) [if exists]
6.  Add proxy device per port:
      listen=tcp:0.0.0.0:<hostPort> connect=tcp:127.0.0.1:<containerPort>
7.  Wait for container ready:
      poll: incus exec <name> -- systemctl is-system-running (with timeout)
8.  Seed auth files:
      copy from /companion-host-claude → ${homeDir}/.claude
      copy from /companion-host-codex → ${homeDir}/.codex [if mounted]
9.  Seed git auth (gh login, setup-git, identity copy, safe.directory, SSH→HTTPS rewrite)
```

**Key differences from Docker:**
- No `sleep infinity` — systemd init keeps the container alive
- No tmpfs — container filesystem is writable; auth copied directly into `${homeDir}/.claude`
- No `--add-host=host.docker.internal:host-gateway` — host address via bridge IP discovery
- Ports pre-allocated with `findFreePort()` before creating proxy devices
- `shift=true` on disk devices handles UID mapping transparently
- No `validateContainerId` hex check — Incus names validated as alphanumeric + hyphens

**Prerequisite: Incus agent.** The `incus exec --user/--group` flags require the Incus agent running inside the container. The systemd readiness check (step 7) implicitly validates this — if `systemctl is-system-running` succeeds via `incus exec`, the agent is operational.

**Workspace cleanup:** `removeContainer()` deletes the host workspace temp dir (`hostWorkspaceDir`) after `incus delete --force`. Unlike Docker named volumes, this is a plain host directory that must be explicitly cleaned up.

### Exec — Unprivileged User Context

All `execInContainer` calls run as the resolved unprivileged user:

```typescript
execInContainer(name: string, cmd: string[], timeout?: number): string {
  const info = this.getContainerByName(name);
  const execArgs = [
    "incus", "exec",
    "--user", String(info.user.uid),
    "--group", String(info.user.gid),
    "--env", `HOME=${info.homeDir}`,
    name, "--",
    ...cmd,
  ];
  return exec(execArgs.map(shellEscape).join(" "), { encoding: "utf-8", timeout });
}
```

### Detached Exec (Codex WS launcher)

Docker's `docker exec -d` has no Incus equivalent. Solution:

```typescript
// Wrap command with nohup for detached execution
const wrappedCmd = `nohup ${innerCmd} >/dev/null 2>&1 &`;
incusManager.buildExecCommand(name, { cmd: ["bash", "-lc", wrappedCmd] });
```

### Host Address Discovery

```typescript
private hostAddress: string | null = null;

getHostAddress(): string {
  if (this.hostAddress) return this.hostAddress;
  // Bridge name is configurable (default: incusbr0, LXD migrations may use lxdbr0)
  const bridge = (process.env.COMPANION_INCUS_BRIDGE || "incusbr0").trim();
  try {
    const ip = execSync(`ip -4 addr show ${bridge} | grep -oP '(?<=inet )\\d+(\\.\\d+){3}'`)
      .toString().trim();
    this.hostAddress = ip;
    return ip;
  } catch {
    // Fallback: ask a running container for the default gateway
    // (used when bridge name is unknown or host networking differs)
    throw new Error(
      `Could not discover host address from bridge "${bridge}". ` +
      `Set COMPANION_INCUS_BRIDGE or COMPANION_CONTAINER_SDK_HOST.`
    );
  }
}
```

Cached at first use. Bridge name configurable via `COMPANION_INCUS_BRIDGE` env var (defaults to `incusbr0`). Replaces `host.docker.internal` / `COMPANION_CONTAINER_SDK_HOST` (the latter is still supported as an explicit override).

### Workspace Copy

```typescript
async copyWorkspaceToContainer(name: string, hostCwd: string): Promise<void> {
  // tar pipe for performance (same approach as Docker, proven with large repos)
  const cmd = `COPYFILE_DISABLE=1 tar -C ${shellEscape(hostCwd)} -cf - . | incus exec ${name} -- tar -xf - -C /workspace`;
  // ... Bun.spawn with timeout and error handling
}
```

### Incus Profile Support

Profiles control storage pool, network bridge, resource limits without application code changes.

**Configuration layers (most to least specific):**
1. Per-sandbox — sandbox definition includes optional `incusProfiles?: string[]`
2. Server-wide default — `COMPANION_INCUS_PROFILES` env var (comma-separated)
3. Fallback — `["default"]`

```typescript
const profiles = config.profiles
  ?? process.env.COMPANION_INCUS_PROFILES?.split(",").map(s => s.trim()).filter(Boolean)
  ?? ["default"];
```

At launch:
```bash
incus launch companion-incus <name> --profile default --profile companion-ssd
```

**API endpoints (wire now, UI later):**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/incus/profiles` | List available Incus profiles (`incus profile list --format json`) |
| Sandbox CRUD | Existing sandbox model gains optional `incusProfiles?: string[]` field |

**Enables without code changes:** different storage pools, isolated network bridges, resource limits (CPU/memory), GPU passthrough, custom DNS/cloud-init configs.

---

## Phase 2: Image Provisioning

### Provision Script

**Bundled default:** `web/incus/provision-companion.sh`
**User-editable copy:** `~/.companion/incus/provision-companion.sh`

On first run, the bundled script is copied to `~/.companion/incus/` if not already present. The build flow always reads from `~/.companion/incus/`. Users can customize their image toolchain by editing this file.

The script installs (as UID 1000 where user-level, system-wide where appropriate):
- System packages (curl, git, build-essential, etc.)
- Node.js 22 via nvm (user-level, `/home/ubuntu/.nvm`)
- Bun, Deno (user-level)
- Go 1.23, Rust, Python 3
- GitHub CLI (`gh`)
- Claude Code CLI, Codex CLI (via npm)
- code-server (VS Code in browser)
- Xvfb, noVNC, Chromium (browser preview)
- No Docker-in-Docker — Incus nesting provides inner container support

### Build Flow

```bash
# 1. Launch temp container from base image
incus launch images:ubuntu/24.04 companion-incus-build

# 2. Wait for cloud-init + network
incus exec companion-incus-build -- cloud-init status --wait

# 3. Push and execute provisioning script
incus file push ~/.companion/incus/provision-companion.sh companion-incus-build/tmp/
incus exec companion-incus-build -- bash /tmp/provision-companion.sh

# 4. Clean up
incus exec companion-incus-build -- bash -c 'apt-get clean && rm -rf /tmp/*'

# 5. Publish as reusable image
incus stop companion-incus-build
incus publish companion-incus-build --alias companion-incus
incus delete companion-incus-build
```

### New file: `web/server/image-provision-manager.ts`

Replaces `web/server/image-pull-manager.ts`.

```typescript
class ImageProvisionManager {
  getState(image: string): ImageProvisionState;
  isReady(image: string): boolean;
  ensureImage(image: string): void;          // builds if missing, no-op if exists
  rebuild(image: string): void;              // force rebuild even if exists
  waitForReady(image: string, timeoutMs?: number): Promise<boolean>;
  onProgress(image: string, cb: (line: string) => void): () => void;
}
```

No registry pull, no fallback chain. Just: `imageExists()` → if no, `buildImage()`.

**Build time:** 10-20 minutes on first run. Mitigations:
- Streaming progress to UI
- Image persists in Incus storage — built once
- CLI: `companion-incus rebuild-image` to force rebuild
- Web UI: "Rebuild Image" button (replaces "Pull Image")

### Provision Script API (wire now, UI later)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/incus/provision-script` | Return current script content |
| `PUT /api/incus/provision-script` | Save edited script |
| `POST /api/incus/provision-script/reset` | Copy bundled default back to `~/.companion/incus/` |

---

## Phase 3: Consumer Updates

Every file importing from `container-manager.ts` or hardcoding Docker commands.

### 3.1 `web/server/index.ts`

- `import { containerManager }` → `import { incusManager }`
- `containerManager.restoreState()` → `incusManager.restoreState()`

### 3.2 `web/server/cli-launcher.ts`

**3 docker exec sites + host address:**

- **Claude launch (~line 564):** `["docker", "exec", "-i", ...]` → `incusManager.buildExecCommand()` with `interactive: true`
- **Codex WS launch (~line 777, detached):** `["docker", "exec", "-d", ...]` → `buildExecCommand()` with `nohup` wrapper
- **Codex stdio launch (~line 1014):** Same pattern as Claude launch
- **Host address (~line 486):** `host.docker.internal` → `incusManager.getHostAddress()`
- **`CODEX_HOME=/root/.codex`** (lines 784, 1022) → `CODEX_HOME=${homeDir}/.codex`

**Type change:** `SdkSessionInfo.containerId` → `SdkSessionInfo.containerName`

### 3.3 `web/server/session-git-info.ts`

- Hardcoded `docker exec` (line 16) → `incusManager.execInContainer()`
- Import swap: `containerManager` → `incusManager`

### 3.4 `web/server/session-creation-service.ts`

- Import swap + type changes (`ContainerConfig` → `IncusContainerConfig`, etc.)
- `isDockerSession` → `isContainerSession`
- `effectiveImage` default: `"the-companion:latest"` → `"companion-incus"`
- `privileged: true` → `nesting: true`
- All `containerManager.*` calls → `incusManager.*`
- Error messages: "Docker is required" → "Incus is required"

### 3.5 `web/server/image-pull-manager.ts` → `web/server/image-provision-manager.ts`

Full rewrite as described in Phase 2.

### 3.6 `web/server/routes/sandbox-routes.ts`

- Import swap
- `containerManager.checkDocker()` → `incusManager.checkIncus()`
- Error: "Docker is not available" → "Incus is not available"

### 3.7 `web/server/routes.ts`

This is the **heaviest consumer** of `containerManager` with ~24 call sites across 5 functional areas:

- **Container status endpoint** (~line 1230): `checkDocker()` → `checkIncus()`, `getDockerVersion()` → `getIncusVersion()`, `listImages()` → `listImages()`
- **Code-server launch**: `hasBinaryInContainer()` check for `code-server`, `execInContainerAsync()` to start it
- **Xvfb/noVNC startup**: `hasBinaryInContainer()` checks for `Xvfb` and `websockify`, `execInContainerAsync()` to start display server
- **Browser preview**: `execInContainer()` for chromium launch inside container
- **File operations**: `execInContainer()` for in-container file reads/writes

All `containerManager.*` → `incusManager.*`. All `.containerId` → `.name`.

Endpoint renames:
- `POST /api/docker/build-base` → `POST /api/incus/build-image`
- `GET /api/docker/base-image` → `GET /api/incus/image-status`
- New endpoints: `/api/incus/provision-script` (GET/PUT), `/api/incus/provision-script/reset` (POST), `/api/incus/profiles` (GET)

### 3.8 `web/server/routes/env-routes.ts`

- Import swap
- `containerManager.checkDocker()` → `incusManager.checkIncus()`
- `containerManager.imageExists()` → `incusManager.imageExists()`

### 3.9 `web/server/routes/system-routes.ts`

- `dockerAutoUpdate` references → `autoRebuildImage`
- `imagePullManager.pull("the-companion:latest")` → `imageProvisionManager.rebuild("companion-incus")`
- `imagePullManager.waitForReady()` → `imageProvisionManager.waitForReady()`

### 3.10 `web/server/settings-manager.ts`

- `dockerAutoUpdate` field definition, default value, parsing, and patch logic → `autoRebuildImage`
- This cascades into `web/server/routes/settings-routes.ts` which has ~8 references to `dockerAutoUpdate`

### 3.11 `web/server/novnc-proxy.ts`

- `containerManager.getContainer()` → `incusManager.getContainer()`
- `.containerId` → `.name`

### 3.12 `web/server/session-orchestrator.ts`

- Import swap
- `containerId` → `containerName` throughout
- References `imagePullManager` → `imageProvisionManager`

### 3.13 `web/server/terminal-manager.ts`

- Import swap: `containerManager` → `incusManager`
- Docker exec for terminal spawn → `incusManager.buildExecCommand()`

### 3.14 `web/server/routes/env-routes.test.ts` and `web/server/routes/settings-routes.ts`

- `env-routes.test.ts`: mock swap from `containerManager` to `incusManager`
- `settings-routes.ts`: ~8 references to `dockerAutoUpdate` → `autoRebuildImage`

### 3.15 Files to Delete

- `web/server/container-manager.ts`
- `web/server/container-manager.test.ts`
- `web/server/image-pull-manager.ts`
- `web/server/image-pull-manager.test.ts`
- `web/docker/Dockerfile.the-companion`
- `platform/Dockerfile`
- `scripts/build-push-companion-server.sh`
- `.github/workflows/docker.yml`
- `.github/workflows/docker-server.yml`

### 3.16 New Test Files

- `web/server/incus-manager.test.ts` — mock `execSync`, verify `incus` commands, port pre-allocation, user resolution, auth seeding with dynamic homeDir
- `web/server/image-provision-manager.test.ts` — mock build flow, test state machine (idle → building → ready/error)

---

## Phase 4: Frontend Changes

~250 Docker-specific references across ~29 files.

### 4.1 Component Renames

| Old | New |
|-----|-----|
| `DockerUpdateDialog.tsx` | `ImageUpdateDialog.tsx` |
| `DockerUpdateDialog.test.tsx` | `ImageUpdateDialog.test.tsx` |

Dialog purpose changes from "pull Docker image" to "rebuild Incus image":
- "Would you like to also update the sandbox Docker image?" → "Would you like to rebuild the sandbox image? This will re-run the provisioning script."
- "Pulling the-companion:latest" → "Building companion-incus image..."
- Progress shows provision script output instead of Docker pull layers
- "Always update Docker image automatically" → "Always rebuild image on update"

### 4.2 UI String Replacements

| File | Old | New |
|------|-----|-----|
| `HomePage.tsx` | "Docker image ready" | "Container image ready" |
| `HomePage.tsx` | "Pulling Docker image..." | "Building container image..." |
| `SandboxManager.tsx` | "Docker" / "No Docker" badges | "Incus" / "No Incus" |
| `SettingsPage.tsx` | "Auto-update Docker image" | "Auto-rebuild container image" |
| `SettingsPage.tsx` | "Automatically re-pull the sandbox Docker image..." | "Automatically rebuild the sandbox image when updating Companion Incus" |
| `SessionItem.tsx` | Docker logo + "Docker" title | Incus/container icon + "Incus" |
| `Playground.tsx` | "Pulling Docker image..." (multiple) | "Building container image..." |
| Error messages | "Docker is not available" | "Incus is not available" |

### 4.3 Store Changes

| Old | New |
|-----|-----|
| `dockerUpdateDialogOpen` | `imageUpdateDialogOpen` |
| `setDockerUpdateDialogOpen` | `setImageUpdateDialogOpen` |
| `quickTerminalNextDockerIndex` | `quickTerminalNextContainerIndex` |
| `target: "host" \| "docker"` | `target: "host" \| "container"` |
| label `"Docker ${n}"` | label `"Container ${n}"` |
| `dockerAutoUpdate` | `autoRebuildImage` |

### 4.4 API Client (`api.ts`)

- `ContainerCreateOpts` — remove Docker-specific fields, add `nesting?: boolean`, `profiles?: string[]`
- Settings: `dockerAutoUpdate` → `autoRebuildImage`
- Endpoints:
  - `POST /api/docker/build-base` → `POST /api/incus/build-image`
  - `GET /api/docker/base-image` → `GET /api/incus/image-status`
  - New: `GET/PUT /api/incus/provision-script`, `POST /api/incus/provision-script/reset`

### 4.5 Types (`types.ts`)

- `containerId?: string` → `containerName?: string`

### 4.6 LocalStorage Keys

- `"companion_docker_prompt_pending"` → `"companion_image_rebuild_pending"`

### 4.7 Static Assets

- Remove `/logo-docker.svg`
- Add `/logo-incus.svg` or generic container icon

### 4.8 Test Updates (mechanical)

All test files with Docker strings, `DockerUpdateDialog` references, or Docker store state get matching updates. Logic stays the same, only names and strings change. Key files:

- `DockerUpdateDialog.test.tsx` → `ImageUpdateDialog.test.tsx`
- `SandboxManager.test.tsx` — "Docker Status Badge" → "Incus Status Badge"
- `SettingsPage.test.tsx` — `dockerAutoUpdate` → `autoRebuildImage`
- `SessionItem.test.tsx` — Docker logo → Incus icon
- `TopBar.test.tsx`, `SessionTerminalDock.test.tsx` — "docker quick terminal" → "container quick terminal"
- `HomePage.test.tsx` — "Pulling Docker image..." → "Building container image..."
- `api.test.ts` — `/api/docker/*` → `/api/incus/*`
- `store.test.ts` — Docker terminal labels → Container labels
- `ws-bridge.test.ts` — hardcoded `docker exec` assertions → `incus exec`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Incus image build takes 10-20 min** | Poor first-run UX | Streaming progress UI; image cached after first build; CLI `rebuild-image` command |
| **Port pre-allocation TOCTOU race** | Two containers could grab the same port between `findFreePort()` and `incus config device add` | Retry loop: if proxy device add fails with EADDRINUSE, call `findFreePort()` again (max 3 retries) |
| **`incus exec` detached mode missing** | Codex WS launcher needs background exec | `nohup cmd &` wrapper inside bash; validated in Docker equivalent scenarios |
| **Bridge name varies** | `incusbr0` may not exist (LXD migrations use `lxdbr0`, custom setups use other names) | `COMPANION_INCUS_BRIDGE` env var (default `incusbr0`); `COMPANION_CONTAINER_SDK_HOST` override still supported |
| **Container startup latency** | Incus system containers slower than Docker's `sleep infinity` | Poll `systemctl is-system-running` with reasonable timeout (30s); published images skip cloud-init |
| **Incus agent not running** | `incus exec --user/--group` fails without agent | Systemd readiness check (step 7) implicitly validates agent is operational; timeout with clear error |
| **UID 1000 may not exist on all images** | `getent passwd 1000` fails | Validate during container creation; fail with clear error suggesting image requirements |
| **Provision script divergence** | User edits break image builds | `POST /api/incus/provision-script/reset` to restore bundled default; provision script version header |
| **`shift=true` + readonly edge cases** | UID shifting on readonly disk devices may behave unexpectedly | Validate during implementation; fall back to non-shifted mount + explicit permission setup if needed |
| **`createContainer` blocks event loop** | Multi-step Incus creation (launch + user resolve + devices + systemd wait) is slower than Docker | Consider making `createContainer` async in implementation if blocking exceeds ~5s; session creation is already async |

---

## Files Summary

### New Files
- `web/server/incus-manager.ts`
- `web/server/incus-manager.test.ts`
- `web/server/image-provision-manager.ts`
- `web/server/image-provision-manager.test.ts`
- `web/incus/provision-companion.sh`
- `web/src/components/ImageUpdateDialog.tsx`
- `web/src/components/ImageUpdateDialog.test.tsx`

### Deleted Files
- `web/server/container-manager.ts`
- `web/server/container-manager.test.ts`
- `web/server/image-pull-manager.ts`
- `web/server/image-pull-manager.test.ts`
- `web/docker/Dockerfile.the-companion`
- `platform/Dockerfile`
- `scripts/build-push-companion-server.sh`
- `.github/workflows/docker.yml`
- `.github/workflows/docker-server.yml`
- `web/src/components/DockerUpdateDialog.tsx`
- `web/src/components/DockerUpdateDialog.test.tsx`

### Modified Files (major changes)
- `web/server/cli-launcher.ts` — 3 exec sites + host address + types
- `web/server/session-creation-service.ts` — full container flow
- `web/server/session-git-info.ts` — docker exec → incusManager.execInContainer
- `web/server/session-orchestrator.ts` — container lifecycle + imagePullManager → imageProvisionManager
- `web/server/terminal-manager.ts` — docker exec for terminal spawn → incusManager.buildExecCommand
- `web/server/routes.ts` — ~24 containerManager call sites across 5 functional areas + endpoint renames + new endpoints
- `web/server/routes/sandbox-routes.ts` — container operations
- `web/server/routes/env-routes.ts` — container status checks
- `web/server/routes/system-routes.ts` — dockerAutoUpdate + imagePullManager → autoRebuildImage + imageProvisionManager
- `web/server/routes/settings-routes.ts` — ~8 dockerAutoUpdate references
- `web/server/settings-manager.ts` — dockerAutoUpdate field → autoRebuildImage
- `web/server/novnc-proxy.ts` — container lookup
- `web/server/index.ts` — initialization

### Modified Files (string/import changes)
- `web/server/routes/env-routes.ts`
- `web/src/components/HomePage.tsx`
- `web/src/components/SandboxManager.tsx`
- `web/src/components/SettingsPage.tsx`
- `web/src/components/SessionItem.tsx`
- `web/src/components/TopBar.tsx`
- `web/src/components/SessionTerminalDock.tsx`
- `web/src/components/UpdateBanner.tsx`
- `web/src/components/Playground.tsx`
- `web/src/components/App.tsx`
- `web/src/api.ts`
- `web/src/types.ts`
- `web/src/store/updates-slice.ts`
- `web/src/store/terminal-slice.ts`
- `web/src/store/index.ts`
- `package.json`
- `web/package.json`
- `web/bin/cli.ts`
- `release-please-config.json`
- `README.md`
- `LICENSE`
- `.github/workflows/publish.yml`
- ~15 test files (mechanical string replacements)
