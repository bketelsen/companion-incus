# Combined Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the Mintlify docs site and React landing page into a single VitePress static site deployed to GitHub Pages, rebranded as Companion Incus.

**Architecture:** New `site/` directory with VitePress. Custom Vue home page component with gradient blend design (warm hero → clean docs). All 12 doc pages migrated from Mintlify `.mdx` to VitePress `.md` with full Incus rewrite. GitHub Actions deploys to `bketelsen.github.io/companion-incus/`.

**Tech Stack:** VitePress 1.6+, Vue 3 (home page component), GitHub Pages, Bun

**Spec:** `docs/superpowers/specs/2026-03-18-combined-site-design.md`

---

### Task 1: Scaffold VitePress project

**Files:**
- Create: `site/package.json`
- Create: `site/.vitepress/config.ts`
- Create: `site/.vitepress/theme/index.ts`
- Create: `site/.vitepress/theme/style.css`
- Create: `site/index.md`

- [ ] **Step 1: Create `site/package.json`**

```json
{
  "name": "companion-incus-site",
  "private": true,
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview"
  },
  "devDependencies": {
    "vitepress": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd site && bun install`

- [ ] **Step 3: Create `site/.vitepress/config.ts`**

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Companion Incus',
  description: 'Multi-agent web UI for Claude Code & Codex, powered by Incus containers',
  base: '/companion-incus/',

  head: [
    ['link', { rel: 'icon', href: '/companion-incus/favicon.svg' }],
  ],

  themeConfig: {
    siteTitle: 'Companion Incus',

    nav: [
      { text: 'Docs', link: '/get-started/installation' },
      { text: 'GitHub', link: 'https://github.com/bketelsen/companion-incus' },
      { text: 'npm', link: 'https://www.npmjs.com/package/companion-incus' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Get Started',
          items: [
            { text: 'Introduction', link: '/' },
            { text: 'Installation', link: '/get-started/installation' },
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'Sessions & Permissions', link: '/guides/sessions-and-permissions' },
            { text: 'Incus Environments', link: '/guides/incus-environments' },
            { text: 'Git Worktrees', link: '/guides/git-worktrees' },
            { text: 'Agents', link: '/guides/agents' },
            { text: 'Chat Webhooks', link: '/guides/chat-webhooks' },
            { text: 'Saved Prompts', link: '/guides/saved-prompts' },
            { text: 'Linear Integration', link: '/guides/linear-integration' },
          ]
        },
        {
          text: 'Deploy',
          items: [
            { text: 'Cloud VM', link: '/deploy/cloud-vm' },
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'CLI & API', link: '/reference/cli-and-api' },
            { text: 'Troubleshooting', link: '/reference/troubleshooting' },
          ]
        },
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/bketelsen/companion-incus' },
    ],

    footer: {
      message: 'Based on <a href="https://github.com/The-Vibe-Company/companion">The Companion</a> by The Vibe Company',
      copyright: 'Released under the MIT License',
    },

    search: {
      provider: 'local',
    },
  },
})
```

- [ ] **Step 4: Create `site/.vitepress/theme/style.css`**

```css
/* Brand color overrides — burnt orange accent */
:root {
  --vp-c-brand-1: #b74f2b;
  --vp-c-brand-2: #a34425;
  --vp-c-brand-3: #8f3a1f;
  --vp-c-brand-soft: rgba(183, 79, 43, 0.14);
}

.dark {
  --vp-c-brand-1: #d4734e;
  --vp-c-brand-2: #c4623d;
  --vp-c-brand-3: #b74f2b;
  --vp-c-brand-soft: rgba(212, 115, 78, 0.14);
}
```

- [ ] **Step 5: Create `site/.vitepress/theme/index.ts`**

```ts
import DefaultTheme from 'vitepress/theme'
import './style.css'

export default DefaultTheme
```

- [ ] **Step 6: Create placeholder `site/index.md`**

```markdown
---
layout: home

hero:
  name: Companion Incus
  text: Multi-agent web UI for Claude Code & Codex
  tagline: Powered by Incus containers
  actions:
    - theme: brand
      text: Get Started
      link: /get-started/installation
    - theme: alt
      text: GitHub
      link: https://github.com/bketelsen/companion-incus

