# Combined Site Design: Companion Incus

**Date:** 2026-03-18
**Status:** Approved

## Summary

Combine the existing Mintlify docs site (`docs/`) and React landing page (`landing/`) into a single VitePress static site deployed to GitHub Pages. Rebrand from "The Companion" / "The Vibe Company" to "Companion Incus" with footer attribution to the original authors. All documentation content is migrated and rewritten to reflect the Incus fork (no stale Docker references).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Product name | Companion Incus | Matches npm package `companion-incus` |
| Static site generator | VitePress | Lightweight, first-class markdown, built-in search, GH Pages compatible |
| Visual approach | Gradient blend | Warm branded hero fading to clean docs — personality up top, utility below |
| Mascot | No | Dropped the ClawdLogo mascot |
| Attribution | Footer only | "Based on The Companion by The Vibe Company" in site footer |
| Content strategy | Migrate and fully rewrite | All 12 pages ported with content updated for Incus fork |
| Screenshot on home page | No | Simplified hero — install command and feature cards are sufficient |
| "Works With" badges | Dropped | Simplify the home page; compatibility is covered in docs |
| Model Routing feature card | Replaced by "Incus Containers" | Incus is the differentiating feature of this fork; model routing is still documented but not a headline feature |

## Site Architecture

### Directory Structure

```
site/                          # new top-level directory
├── .vitepress/
│   ├── config.ts              # VitePress config (nav, sidebar, theme)
│   └── theme/
│       ├── index.ts           # theme registration
│       ├── HomePage.vue       # custom landing component
│       └── style.css          # branded overrides (hero gradient, accent color)
├── index.md                   # home page (uses HomePage layout)
├── get-started/
│   └── installation.md
├── guides/
│   ├── sessions-and-permissions.md
│   ├── incus-environments.md  # rewritten from docker-and-environments
│   ├── git-worktrees.md
│   ├── agents.md
│   ├── chat-webhooks.md
│   ├── saved-prompts.md
│   └── linear-integration.md
├── deploy/
│   └── cloud-vm.md
├── reference/
│   ├── cli-and-api.md
│   └── troubleshooting.md
├── public/
│   ├── favicon.svg
│   └── screenshots/           # see Asset Inventory below
└── package.json
```

New `site/` directory keeps the transition clean. `docs/` and `landing/` are deleted after migration is verified.

### Internal Specs Relocation

`docs/superpowers/` (internal specs and plans) moves to the repo root as `superpowers/` before `docs/` is deleted. This directory is not part of the public site. Add `superpowers/` to `.gitignore` if it should not be tracked, or keep it tracked as internal documentation.

### Sidebar Configuration

```ts
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
}
```

### Nav Configuration

```ts
nav: [
  { text: 'Docs', link: '/get-started/installation' },
  { text: 'GitHub', link: 'https://github.com/bketelsen/companion-incus' },
  { text: 'npm', link: 'https://www.npmjs.com/package/companion-incus' },
]
```

### Package.json

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

### Asset Inventory

Migrate these assets into `site/public/`:

| Source | Destination | Notes |
|--------|-------------|-------|
| `docs/images/favicon.svg` | `public/favicon.svg` | Site favicon |
| `docs/screenshots/readme-landing.png` | `public/screenshots/readme-landing.png` | Referenced in docs |
| `docs/screenshots/readme-main-workspace.png` | `public/screenshots/readme-main-workspace.png` | Referenced in docs |
| `docs/screenshots/readme-permissions.png` | `public/screenshots/readme-permissions.png` | Referenced in docs |

Landing page assets (`landing/public/screenshot.png`, `landing/public/logos/`) are **not migrated** — the home page does not use a screenshot or partner logos.

## Home Page Design

Custom Vue component (`HomePage.vue`) using the gradient blend layout:

1. **Nav bar** — VitePress default nav with "Companion Incus" title (burnt orange), links: Docs, GitHub, npm
2. **Hero section** — warm beige gradient (`#f0e8d9` → white)
   - "Companion Incus" heading
   - Tagline: "Multi-agent web UI for Claude Code & Codex"
   - Install block: `bunx companion-incus`
   - Two CTAs: "Get Started" (filled burnt orange) + "GitHub" (outlined)
3. **Feature cards** — 2×3 grid on white, clean bordered cards
   - Multi-Agent Sessions, Incus Containers, MCP Native, Web Terminal, Environment Profiles, Secure Remote Ops
