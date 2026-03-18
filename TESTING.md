# Local Testing Instructions

## Prerequisites

- [Bun](https://bun.sh) installed
- [Incus](https://linuxcontainers.org/incus/docs/main/installing/) installed and running (`incus version` should work)

## 1. Install dependencies

```bash
cd web && bun install
```

## 2. Typecheck

```bash
cd web && bun run typecheck
```

This will surface any type errors from the migration. Fix anything that comes up.

## 3. Run tests

```bash
cd web && bun run test
```

The incus-manager and image-provision-manager tests should pass (they mock `execSync`). Some existing tests may need adjustments if mocks don't line up perfectly.

## 4. Build the container image (first time, ~10-20 min)

```bash
cd web && bun bin/cli.ts rebuild-image
```

This launches a temp Ubuntu 24.04 Incus container, runs the provision script, and publishes it as the `companion-incus` image. You can watch progress in real-time.

Verify it exists:

```bash
incus image list | grep companion-incus
```

## 5. Start the dev server

```bash
cd web && bun run dev
```

Opens Hono on `:3457` and Vite on `:5174`. Open http://localhost:5174.

## 6. Create a session and verify container launch

- Click "New Session" in the UI
- Enable sandbox/container mode
- Watch the terminal — you should see `[incus-manager] Created container companion-XXXXXXXX`
- Verify the container exists: `incus list | grep companion`

## 7. Key things to validate manually

```bash
# Container is running with correct devices
incus config device show companion-XXXXXXXX

# Workspace mounted
incus exec companion-XXXXXXXX -- ls /workspace

# Auth seeded
incus exec companion-XXXXXXXX -- ls /home/code/.claude/

# Port forwarding works (check proxy devices)
incus config device show companion-XXXXXXXX | grep proxy

# Host address discovery
incus exec companion-XXXXXXXX -- ip route show default
```

## 8. Test the provision script API

```bash
# Get current script
curl http://localhost:3457/api/incus/provision-script

# List Incus profiles
curl http://localhost:3457/api/incus/profiles

# Container status
curl http://localhost:3457/api/containers/status
```

## 9. If something breaks

- **Typecheck fails**: Likely a missed import or type rename — grep for the error symbol
- **Tests fail on mock mismatches**: Check that `vi.mock()` paths match the new file names (`incus-manager.js`, `image-provision-manager.js`)
- **Container creation fails**: Run `incus launch images:ubuntu/24.04 test --profile default` to verify Incus basics work
- **Host address fails**: Set `COMPANION_INCUS_BRIDGE=incusbr0` (or `lxdbr0` if migrated from LXD)
- **Port forwarding fails**: Check `incus config device list <name>` for proxy devices

## 10. GitHub repo setup (if not done yet)

```bash
gh auth login
gh repo create bketelsen/companion-incus --public --description "Incus-powered fork of The Companion — web UI for Claude Code & Codex"
git remote set-url origin https://github.com/bketelsen/companion-incus.git
git remote add upstream https://github.com/The-Vibe-Company/companion.git
git push -u origin main
```