features:
  - title: Multi-Agent Sessions
    details: Run Claude Code and Codex side by side with independent sessions
  - title: Incus Containers
    details: Sandboxed environments powered by Incus with full workspace isolation
  - title: MCP Native
    details: Plug in custom tools and data sources via Model Context Protocol
  - title: Web Terminal
    details: Browser-based shells connected to your agent sessions
  - title: Environment Profiles
    details: Save and reuse model, provider, and variable configurations
  - title: Secure Remote Ops
    details: Tailscale integration for secure access from anywhere
---
```

This is a temporary placeholder using VitePress built-in hero. Task 2 replaces it with the custom component.

- [ ] **Step 7: Add VitePress build artifacts to `.gitignore`**

Append to the repo root `.gitignore`:

```
site/.vitepress/dist/
site/.vitepress/cache/
```

- [ ] **Step 8: Verify the scaffold builds**

Run: `cd site && bun run build`
Expected: Build succeeds, output in `site/.vitepress/dist/`

- [ ] **Step 9: Commit**

```bash
git add site/ .gitignore
git commit -m "feat(site): scaffold VitePress project with config and theme"
```

---

### Task 2: Custom home page component

**Files:**
- Create: `site/.vitepress/theme/HomePage.vue`
- Modify: `site/.vitepress/theme/index.ts`
- Modify: `site/.vitepress/theme/style.css`
- Modify: `site/index.md`

- [ ] **Step 1: Create `site/.vitepress/theme/HomePage.vue`**

```vue
<script setup>
import { withBase } from 'vitepress'
</script>

<template>
  <!-- Hero with warm gradient -->
  <section class="hero-section">
    <div class="hero-inner">
      <h1 class="hero-title">Companion Incus</h1>
      <p class="hero-tagline">Multi-agent web UI for Claude Code &amp; Codex</p>
      <div class="hero-install">
        <code>bunx companion-incus</code>
      </div>
      <div class="hero-actions">
        <a class="btn-brand" :href="withBase('/get-started/installation')">Get Started</a>
        <a class="btn-alt" href="https://github.com/bketelsen/companion-incus">GitHub</a>
      </div>
    </div>
  </section>

  <!-- Feature cards on white/dark background -->
  <section class="features-section">
    <div class="features-grid">
      <div class="feature-card">
        <h3>Multi-Agent Sessions</h3>
        <p>Run Claude Code and Codex side by side with independent sessions</p>
      </div>
      <div class="feature-card">
        <h3>Incus Containers</h3>
        <p>Sandboxed environments powered by Incus with full workspace isolation</p>
      </div>
      <div class="feature-card">
        <h3>MCP Native</h3>
        <p>Plug in custom tools and data sources via Model Context Protocol</p>
      </div>
      <div class="feature-card">
        <h3>Web Terminal</h3>
        <p>Browser-based shells connected to your agent sessions</p>
      </div>
      <div class="feature-card">
        <h3>Environment Profiles</h3>
        <p>Save and reuse model, provider, and variable configurations</p>
      </div>
      <div class="feature-card">
        <h3>Secure Remote Ops</h3>
        <p>Tailscale integration for secure access from anywhere</p>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="how-section">
    <h2>How It Works</h2>
    <div class="architecture">
      <span class="arch-node">Browser UI</span>
      <span class="arch-arrow">↔ WS ↔</span>
      <span class="arch-node">Hono Server</span>
      <span class="arch-arrow">↔ WS ↔</span>
      <span class="arch-node">Claude Code / Codex CLI</span>
    </div>
    <p class="how-desc">
      The server bridges WebSocket connections between your browser and CLI agents
      running inside Incus containers. Tool calls stream in real time — you approve
      or reject risky actions before they execute.
    </p>
  </section>
</template>
```

Note: Internal links use `:href="withBase('...')"` per spec requirement so they work correctly regardless of the `base` path. External links (e.g. GitHub) use plain `href` since they are absolute URLs.

- [ ] **Step 2: Add home page styles to `site/.vitepress/theme/style.css`**

Append the following after the existing brand color overrides:

```css
/* Home page — hero gradient */
.hero-section {
  background: linear-gradient(180deg, #f0e8d9 0%, var(--vp-c-bg) 100%);
  padding: 80px 24px 64px;
  text-align: center;
}

.dark .hero-section {
  background: linear-gradient(180deg, #2a1f15 0%, var(--vp-c-bg) 100%);
}

.hero-inner {
  max-width: 640px;
  margin: 0 auto;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0 0 8px;
}

.hero-tagline {
  font-size: 1.1rem;
  color: var(--vp-c-text-2);
  margin: 0 0 24px;
}

.hero-install {
  display: inline-block;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px 20px;
  margin-bottom: 24px;
}

.hero-install code {
  font-size: 0.95rem;
  color: var(--vp-c-brand-1);
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-brand {
  display: inline-block;
  padding: 10px 24px;
  background: var(--vp-c-brand-1);
  color: #fff !important;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-brand:hover {
  background: var(--vp-c-brand-2);
}

.btn-alt {
  display: inline-block;
  padding: 10px 24px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1) !important;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.2s;
}

.btn-alt:hover {
  border-color: var(--vp-c-brand-1);
}

/* Home page — features */
.features-section {
  padding: 48px 24px;
  max-width: 960px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 768px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.feature-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 20px;
}

.feature-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--vp-c-text-1);
}