4. **How It Works** — text-based architecture diagram (Browser ↔ WS ↔ Server ↔ WS ↔ CLI)
5. **Footer** — "Based on The Companion by The Vibe Company" + GitHub, npm, MIT License links

### Styling

- Accent color: `#b74f2b` (burnt orange) mapped to VitePress `--vp-c-brand` tokens
- Hero gradient only — docs pages use VitePress default white/dark theme
- Dark mode: hero gradient inverts to a warm dark tone (e.g. `#2a1f15` → `var(--vp-c-bg)`) so it blends with VitePress dark mode background
- No custom fonts — VitePress system font stack for fast loading
- Use `withBase()` for all asset URLs in Vue components (e.g. `HomePage.vue`) so they work with the `/companion-incus/` base path

## Content Migration

### Global Rebranding

| Old | New |
|-----|-----|
| "The Companion" | "Companion Incus" |
| `the-companion` (package) | `companion-incus` |
| `bunx the-companion` | `bunx companion-incus` |
| `thevibecompany/the-companion` | `bketelsen/companion-incus` |
| `thevibecompany/companion` | `bketelsen/companion-incus` |
| `thecompanion.sh` (domain) | GitHub Pages URL |

### Page-by-Page Effort

| Page | Effort | Changes |
|------|--------|---------|
| `index.md` | New | Custom home page frontmatter |
| `installation.md` | Light | Package name, CLI commands |
| `sessions-and-permissions.md` | Light | Branding only |
| `incus-environments.md` | **Heavy** | Full rewrite — Incus container lifecycle, `incus launch`, image management, workspace mounting |
| `git-worktrees.md` | Light | Branding only |
| `agents.md` | Light | Branding only |
| `chat-webhooks.md` | Light | Branding, verify relay setup instructions still apply with Incus |
| `saved-prompts.md` | Light | Branding only |
| `linear-integration.md` | Light | Branding only |
| `cloud-vm.md` | **Medium** | Deployment updated for Incus, prereqs changed |
| `cli-and-api.md` | Light | Package/command names |
| `troubleshooting.md` | Medium | Docker troubleshooting replaced with Incus equivalents |

### Mintlify → VitePress Component Mapping

| Mintlify | VitePress |
|----------|-----------|
| `<Warning>` | `::: warning` |
| `<Tip>` | `::: tip` |
| `<Note>` | `::: info` |
| `<Card>` | Standard markdown links |
| `<img>` with Mintlify paths | `![alt](/screenshots/...)` |

## GitHub Pages Deployment

### Deploy Workflow

**File:** `.github/workflows/pages.yml`, triggered on push to `main`.

**Steps:**
1. Checkout repo
2. Setup Bun
3. `cd site && bun install && bun run build`
4. Upload `site/.vitepress/dist/` as artifact
5. Deploy via `actions/deploy-pages`

**Config:** `base: '/companion-incus/'` in VitePress config (for `bketelsen.github.io/companion-incus/`). Change to `'/'` if a custom domain is added later.

### CI Integration

Add a site build step to `.github/workflows/ci.yml` to catch broken links and build failures on PRs:

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

## Cleanup After Migration

Remove after the new site is verified:
- `docs/docs.json`, `docs/index.mdx`, `docs/get-started/`, `docs/guides/`, `docs/deploy/`, `docs/reference/`, `docs/images/`, `docs/screenshots/` (Mintlify site content)
- `landing/` directory (entire React landing page)
- `scripts/landing-start.sh`
- Mintlify references in CLAUDE.md

**Before deleting `docs/`:** move `docs/superpowers/` to repo root as `superpowers/`.

## Verification

**Build checks:**
- VitePress build succeeds with zero errors
- All internal links resolve (VitePress dead link detection)
- All screenshot/image assets exist in `public/`

**Content checks (run from repo root, exclude attribution):**
- `grep -ri "the.companion" site/ --include='*.md' --include='*.vue' --include='*.ts' | grep -v "Based on"` — zero hits
- `grep -ri "thevibecompany" site/ --include='*.md' --include='*.vue' --include='*.ts' | grep -v "Based on\|Vibe Company"` — zero hits
- `grep -ri "docker" site/ --include='*.md'` — zero hits
- `grep -ri "thecompanion\.sh" site/` — zero hits

**Manual checks:**
- `cd site && bun run dev` — preview locally
- Home page gradient renders correctly in both light and dark mode
- Dark mode toggle works across all pages
- Mobile responsive
- All sidebar links resolve
