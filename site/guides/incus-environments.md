---
title: Incus Environments
---

# Incus Environments

Companion Incus runs agent sessions inside [Incus](https://linuxcontainers.org/incus/) system containers for full workspace isolation. Each session gets its own container with a copy of your project files, pre-installed toolchains, and seeded credentials. Containers are ephemeral — they are created when a session starts and destroyed when it is archived.

## Sandboxes

A sandbox is a reusable configuration profile that tells Companion Incus how to set up a container for a session. Sandbox profiles are stored at `~/.companion/sandboxes/` as JSON files.

Each sandbox has:

- A **name** and **slug** (derived from the name)
- An optional **init script** (shell commands run before the CLI session starts)
- Timestamps (created, updated)

Create and manage sandboxes via the UI (**Environments** in the sidebar) or the [REST API](#rest-api).

![Session creation showing container initialization progress](/screenshots/section-session-creation.png)

## Container lifecycle

When a session starts with a sandbox selected, the following happens:

1. **Launch** — `incus launch companion-incus companion-{sessionId}` creates a system container from the image
2. **Workspace mount** — A host temp directory is created and attached as a disk device at `/workspace` with `shift=true` for UID mapping
3. **Workspace copy** — Host project files are streamed into `/workspace` via tar
4. **Auth seeding** — Claude Code, Codex, and Git credentials are copied from the host (see [Auth & Git Setup](#auth--git-setup))
5. **Port forwarding** — Proxy devices are added for configured ports
6. **Systemd readiness** — The server waits for systemd to reach `running` or `degraded` state
7. **Init script** — Runs if configured in the sandbox
8. **CLI launch** — The Claude Code or Codex subprocess starts inside the container

Container naming follows the pattern `companion-{first 8 characters of sessionId}`.

When a session is archived, the container is removed with `incus delete --force` and the host workspace temp directory is cleaned up.

::: warning
Archiving a sandboxed session destroys the container and all uncommitted changes inside it. Make sure you have committed and pushed any work before archiving.
:::

## Incus images

The default image is `companion-incus`, based on Ubuntu 24.04. It comes pre-installed with:

| Tool | Version / Source |
|---|---|
| Node.js | 22 LTS (via NodeSource) |
| Bun | Latest (via official installer) |
| Claude Code CLI | Latest |
| Codex CLI | Latest (via npm) |
| GitHub CLI (`gh`) | Latest |
| code-server | Latest |
| Python 3 | System package + pip + venv |
| Container engine | Latest CE (requires `security.nesting=true`) |

Plus system tools: git, curl, wget, make, jq, ripgrep, fzf, tmux, build-essential, pkg-config, libssl-dev, and locale support (en_US.UTF-8).

The container runs as an unprivileged user `code` (UID 1000) with passwordless sudo.

### Building the image

The image is built from a provision script. The build flow:

1. Launch a temporary container from `images:ubuntu/24.04`
2. Push the provision script into the container
3. Execute the provision script (installs all toolchains — takes 10-20 minutes)
4. Clean up build artifacts
5. Stop the container and publish it as the `companion-incus` image alias
6. Delete the temporary build container

You can trigger a build from the UI (**Environments** page) or via the REST API:

```bash
curl -X POST http://localhost:3456/api/incus/build-image \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Custom provision scripts

The provision script is resolved in this order:

1. `~/.companion/incus/provision-companion.sh` (user override — takes precedence)
2. Bundled script shipped with the package

On first build, the bundled script is automatically copied to `~/.companion/incus/provision-companion.sh` so you can customize it. Edit that file to add your own tools, languages, or configuration, then rebuild the image.

::: tip
After editing your provision script, trigger a rebuild from the Environments page in the UI. The old image is replaced automatically.
:::

## Workspace mounting

- A host temp directory is created at `/tmp/companion-ws-{sessionId}` for each session
- This directory is attached as an Incus disk device at `/workspace` with `shift=true` for UID mapping (host files appear owned by UID 1000 inside the container)
- Host project files are copied into the container via tar stream
- The container always uses `/workspace` as its working directory

::: info
Files are copied, not bind-mounted. Changes inside the container do not affect the host project directly. Use git to push changes out of the container.
:::

## Auth & Git setup

The server automatically seeds authentication inside each container so that CLI tools and git work without manual configuration.

### Claude Code

The host `~/.claude/` directory is mounted read-only at `/companion-host-claude/` inside the container. On startup, the following files are copied into the container user's home:

- `.credentials.json`, `auth.json`, `.auth.json`, `credentials.json`
- `settings.json`, `settings.local.json`
- `skills/` directory

### Codex

If `~/.codex/` exists on the host, it is mounted read-only at `/companion-host-codex/`. Files copied:

- `auth.json`, `config.toml`, `models_cache.json`, `version.json`
- Directories: `skills/`, `vendor_imports/`, `prompts/`, `rules/`

### Git

- The GitHub CLI token is extracted from the host via `gh auth token`
- Inside the container, `gh auth login --with-token` authenticates the GitHub CLI
- `gh auth setup-git` configures gh as the git credential helper
- `.gitconfig` is mounted read-only; `user.name` and `user.email` are copied into the container's global git config
- GPG signing is disabled (`commit.gpgsign false`)
- SSH remotes are rewritten to HTTPS (containers do not have the host's SSH keys)
- `/workspace` is marked as a safe directory

## Init scripts

Init scripts let you run setup commands inside the container before the CLI session starts. Configure them per sandbox in the UI.

- Scripts run via `sh -lc` (login shell) as the `code` user
- **Timeout**: 120 seconds by default (configurable via `COMPANION_INIT_SCRIPT_TIMEOUT` in milliseconds)
- A non-zero exit code aborts session creation
- Output is streamed back as progress updates during session creation

**Common uses:**

```bash
# Install project dependencies
cd /workspace && npm install

# Set up a database
createdb myapp_dev && psql myapp_dev < db/schema.sql

# Start background services
sudo systemctl start redis

# Custom environment setup
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20
```

::: tip
Use the **Test Init Script** button in the sandbox editor to run your script in an ephemeral container before using it in a real session.
:::

## Port forwarding

Ports configured in a sandbox are exposed from the container to the host via Incus proxy devices.

- Host ports are dynamically allocated by binding to port 0
- Format: `listen=tcp:0.0.0.0:{hostPort} connect=tcp:127.0.0.1:{containerPort}`
- Retry logic: up to 3 attempts per port if the allocated port is already in use
- The resolved host port is reported back in the session info

In addition to user-configured ports, the following ports are always forwarded:

| Container Port | Service |
|---|---|
| 13337 | code-server (VS Code in browser) |
| 4502 | Codex WebSocket server |
| 6080 | noVNC (browser preview) |

## Environment variables

Environment profiles provide a way to inject environment variables into CLI sessions. Profiles are stored at `~/.companion/envs/` as JSON files, each containing a name and a key-value map of variables.

- Variables are injected into the CLI subprocess at session launch
- Can be selected when creating a session or configured in an agent
- Useful for alternative model providers (e.g., setting `ANTHROPIC_BASE_URL`), custom API keys, or feature flags

Manage profiles via the UI (**Environments** in the sidebar) or the [REST API](#rest-api).

::: info
Environment variables are applied to the CLI subprocess, not the container itself. They work with both sandboxed and non-sandboxed sessions.
:::

## Configuration

| Variable | Description | Default |
|---|---|---|
| `COMPANION_INCUS_PROFILES` | Comma-separated Incus profiles to apply to containers | `default` |
| `COMPANION_INCUS_BRIDGE` | Network bridge name for host address discovery | `incusbr0` |
| `COMPANION_CONTAINER_SDK_HOST` | Host address for SDK WebSocket URL (container to host connectivity) | Auto-detected from bridge |
| `COMPANION_INIT_SCRIPT_TIMEOUT` | Init script timeout in milliseconds | `120000` |

## REST API

### Sandbox endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/sandboxes` | List all sandbox profiles |
| `GET` | `/api/sandboxes/:slug` | Get a single sandbox |
| `POST` | `/api/sandboxes` | Create a sandbox |
| `PUT` | `/api/sandboxes/:slug` | Update a sandbox |
| `DELETE` | `/api/sandboxes/:slug` | Delete a sandbox |
| `POST` | `/api/sandboxes/:slug/test-init` | Test init script in ephemeral container |

### Environment endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/envs` | List all environment profiles |
| `GET` | `/api/envs/:slug` | Get a profile |
| `POST` | `/api/envs` | Create a profile |
| `PUT` | `/api/envs/:slug` | Update a profile |
| `DELETE` | `/api/envs/:slug` | Delete a profile |

### Image management endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/incus/build-image` | Build (or rebuild) the `companion-incus` image |
| `GET` | `/api/incus/image-status` | Check if the `companion-incus` image exists |
| `GET` | `/api/images/:tag/status` | Get build status for any image |
| `POST` | `/api/images/:tag/pull` | Trigger a build for a specific image tag |