.feature-card p {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin: 0;
  line-height: 1.5;
}

/* Home page — how it works */
.how-section {
  padding: 48px 24px 64px;
  text-align: center;
  max-width: 720px;
  margin: 0 auto;
}

.how-section h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 24px;
  color: var(--vp-c-text-1);
}

.architecture {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.arch-node {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.arch-arrow {
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}

.how-desc {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin: 0;
}
```

- [ ] **Step 3: Register HomePage component in `site/.vitepress/theme/index.ts`**

Replace the file with:

```ts
import DefaultTheme from 'vitepress/theme'
import HomePage from './HomePage.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomePage', HomePage)
  },
}
```

- [ ] **Step 4: Update `site/index.md` to use the custom layout**

Replace the file with:

```markdown
---
layout: page
title: Companion Incus
---

<HomePage />
```

- [ ] **Step 5: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds

- [ ] **Step 6: Quick visual check**

Run: `cd site && bun run preview`
Open the printed URL and verify:
- Warm gradient hero renders
- Feature cards show in 2×3 grid
- How It Works section displays
- Dark mode toggle works (hero gradient should darken)
- Footer shows attribution text

- [ ] **Step 7: Commit**

```bash
git add site/
git commit -m "feat(site): add custom home page with gradient hero and feature cards"
```

---

### Task 3: Migrate assets

**Files:**
- Create: `site/public/favicon.svg` (copy from `docs/images/favicon.svg`)
- Create: `site/public/screenshots/readme-landing.png` (copy from `docs/screenshots/`)
- Create: `site/public/screenshots/readme-main-workspace.png` (copy from `docs/screenshots/`)
- Create: `site/public/screenshots/readme-permissions.png` (copy from `docs/screenshots/`)

- [ ] **Step 1: Copy assets**

```bash
mkdir -p site/public/screenshots
cp docs/images/favicon.svg site/public/favicon.svg
cp docs/screenshots/readme-landing.png site/public/screenshots/
cp docs/screenshots/readme-main-workspace.png site/public/screenshots/
cp docs/screenshots/readme-permissions.png site/public/screenshots/
```

- [ ] **Step 2: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add site/public/
git commit -m "feat(site): migrate favicon and screenshot assets"
```

---

### Task 4: Migrate light-edit docs (branding only)

These 8 pages need branding substitutions and Mintlify → VitePress component conversion. Some pages (notably `sessions-and-permissions` and `installation`) also have Docker-specific content that must be rewritten to reference Incus.

**Files:**
- Create: `site/get-started/installation.md` (from `docs/get-started/installation.mdx`)
- Create: `site/guides/sessions-and-permissions.md` (from `docs/guides/sessions-and-permissions.mdx`)
- Create: `site/guides/git-worktrees.md` (from `docs/guides/git-worktrees.mdx`)
- Create: `site/guides/agents.md` (from `docs/guides/agents.mdx`)
- Create: `site/guides/chat-webhooks.md` (from `docs/guides/chat-webhooks.mdx`)
- Create: `site/guides/saved-prompts.md` (from `docs/guides/saved-prompts.mdx`)
- Create: `site/guides/linear-integration.md` (from `docs/guides/linear-integration.mdx`)
- Create: `site/reference/cli-and-api.md` (from `docs/reference/cli-and-api.mdx`)

**Migration rules (apply to all pages):**

1. Copy `.mdx` content into new `.md` file
2. Replace Mintlify frontmatter (e.g. `icon:`, `sidebarTitle:`) with VitePress frontmatter (just `title:` needed, if any)
3. Apply global rebranding:
   - "The Companion" → "Companion Incus"
   - `the-companion` (package/command) → `companion-incus`
   - `bunx the-companion` → `bunx companion-incus`
   - `thevibecompany/the-companion` → `bketelsen/companion-incus`
   - `thevibecompany/companion` → `bketelsen/companion-incus`
   - `thecompanion.sh` → GitHub Pages URL
   - `stangirard/the-companion` → `bketelsen/companion-incus`
