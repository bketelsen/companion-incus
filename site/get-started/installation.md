---
title: Installation
---

# Installation

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI and/or [Codex](https://github.com/openai/codex) CLI

Install Bun and at least one agent CLI:

```bash
# Bun
curl -fsSL https://bun.sh/install | bash

# Claude Code
npm install -g @anthropic-ai/claude-code

# Codex (optional)
npm install -g @openai/codex
```

Make sure your CLI is authenticated before proceeding — run `claude` or `codex` once in your terminal to set up credentials.

## Subscription and authentication

Companion Incus is a local UI layer that runs on your machine. It does not have its own account system or billing.

- **Claude Code** requires an Anthropic API key or a Claude Pro/Team/Enterprise subscription with Claude Code enabled.
- **Codex** requires an OpenAI account with Codex CLI access.

All model inference happens through your own subscriptions. Companion Incus bridges your browser to these CLI tools over a local WebSocket connection.

## Try it instantly

```bash
bunx companion-incus
```

Open [http://localhost:3456](http://localhost:3456).

## Install globally

```bash
bun install -g companion-incus
```

### Background service

Register as a background service so it starts automatically and survives reboots:

```bash
# Register (launchd on macOS, systemd on Linux)
companion-incus install

# Start the service
companion-incus start
```

### Custom port

```bash
companion-incus --port 8080
```

## Authentication

The server auto-generates an auth token on first start, stored at `~/.companion/auth.json`.

```bash
# Show the current token
cd web && bun run generate-token

# Force-regenerate
cd web && bun run generate-token --force
```

Or set via environment variable:

```bash
COMPANION_AUTH_TOKEN="my-secret-token" bunx companion-incus
```

## Preview / prerelease builds

Every push to `main` publishes preview artifacts:

| Artifact | Tag | Example |
|---|---|---|
| npm package | `next` | `bunx companion-incus@next` |

In **Settings > Updates**, switch to **Prerelease** channel to receive preview builds.

## Your first session

### 1. Start the server

```bash
bunx companion-incus
```

Open [http://localhost:3456](http://localhost:3456).

### 2. Create a session

Click **New Session** on the home page. Choose:

- **Backend**: Claude Code or Codex
- **Working directory**: The project folder the agent will operate in
- **Model** (Claude Code): Which Claude model to use
- **Branch** (optional): Select or create a git branch
- **Environment** (optional): Apply an [environment profile](/guides/incus-environments)

Click **Start** to launch the session.

### 3. Chat with the agent

Type a prompt in the composer and press Enter. You'll see:

- **Streaming responses** as the agent thinks
- **Tool call blocks** showing each action (file reads, writes, bash commands)
- **Task items** extracted from the agent's work plan

### 4. Handle permissions

When the agent wants to write a file or run a command, a permission banner appears:

![Permission approval UI](/screenshots/readme-permissions.png)

- **Allow**: Execute this tool call
- **Deny**: Skip this action
- **Allow all**: Auto-approve for the rest of the session

See [Permissions](/guides/sessions-and-permissions#permissions) for more control options.

## Next steps

- [Create saved prompts](/guides/saved-prompts) for reusable instructions
- [Build agents](/guides/agents) for automated workflows
- [Set up Incus environments](/guides/incus-environments) for isolated sessions
- [Connect Linear](/guides/linear-integration) for issue-driven development