4. Convert Mintlify components:
   - `<Warning>...</Warning>` → `::: warning\n...\n:::`
   - `<Tip>...</Tip>` → `::: tip\n...\n:::`
   - `<Note>...</Note>` → `::: info\n...\n:::`
   - `<CardGroup>` / `<Card>` → plain markdown links or list items
   - `<img src="/screenshots/...">` → `![alt](/screenshots/...)`
5. Remove any Mintlify-specific imports or JSX syntax
6. Update internal cross-references:
   - `/guides/docker-and-environments` → `/guides/incus-environments`
   - Any other links to renamed/moved pages
7. Replace Docker-specific content with Incus equivalents:
   - "Docker environment" / "Docker container" / "Docker session" → "Incus container" / "sandbox"
   - Docker image references (`the-companion:latest`, `stangirard/the-companion:preview-*`) → remove or replace with Incus image info
   - Docker preview builds section in `installation.md` → remove the Docker image rows, keep only the npm `next` channel

- [ ] **Step 1: Migrate `installation.md`**

Copy from `docs/get-started/installation.mdx`, apply branding rules, convert components. Remove the Docker preview image rows from the preview builds table (this fork does not publish Docker images — keep only the npm `next` channel). Replace Docker environment references with Incus sandbox references. Update `/guides/docker-and-environments` link to `/guides/incus-environments`.

Also migrate the "Subscription and authentication" content from `docs/index.mdx` (lines 22-28) into this page — it explains that Companion Incus requires a Claude Code or Codex CLI subscription but has no account system of its own. This info fits naturally in the installation prerequisites section.

- [ ] **Step 2: Migrate `sessions-and-permissions.md`**

Copy from `docs/guides/sessions-and-permissions.mdx`, apply rules. Has `<Warning>` and `<Note>` components and screenshot references. This page has significant Docker-specific content that must be rewritten:
- "If a Docker environment is configured, the session runs inside a container" → "If a sandbox is configured, the session runs inside an Incus container"
- "Archiving a Docker session removes the container and its volume" → update for Incus cleanup behavior (`incus delete --force`)
- "Docker sessions: the container persists across server restarts" → update for Incus persistence
- Update `/guides/docker-and-environments` link to `/guides/incus-environments`
- Replace `CLAUDE_CODE_OAUTH_TOKEN` Docker note with Incus auth seeding note

- [ ] **Step 3: Migrate `git-worktrees.md`**

Copy from `docs/guides/git-worktrees.mdx`, apply rules. Has a `<Note>` about worktrees not being used with Docker — update to say worktrees are not needed with Incus containers since containers provide isolation.

- [ ] **Step 4: Migrate `agents.md`**

Copy from `docs/guides/agents.mdx`, apply rules. Has `<Warning>` component. Update webhook URL example from `your-companion:3456` to current hostname pattern.

- [ ] **Step 5: Migrate `chat-webhooks.md`**

Copy from `docs/guides/chat-webhooks.mdx`, apply rules. Has `<Warning>` and `<Note>` components. Verify relay setup instructions still apply — these are server-level features not container-specific, so mostly branding changes.

- [ ] **Step 6: Migrate `saved-prompts.md`**

Copy from `docs/guides/saved-prompts.mdx`, apply rules. No Mintlify components — pure markdown with branding updates.

- [ ] **Step 7: Migrate `linear-integration.md`**

Copy from `docs/guides/linear-integration.mdx`, apply rules. Pure markdown, branding updates only.

- [ ] **Step 8: Migrate `cli-and-api.md`**

Copy from `docs/reference/cli-and-api.mdx`, apply rules. Update all `the-companion` command references to `companion-incus`. Update environment variable names if any changed.

- [ ] **Step 9: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds with zero dead link warnings

- [ ] **Step 10: Run content verification greps**

```bash
grep -ri "the.companion" site/ --include='*.md' | grep -v "Based on"
grep -ri "thevibecompany" site/ --include='*.md'
grep -ri "thecompanion\.sh" site/ --include='*.md'
grep -ri "bunx the-companion" site/ --include='*.md'
```

Expected: All return zero results

- [ ] **Step 11: Commit**

```bash
git add site/get-started/ site/guides/ site/reference/cli-and-api.md
git commit -m "feat(site): migrate 8 light-edit doc pages with rebranding"
```

---

### Task 5: Rewrite `incus-environments.md` (heavy)

This is a full rewrite of the Docker-focused `docker-and-environments.mdx`. The new page documents the Incus container system as implemented in the codebase.

**Files:**
- Create: `site/guides/incus-environments.md`

**Source material:**
- Old docs: `docs/guides/docker-and-environments.mdx` (for structure/flow reference)
- Implementation: `web/server/incus-manager.ts`, `web/server/sandbox-manager.ts`, `web/server/env-manager.ts`, `web/server/image-provision-manager.ts`, `web/incus/provision-companion.sh`

**Content outline for the new page:**

1. **Overview** — Companion Incus runs agent sessions inside Incus containers for full workspace isolation
2. **Sandboxes** — Create/manage sandbox profiles (`~/.companion/sandboxes/`), init scripts, how they map to containers
3. **Container Lifecycle** — `incus launch` → workspace copy → auth seeding → CLI spawn → cleanup. Container naming: `companion-{sessionId}`
4. **Incus Images** — Default `companion-incus` image (Ubuntu 24.04), what's included (Node.js 22, Bun, Go, Rust, Python, Claude Code CLI, Codex CLI, GitHub CLI, code-server), how to rebuild, custom provision scripts (`~/.companion/incus/provision-companion.sh`)
5. **Workspace Mounting** — tar-pipe copy from host to `/workspace`, shift mapping for UID 1000
6. **Auth & Git Setup** — `.claude`, `.codex`, `.gitconfig` mounted read-only, credentials seeded, GitHub CLI login, SSH-to-HTTPS remote rewriting
7. **Init Scripts** — Run before CLI session, 120s timeout (configurable via `COMPANION_INIT_SCRIPT_TIMEOUT`)
8. **Port Forwarding** — Proxy devices for container ports, dynamic host port allocation
9. **Environment Variables** — `~/.companion/envs/` profiles, injected at session launch
10. **Configuration** — `COMPANION_INCUS_PROFILES`, `COMPANION_INCUS_BRIDGE`, `COMPANION_CONTAINER_SDK_HOST`
11. **REST API** — Sandbox and environment CRUD endpoints

- [ ] **Step 1: Write `site/guides/incus-environments.md`**

Write the full page following the outline above. Use `::: info`, `::: tip`, `::: warning` containers where appropriate. Reference actual Incus commands and config paths from the codebase.

- [ ] **Step 2: Verify no Docker references**

Run: `grep -ri "docker" site/guides/incus-environments.md`
Expected: Zero hits

- [ ] **Step 3: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add site/guides/incus-environments.md
git commit -m "feat(site): add Incus environments guide (full rewrite from Docker)"
```

---

### Task 6: Rewrite `cloud-vm.md` (medium)

Update the deployment guide from Docker-based to Incus-based. The structure stays similar but prerequisites and provisioning steps change.

**Files:**
- Create: `site/deploy/cloud-vm.md`

**Source material:**
- Old docs: `docs/deploy/cloud-vm.mdx` (369 lines, GCP + Docker + Tailscale)
- Implementation: `web/incus/provision-companion.sh`

**Key changes from original:**
- Replace Docker installation with Incus installation (`sudo apt install incus`)
- Replace Docker image pull/build with Incus image build
- Update provision script references
- Update systemd service to use `companion-incus` package
- Keep Tailscale and GCP sections mostly intact (network setup is the same)
- Update troubleshooting for Incus-specific issues

- [ ] **Step 1: Write `site/deploy/cloud-vm.md`**

Migrate the page, replacing all Docker references with Incus equivalents. Keep the GCP VM creation, Cloud NAT, IAP, and Tailscale sections. Update the provision script section to install Incus instead of Docker.

- [ ] **Step 2: Verify no Docker references**

Run: `grep -ri "docker" site/deploy/cloud-vm.md`
Expected: Zero hits

- [ ] **Step 3: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add site/deploy/cloud-vm.md
git commit -m "feat(site): update cloud VM deploy guide for Incus"
```

---

### Task 7: Rewrite `troubleshooting.md` (medium)

Replace Docker troubleshooting sections with Incus equivalents.

**Files:**
- Create: `site/reference/troubleshooting.md`

**Source material:**
- Old docs: `docs/reference/troubleshooting.mdx`
- Implementation: `web/server/incus-manager.ts` (error handling, container states)

**Key changes:**
- "Docker not detected" → "Incus not available" (`incus version` check)
- "Docker image pull failures" → "Incus image not found" (image build/provision)
- Container troubleshooting: `incus list`, `incus exec ... -- bash`, `incus info`
- Keep non-Docker sections as-is (CLI not found, port in use, auth errors, WebSocket issues, Linear failures, session recovery, protocol recordings)

- [ ] **Step 1: Write `site/reference/troubleshooting.md`**

Migrate the page, replacing Docker troubleshooting with Incus equivalents. Apply branding rules to all remaining content.

- [ ] **Step 2: Verify no Docker references**

Run: `grep -ri "docker" site/reference/troubleshooting.md`
Expected: Zero hits

- [ ] **Step 3: Verify the build**

Run: `cd site && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add site/reference/troubleshooting.md
git commit -m "feat(site): update troubleshooting guide for Incus"
```

---

### Task 8: Full verification pass

**Files:** None created — verification only

- [ ] **Step 1: Build the full site**

Run: `cd site && bun run build`
Expected: Build succeeds with zero errors, zero dead link warnings

- [ ] **Step 2: Run all content verification greps**

```bash
# From repo root
grep -ri "the.companion" site/ --include='*.md' --include='*.vue' --include='*.ts' | grep -v "Based on"
grep -ri "thevibecompany" site/ --include='*.md' --include='*.vue' --include='*.ts' | grep -v "Based on\|Vibe Company"
grep -ri "docker" site/ --include='*.md'
grep -ri "thecompanion\.sh" site/
grep -ri "bunx the-companion" site/
grep -ri "stangirard" site/
```

Expected: All return zero results

- [ ] **Step 3: Preview and verify**

Run: `cd site && bun run preview`
Manually check:
- Home page hero gradient (light + dark mode)
- All 12 sidebar links resolve
- Screenshots load
- Search works (type a keyword)
- Mobile layout (resize browser)
- Footer attribution visible

- [ ] **Step 4: Commit any fixes**

If verification found issues, fix them and commit:
```bash
git add site/
git commit -m "fix(site): address verification issues"
```

---

### Task 9: GitHub Pages deployment workflow

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/pages.yml`**

```yaml
name: Deploy Site

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install site dependencies
        working-directory: site
        run: bun install

      - name: Build site
        working-directory: site
        run: bun run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Add site build job to `.github/workflows/ci.yml`**

Add a new `site` job after the existing `platform` job:

```yaml
  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install site dependencies
        working-directory: site
        run: bun install

      - name: Build site
        working-directory: site
        run: bun run build
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml .github/workflows/ci.yml
git commit -m "ci: add GitHub Pages deploy workflow and site build to CI"
```

---

### Task 10: Cleanup old sites

**Files:**
- Move: `docs/superpowers/` → `superpowers/`
- Delete: `docs/docs.json`, `docs/index.mdx`, `docs/get-started/`, `docs/guides/`, `docs/deploy/`, `docs/reference/`, `docs/images/`, `docs/screenshots/`
- Delete: `landing/` (entire directory)
- Delete: `scripts/landing-start.sh`
- Modify: `CLAUDE.md` (remove Mintlify and landing page references)

- [ ] **Step 1: Move `docs/superpowers/` to repo root**

```bash
mv docs/superpowers superpowers
```

- [ ] **Step 2: Delete Mintlify docs content**

```bash
rm docs/docs.json docs/index.mdx
rm -rf docs/get-started docs/guides docs/deploy docs/reference docs/images docs/screenshots
```

If `docs/` is now empty, remove it:
```bash
rmdir docs 2>/dev/null || true
```

- [ ] **Step 3: Delete landing page**

```bash
rm -rf landing
```

- [ ] **Step 4: Delete landing start script**

```bash
rm scripts/landing-start.sh
```

- [ ] **Step 5: Update CLAUDE.md**

Remove or update these sections:
- The landing page section (`# Landing page...` / `./scripts/landing-start.sh` references)
- Any Mintlify documentation references
- Update the "Browser Exploration" section if it references landing page

Update `docs/superpowers/` path references to `superpowers/` throughout CLAUDE.md.

- [ ] **Step 6: Verify nothing is broken**

```bash
cd web && bun run typecheck && bun run test
cd ../site && bun run build
```

Expected: All pass — the web app has no dependency on `docs/` or `landing/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Mintlify docs and React landing page

Old docs and landing page replaced by VitePress site in site/.
Internal specs moved to superpowers/ at repo root."
```
