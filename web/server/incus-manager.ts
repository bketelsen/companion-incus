import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncusContainerConfig {
  /** Incus image alias (e.g. "companion-incus") */
  image: string;
  /** Container ports to expose via proxy devices */
  ports: number[];
  /** Extra env vars to inject into the container */
  env?: Record<string, string>;
  /** Enable security.nesting=true (replaces Docker --privileged) */
  nesting?: boolean;
  /** Incus profiles (e.g. ["default", "fast-storage"]) */
  profiles?: string[];
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
}

export interface IncusContainerInfo {
  /** Incus container name IS the identifier (no hex IDs) */
  name: string;
  image: string;
  portMappings: PortMapping[];
  hostCwd: string;
  /** Always "/workspace" */
  containerCwd: string;
  /** Host temp dir mounted at /workspace, cleaned up on removal */
  hostWorkspaceDir: string;
  /** Resolved at creation, e.g. "/home/code" */
  homeDir: string;
  /** Resolved at creation */
  user: {
    uid: number;
    gid: number;
    name: string;
  };
  state: "creating" | "running" | "stopped" | "removed";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXEC_OPTS: ExecSyncOptionsWithStringEncoding = {
  encoding: "utf-8",
  timeout: 30_000,
};
const QUICK_EXEC_TIMEOUT_MS = 8_000;
const STANDARD_EXEC_TIMEOUT_MS = 30_000;
const CONTAINER_BOOT_TIMEOUT_MS = 60_000; // Incus system containers need more time
const WORKSPACE_COPY_TIMEOUT_MS = 15 * 60_000; // 15 min for large repos
const SYSTEMD_READY_TIMEOUT_MS = 30_000;
const SYSTEMD_POLL_INTERVAL_MS = 500;
const PORT_RETRY_MAX = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd: string, opts?: ExecSyncOptionsWithStringEncoding): string {
  return execSync(cmd, { ...EXEC_OPTS, ...opts }).trim();
}

/** Shell-escape a string for safe inclusion in a shell command. */
export function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9._\-/:=@]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Validate that a name conforms to Incus naming rules: starts with letter, alphanumeric + hyphens. */
export function validateContainerName(name: string): void {
  if (!name || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
    throw new Error(
      `Invalid Incus container name: "${name.slice(0, 40)}". ` +
      `Must start with a letter and contain only letters, digits, and hyphens.`,
    );
  }
}

/**
 * Find a free TCP port by binding to port 0 and reading the assigned port.
 * Returns the port number.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "0.0.0.0", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine free port")));
      }
    });
    server.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// IncusManager
// ---------------------------------------------------------------------------

export class IncusManager {
  private containers = new Map<string, IncusContainerInfo>();
  private hostAddress: string | null = null;

  // ─── Availability ────────────────────────────────────────────────────────

  /** Check whether Incus daemon is reachable. */
  checkIncus(): boolean {
    try {
      exec("incus version", {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Return Incus version string, or null if unavailable. */
  getIncusVersion(): string | null {
    try {
      return exec("incus version", {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });
    } catch {
      return null;
    }
  }

  // ─── Image Management ────────────────────────────────────────────────────

  /** Check if an image alias exists locally. */
  imageExists(alias: string): boolean {
    try {
      exec(`incus image info ${shellEscape(alias)}`, {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** List local image aliases. */
  listImages(): string[] {
    try {
      const raw = exec("incus image list --format json", {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });
      if (!raw) return [];
      const images = JSON.parse(raw) as Array<{ aliases?: Array<{ name: string }> }>;
      const aliases: string[] = [];
      for (const img of images) {
        if (img.aliases) {
          for (const a of img.aliases) {
            aliases.push(a.name);
          }
        }
      }
      return aliases.sort();
    } catch {
      return [];
    }
  }

  /**
   * Build an Incus image from the provision script.
   * Flow: launch temp container → push + run provision script → publish as alias → cleanup.
   */
  async buildImage(
    alias: string,
    onProgress?: (line: string) => void,
  ): Promise<{ success: boolean; log: string }> {
    const buildName = `${alias}-build`;
    const lines: string[] = [];
    const report = (msg: string) => {
      lines.push(msg);
      onProgress?.(msg);
    };

    try {
      // 1. Launch temp container from base image
      report("Launching build container from images:ubuntu/24.04...");
      exec(`incus launch images:ubuntu/24.04 ${shellEscape(buildName)}`, {
        encoding: "utf-8",
        timeout: CONTAINER_BOOT_TIMEOUT_MS,
      });

      // 2. Wait for network readiness (ubuntu/24.04 has no cloud-init)
      report("Waiting for network...");
      const networkDeadline = Date.now() + 30_000;
      while (Date.now() < networkDeadline) {
        try {
          exec(`incus exec ${shellEscape(buildName)} -- getent hosts archive.ubuntu.com`, {
            encoding: "utf-8",
            timeout: 5_000,
          });
          break;
        } catch {
          await new Promise(r => setTimeout(r, 1_000));
        }
      }

      // 3. Resolve provision script path
      const homedir = process.env.HOME || "/root";
      const userScript = join(homedir, ".companion/incus/provision-companion.sh");
      const packageRoot = process.env.__COMPANION_PACKAGE_ROOT || join(import.meta.dir, "..");
      const bundledScript = join(packageRoot, "incus/provision-companion.sh");

      let scriptPath: string;
      if (existsSync(userScript)) {
        scriptPath = userScript;
      } else if (existsSync(bundledScript)) {
        scriptPath = bundledScript;
      } else {
        throw new Error(
          `Provision script not found. Expected at ${userScript} or ${bundledScript}`,
        );
      }

      // 4. Push and execute provisioning script
      report(`Pushing provision script from ${scriptPath}...`);
      exec(
        `incus file push ${shellEscape(scriptPath)} ${shellEscape(buildName)}/tmp/provision-companion.sh`,
        { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
      );

      report("Running provision script (this may take 10-20 minutes)...");
      const proc = Bun.spawn(
        ["incus", "exec", buildName, "--", "bash", "/tmp/provision-companion.sh"],
        { stdout: "pipe", stderr: "pipe" },
      );

      // Stream output
      const readStream = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            for (const line of parts) {
              if (line.trim()) report(line);
            }
          }
          if (buffer.trim()) report(buffer);
        } finally {
          reader.releaseLock();
        }
      };

      await Promise.all([readStream(proc.stdout), readStream(proc.stderr)]);
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(`Provision script exited with code ${exitCode}`);
      }

      // 5. Cleanup inside container
      report("Cleaning up build artifacts...");
      try {
        exec(`incus exec ${shellEscape(buildName)} -- bash -c 'apt-get clean && rm -rf /tmp/*'`, {
          encoding: "utf-8",
          timeout: STANDARD_EXEC_TIMEOUT_MS,
        });
      } catch { /* best-effort */ }

      // 6. Stop and publish as reusable image
      report("Stopping build container...");
      exec(`incus stop ${shellEscape(buildName)}`, {
        encoding: "utf-8",
        timeout: STANDARD_EXEC_TIMEOUT_MS,
      });

      // Delete existing image alias if it exists
      try {
        exec(`incus image delete ${shellEscape(alias)}`, {
          encoding: "utf-8",
          timeout: QUICK_EXEC_TIMEOUT_MS,
        });
      } catch { /* may not exist */ }

      report("Publishing image...");
      exec(`incus publish ${shellEscape(buildName)} --alias ${shellEscape(alias)}`, {
        encoding: "utf-8",
        timeout: 120_000,
      });

      // 7. Delete temp container
      exec(`incus delete ${shellEscape(buildName)}`, {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });

      report(`Image "${alias}" built successfully.`);
      console.log(`[incus-manager] Built image ${alias}`);
      return { success: true, log: lines.join("\n") };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report(`Build failed: ${msg}`);
      // Cleanup temp container on failure
      try { exec(`incus delete --force ${shellEscape(buildName)}`); } catch { /* ignore */ }
      return { success: false, log: lines.join("\n") };
    }
  }

  // ─── Container Creation ──────────────────────────────────────────────────

  /**
   * Create and start a container for a session.
   *
   * Flow:
   * 1. Resolve profiles
   * 2. Pre-allocate host ports via findFreePort()
   * 3. Launch container from image with profiles
   * 4. Resolve unprivileged user (UID 1000)
   * 5. Add disk devices (workspace, auth mounts)
   * 6. Add proxy devices (port forwarding)
   * 7. Wait for systemd readiness
   * 8. Seed auth files
   */
  async createContainer(
    sessionId: string,
    hostCwd: string,
    config: IncusContainerConfig,
  ): Promise<IncusContainerInfo> {
    const name = `companion-${sessionId.slice(0, 8)}`;
    validateContainerName(name);

    const homedir = process.env.HOME || process.env.USERPROFILE || "/root";

    // Validate port numbers
    for (const port of config.ports) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port number: ${port} (must be 1-65535)`);
      }
    }

    // Resolve profiles
    const profiles = config.profiles
      ?? process.env.COMPANION_INCUS_PROFILES?.split(",").map(s => s.trim()).filter(Boolean)
      ?? ["default"];

    // Pre-allocate host ports
    const portAllocations: { containerPort: number; hostPort: number }[] = [];
    for (const port of config.ports) {
      const hostPort = await findFreePort();
      portAllocations.push({ containerPort: port, hostPort });
    }

    // Create host workspace temp dir
    const hostWorkspaceDir = `/tmp/companion-ws-${sessionId.slice(0, 8)}`;
    mkdirSync(hostWorkspaceDir, { recursive: true });

    const info: IncusContainerInfo = {
      name,
      image: config.image,
      portMappings: [],
      hostCwd,
      containerCwd: "/workspace",
      hostWorkspaceDir,
      homeDir: "/home/code", // default, resolved after launch
      user: { uid: 1000, gid: 1000, name: "code" }, // default, resolved after launch
      state: "creating",
    };

    try {
      // 1. Launch container
      const profileArgs = profiles.map(p => `--profile ${shellEscape(p)}`).join(" ");
      const nestingArg = config.nesting ? "-c security.nesting=true" : "";
      exec(
        `incus launch ${shellEscape(config.image)} ${shellEscape(name)} ${profileArgs} ${nestingArg}`.trim(),
        { encoding: "utf-8", timeout: CONTAINER_BOOT_TIMEOUT_MS },
      );

      // 2. Resolve container user (UID 1000)
      try {
        const passwdLine = exec(
          `incus exec ${shellEscape(name)} -- getent passwd 1000`,
          { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
        );
        // Format: name:x:uid:gid:gecos:home:shell
        const parts = passwdLine.split(":");
        if (parts.length >= 6) {
          info.user = {
            name: parts[0],
            uid: parseInt(parts[2], 10),
            gid: parseInt(parts[3], 10),
          };
          info.homeDir = parts[5];
        }
      } catch {
        console.warn(`[incus-manager] Could not resolve UID 1000 in ${name}, using defaults`);
      }

      // 3. Add disk devices
      // Workspace
      exec(
        `incus config device add ${shellEscape(name)} workspace disk ` +
        `source=${shellEscape(hostWorkspaceDir)} path=/workspace shift=true`,
        { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
      );

      // Claude auth mount (read-only)
      const claudeDir = join(homedir, ".claude");
      if (existsSync(claudeDir)) {
        exec(
          `incus config device add ${shellEscape(name)} claude-auth disk ` +
          `source=${shellEscape(claudeDir)} path=/companion-host-claude readonly=true shift=true`,
          { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
        );
      }

      // Codex auth mount (read-only, if exists)
      const codexDir = join(homedir, ".codex");
      if (existsSync(codexDir)) {
        exec(
          `incus config device add ${shellEscape(name)} codex-auth disk ` +
          `source=${shellEscape(codexDir)} path=/companion-host-codex readonly=true shift=true`,
          { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
        );
      }

      // Git config mount (read-only, if exists)
      const gitconfigPath = join(homedir, ".gitconfig");
      if (existsSync(gitconfigPath)) {
        exec(
          `incus config device add ${shellEscape(name)} gitconfig disk ` +
          `source=${shellEscape(gitconfigPath)} path=/companion-host-gitconfig readonly=true shift=true`,
          { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
        );
      }

      // 4. Add proxy devices for port forwarding (with retry on EADDRINUSE)
      const resolvedMappings: PortMapping[] = [];
      for (const alloc of portAllocations) {
        let success = false;
        let lastError: Error | null = null;
        let hostPort = alloc.hostPort;

        for (let attempt = 0; attempt < PORT_RETRY_MAX; attempt++) {
          try {
            const deviceName = `port-${alloc.containerPort}`;
            exec(
              `incus config device add ${shellEscape(name)} ${deviceName} proxy ` +
              `listen=tcp:0.0.0.0:${hostPort} connect=tcp:127.0.0.1:${alloc.containerPort}`,
              { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
            );
            resolvedMappings.push({ containerPort: alloc.containerPort, hostPort });
            success = true;
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            // Re-allocate port and retry
            hostPort = await findFreePort();
          }
        }
        if (!success) {
          throw new Error(
            `Failed to add proxy device for port ${alloc.containerPort} after ${PORT_RETRY_MAX} attempts: ` +
            `${lastError?.message}`,
          );
        }
      }
      info.portMappings = resolvedMappings;

      // 5. Wait for systemd readiness
      await this.waitForSystemd(name);

      info.state = "running";

      // 6. Seed auth files
      this.seedAuthFiles(name);
      this.seedCodexFiles(name);
      this.seedGitAuth(name);

      this.containers.set(sessionId, info);
      console.log(
        `[incus-manager] Created container ${name} ` +
        `ports: ${info.portMappings.map(p => `${p.containerPort}->${p.hostPort}`).join(", ")}`,
      );

      return info;
    } catch (e) {
      // Cleanup on failure
      try { exec(`incus delete --force ${shellEscape(name)}`); } catch { /* ignore */ }
      try { rmSync(hostWorkspaceDir, { recursive: true, force: true }); } catch { /* ignore */ }
      info.state = "removed";
      throw new Error(
        `Failed to create container: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Poll systemd inside the container until it reports running or degraded. */
  private async waitForSystemd(name: string): Promise<void> {
    const deadline = Date.now() + SYSTEMD_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const status = exec(
          `incus exec ${shellEscape(name)} -- systemctl is-system-running`,
          { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
        );
        if (status === "running" || status === "degraded") {
          return;
        }
      } catch {
        // systemctl may fail while system is still initializing
      }
      await new Promise(resolve => setTimeout(resolve, SYSTEMD_POLL_INTERVAL_MS));
    }
    console.warn(`[incus-manager] systemd readiness timeout for ${name}, proceeding anyway`);
  }

  // ─── Auth Seeding ────────────────────────────────────────────────────────

  /**
   * Copy Claude auth & config files from the read-only mount into the user's home dir.
   * Called after both initial create and restart.
   */
  private seedAuthFiles(name: string): void {
    const info = this.getContainerByName(name);
    const homeDir = info?.homeDir || "/home/code";
    try {
      this.execInContainer(name, [
        "sh", "-lc",
        [
          `mkdir -p ${homeDir}/.claude`,
          `for f in .credentials.json auth.json .auth.json credentials.json; do ` +
            `[ -f /companion-host-claude/$f ] && cp /companion-host-claude/$f ${homeDir}/.claude/$f 2>/dev/null; done`,
          `for f in settings.json settings.local.json; do ` +
            `[ -f /companion-host-claude/$f ] && cp /companion-host-claude/$f ${homeDir}/.claude/$f 2>/dev/null; done`,
          `[ -d /companion-host-claude/skills ] && cp -r /companion-host-claude/skills ${homeDir}/.claude/skills 2>/dev/null`,
          "true",
        ].join("; "),
      ]);
    } catch { /* best-effort */ }
  }

  /**
   * Copy Codex auth & config files from the read-only mount into the user's home dir.
   */
  private seedCodexFiles(name: string): void {
    const info = this.getContainerByName(name);
    const homeDir = info?.homeDir || "/home/code";
    try {
      this.execInContainer(name, [
        "sh", "-lc",
        [
          "[ -d /companion-host-codex ] || exit 0",
          `mkdir -p ${homeDir}/.codex`,
          `for f in auth.json config.toml models_cache.json version.json; do ` +
            `[ -f /companion-host-codex/$f ] && cp /companion-host-codex/$f ${homeDir}/.codex/$f 2>/dev/null; done`,
          `for d in skills vendor_imports prompts rules; do ` +
            `[ -d /companion-host-codex/$d ] && cp -r /companion-host-codex/$d ${homeDir}/.codex/$d 2>/dev/null; done`,
          "true",
        ].join("; "),
      ]);
    } catch { /* best-effort */ }
  }

  /**
   * Seed git authentication inside the container.
   * - Extracts GitHub CLI token from host keyring and logs in inside container
   * - Sets up gh as git credential helper
   * - Disables GPG signing
   * - Rewrites SSH remotes to HTTPS
   */
  private seedGitAuth(name: string): void {
    let token = "";
    try {
      token = exec("gh auth token 2>/dev/null", {
        encoding: "utf-8",
        timeout: QUICK_EXEC_TIMEOUT_MS,
      });
    } catch { /* best-effort */ }

    if (token) {
      try {
        this.execInContainer(name, [
          "sh", "-lc",
          `printf '%s\n' ${shellEscape(token)} | gh auth login --with-token 2>/dev/null; true`,
        ]);
      } catch { /* best-effort */ }
    }

    try {
      this.execInContainer(name, [
        "sh", "-lc",
        "gh auth setup-git 2>/dev/null; true",
      ]);
    } catch { /* best-effort */ }

    try {
      this.execInContainer(name, [
        "sh", "-lc",
        [
          "if [ -f /companion-host-gitconfig ]; then " +
            "NAME=$(git config -f /companion-host-gitconfig user.name 2>/dev/null); " +
            "EMAIL=$(git config -f /companion-host-gitconfig user.email 2>/dev/null); " +
            '[ -n "$NAME" ] && git config --global user.name "$NAME"; ' +
            '[ -n "$EMAIL" ] && git config --global user.email "$EMAIL"; ' +
          "fi",
          "git config --global commit.gpgsign false 2>/dev/null",
          "git config --global safe.directory /workspace 2>/dev/null",
          "cd /workspace 2>/dev/null && " +
            "git remote -v 2>/dev/null | grep 'git@github.com:' | awk '{print $1}' | sort -u | " +
            "while read remote; do " +
              'url=$(git remote get-url "$remote" 2>/dev/null); ' +
              'https_url=$(echo "$url" | sed \'s|git@github.com:|https://github.com/|\'); ' +
              'git remote set-url "$remote" "$https_url" 2>/dev/null; ' +
            "done",
          "true",
        ].join("; "),
      ]);
    } catch { /* best-effort */ }
  }

  /** Re-seed git auth (public API for post-workspace-copy). */
  reseedGitAuth(name: string): void {
    this.seedGitAuth(name);
  }

  // ─── Exec ────────────────────────────────────────────────────────────────

  /**
   * Execute a command inside a running container as the unprivileged user.
   * Returns stdout. Throws on failure.
   */
  execInContainer(name: string, cmd: string[], timeout = STANDARD_EXEC_TIMEOUT_MS): string {
    validateContainerName(name);
    const info = this.getContainerByName(name);
    const uid = info?.user.uid ?? 1000;
    const gid = info?.user.gid ?? 1000;
    const homeDir = info?.homeDir ?? "/home/code";

    const execArgs = [
      "incus", "exec",
      "--cwd", "/workspace",
      "--user", String(uid),
      "--group", String(gid),
      "--env", `HOME=${homeDir}`,
      name, "--",
      ...cmd,
    ];
    return exec(execArgs.map(shellEscape).join(" "), { encoding: "utf-8", timeout });
  }

  /**
   * Execute a command inside a running container asynchronously.
   * Uses Bun.spawn for longer-running operations.
   */
  async execInContainerAsync(
    name: string,
    cmd: string[],
    opts?: { timeout?: number; onOutput?: (line: string) => void },
  ): Promise<{ exitCode: number; output: string }> {
    validateContainerName(name);
    const timeout = opts?.timeout ?? 120_000;
    const info = this.getContainerByName(name);
    const uid = info?.user.uid ?? 1000;
    const gid = info?.user.gid ?? 1000;
    const homeDir = info?.homeDir ?? "/home/code";

    const execArgs = [
      "incus", "exec",
      "--cwd", "/workspace",
      "--user", String(uid),
      "--group", String(gid),
      "--env", `HOME=${homeDir}`,
      name, "--",
      ...cmd,
    ];

    const proc = Bun.spawn(execArgs, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const lines: string[] = [];
    const decoder = new TextDecoder();

    const stdoutReader = proc.stdout.getReader();
    let stdoutBuffer = "";
    const readStdout = (async () => {
      try {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          stdoutBuffer += decoder.decode(value, { stream: true });
          const parts = stdoutBuffer.split("\n");
          stdoutBuffer = parts.pop() || "";
          for (const line of parts) {
            lines.push(line);
            opts?.onOutput?.(line);
          }
        }
        if (stdoutBuffer.trim()) {
          lines.push(stdoutBuffer);
          opts?.onOutput?.(stdoutBuffer);
        }
      } finally {
        stdoutReader.releaseLock();
      }
    })();

    const stderrPromise = new Response(proc.stderr).text();

    const exitPromise = proc.exited;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const exitCode = await Promise.race([exitPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      await readStdout;
      const stderrText = await stderrPromise;
      if (stderrText.trim()) {
        for (const line of stderrText.split("\n")) {
          if (line.trim()) {
            lines.push(line);
            opts?.onOutput?.(line);
          }
        }
      }
      return { exitCode, output: lines.join("\n") };
    } catch (e) {
      clearTimeout(timeoutId);
      await readStdout.catch(() => {});
      throw e;
    }
  }

  /**
   * Build the exec command array for Bun.spawn.
   * Used by cli-launcher.ts to construct the command that spawns the CLI inside the container.
   */
  buildExecCommand(
    name: string,
    opts: {
      env?: Record<string, string>;
      interactive?: boolean;
      cmd: string[];
    },
  ): string[] {
    validateContainerName(name);
    const info = this.getContainerByName(name);
    const uid = info?.user.uid ?? 1000;
    const gid = info?.user.gid ?? 1000;
    const homeDir = info?.homeDir ?? "/home/code";

    const args: string[] = [
      "incus", "exec",
      "--cwd", "/workspace",
      "--user", String(uid),
      "--group", String(gid),
      "--env", `HOME=${homeDir}`,
    ];

    // Add extra env vars
    if (opts.env) {
      for (const [k, v] of Object.entries(opts.env)) {
        args.push("--env", `${k}=${v}`);
      }
    }

    args.push(name, "--", ...opts.cmd);
    return args;
  }

  /**
   * Check if a binary is available inside a running container.
   */
  hasBinaryInContainer(name: string, binary: string): boolean {
    validateContainerName(name);
    try {
      this.execInContainer(name, [
        "bash", "-lc", `which ${shellEscape(binary)}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Host Address ────────────────────────────────────────────────────────

  /**
   * Get the host's bridge IP for container→host connectivity.
   * Cached after first call. Bridge name configurable via COMPANION_INCUS_BRIDGE.
   */
  getHostAddress(): string {
    if (this.hostAddress) return this.hostAddress;

    const bridge = (process.env.COMPANION_INCUS_BRIDGE || "incusbr0").trim();
    try {
      const ip = exec(
        `ip -4 addr show ${shellEscape(bridge)} | grep -oP '(?<=inet )\\d+(\\.\\d+){3}'`,
        { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
      );
      this.hostAddress = ip;
      return ip;
    } catch {
      throw new Error(
        `Could not discover host address from bridge "${bridge}". ` +
        `Set COMPANION_INCUS_BRIDGE or COMPANION_CONTAINER_SDK_HOST.`,
      );
    }
  }

  // ─── Workspace Copy ──────────────────────────────────────────────────────

  /**
   * Copy host workspace files into a running container's /workspace.
   * Uses a tar stream piped into incus exec.
   */
  async copyWorkspaceToContainer(name: string, hostCwd: string): Promise<void> {
    validateContainerName(name);

    const cmd = [
      "set -o pipefail",
      `COPYFILE_DISABLE=1 tar -C ${shellEscape(hostCwd)} -cf - . | ` +
        `incus exec ${shellEscape(name)} -- tar -xf - -C /workspace`,
    ].join("; ");

    const proc = Bun.spawn(["bash", "-lc", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = new Promise<number>((resolve) => {
      setTimeout(() => resolve(-1), WORKSPACE_COPY_TIMEOUT_MS);
    });

    const stderrPromise = new Response(proc.stderr).text();
    const exitCode = await Promise.race([proc.exited, timeout]);

    if (exitCode === -1) {
      try { proc.kill(); } catch { /* best-effort */ }
      throw new Error(`workspace copy timed out after ${Math.floor(WORKSPACE_COPY_TIMEOUT_MS / 1000)}s`);
    }

    if (exitCode !== 0) {
      const stderrText = await stderrPromise;
      throw new Error(
        `workspace copy failed (exit ${exitCode}): ${stderrText.trim() || "unknown error"}`,
      );
    }
  }

  // ─── Git Operations ──────────────────────────────────────────────────────

  /**
   * Run git fetch/checkout/pull inside a running container at /workspace.
   */
  gitOpsInContainer(
    name: string,
    opts: {
      branch: string;
      currentBranch: string;
      createBranch?: boolean;
      defaultBranch?: string;
    },
  ): { fetchOk: boolean; checkoutOk: boolean; pullOk: boolean; errors: string[] } {
    const errors: string[] = [];
    const branch = shellEscape(opts.branch);

    let fetchOk = false;
    try {
      this.execInContainer(name, [
        "sh", "-lc", "cd /workspace && git fetch --prune",
      ]);
      fetchOk = true;
    } catch (e) {
      errors.push(`fetch: ${e instanceof Error ? e.message : String(e)}`);
    }

    let checkoutOk = true;
    if (opts.currentBranch !== opts.branch) {
      checkoutOk = false;
      try {
        this.execInContainer(name, [
          "sh", "-lc", `cd /workspace && git checkout ${branch}`,
        ]);
        checkoutOk = true;
      } catch {
        if (opts.createBranch) {
          const base = shellEscape(opts.defaultBranch || "main");
          try {
            this.execInContainer(name, [
              "sh", "-lc",
              `cd /workspace && git checkout -b ${branch} origin/${base} 2>/dev/null || git checkout -b ${branch} ${base}`,
            ]);
            checkoutOk = true;
          } catch (e2) {
            errors.push(`checkout-create: ${e2 instanceof Error ? e2.message : String(e2)}`);
          }
        } else {
          errors.push(`checkout: branch "${opts.branch}" does not exist`);
        }
      }
    }

    let pullOk = false;
    try {
      this.execInContainer(name, [
        "sh", "-lc", "cd /workspace && git pull",
      ]);
      pullOk = true;
    } catch (e) {
      errors.push(`pull: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { fetchOk, checkoutOk, pullOk, errors };
  }

  // ─── Container Lifecycle ─────────────────────────────────────────────────

  /** Start a stopped container. Re-seeds auth files. */
  startContainer(name: string): void {
    validateContainerName(name);
    exec(`incus start ${shellEscape(name)}`, {
      encoding: "utf-8",
      timeout: CONTAINER_BOOT_TIMEOUT_MS,
    });
    this.seedAuthFiles(name);
    this.seedCodexFiles(name);
    this.seedGitAuth(name);
  }

  /** Stop and remove a container. Cleans up host workspace dir. */
  removeContainer(sessionId: string): void {
    const info = this.containers.get(sessionId);
    if (!info) return;

    try {
      exec(`incus delete --force ${shellEscape(info.name)}`);
      info.state = "removed";
      console.log(`[incus-manager] Removed container ${info.name}`);
    } catch (e) {
      console.warn(
        `[incus-manager] Failed to remove container ${info.name}:`,
        e instanceof Error ? e.message : String(e),
      );
    }

    // Clean up host workspace directory
    if (info.hostWorkspaceDir) {
      try {
        rmSync(info.hostWorkspaceDir, { recursive: true, force: true });
        console.log(`[incus-manager] Removed workspace dir ${info.hostWorkspaceDir}`);
      } catch (e) {
        console.warn(
          `[incus-manager] Failed to remove workspace dir ${info.hostWorkspaceDir}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    this.containers.delete(sessionId);
  }

  /**
   * Check whether an Incus container exists and its running state.
   * Returns "running", "stopped", or "missing".
   */
  isContainerAlive(name: string): "running" | "stopped" | "missing" {
    validateContainerName(name);
    try {
      const raw = exec(
        `incus list ${shellEscape(name)} --format json`,
        { encoding: "utf-8", timeout: QUICK_EXEC_TIMEOUT_MS },
      );
      const containers = JSON.parse(raw) as Array<{ name: string; status: string }>;
      const container = containers.find(c => c.name === name);
      if (!container) return "missing";
      return container.status === "Running" ? "running" : "stopped";
    } catch {
      return "missing";
    }
  }

  // ─── Container Tracking ──────────────────────────────────────────────────

  /** Get container info for a session. */
  getContainer(sessionId: string): IncusContainerInfo | undefined {
    return this.containers.get(sessionId);
  }

  /** Get container info by Incus container name. */
  getContainerByName(name: string): IncusContainerInfo | undefined {
    for (const info of this.containers.values()) {
      if (info.name === name) return info;
    }
    return undefined;
  }

  /** List all tracked containers. */
  listContainers(): IncusContainerInfo[] {
    return Array.from(this.containers.values());
  }

  /**
   * Re-track a container under a new key (e.g. when the real sessionId
   * is assigned after container creation).
   */
  retrack(name: string, newSessionId: string): void {
    for (const [oldKey, info] of this.containers) {
      if (info.name === name) {
        this.containers.delete(oldKey);
        this.containers.set(newSessionId, info);
        return;
      }
    }
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /** Persist all tracked container info to disk. */
  persistState(filePath: string): void {
    try {
      const entries: { sessionId: string; info: IncusContainerInfo }[] = [];
      for (const [sessionId, info] of this.containers) {
        if (info.state !== "removed") {
          entries.push({ sessionId, info });
        }
      }
      writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf-8");
    } catch (e) {
      console.warn(
        "[incus-manager] Failed to persist state:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  /** Restore container tracking from disk, verifying each container still exists. */
  restoreState(filePath: string): number {
    if (!existsSync(filePath)) return 0;
    try {
      const raw = readFileSync(filePath, "utf-8");
      const entries: { sessionId: string; info: IncusContainerInfo }[] = JSON.parse(raw);
      let restored = 0;
      for (const { sessionId, info } of entries) {
        if (this.restoreContainer(sessionId, info)) {
          restored++;
        }
      }
      if (restored > 0) {
        console.log(`[incus-manager] Restored ${restored} container(s) from disk`);
      }
      return restored;
    } catch (e) {
      console.warn(
        "[incus-manager] Failed to restore state:",
        e instanceof Error ? e.message : String(e),
      );
      return 0;
    }
  }

  /**
   * Re-register a container that was persisted across a server restart.
   * Verifies the container still exists in Incus before tracking it.
   */
  restoreContainer(sessionId: string, info: IncusContainerInfo): boolean {
    try {
      const state = this.isContainerAlive(info.name);
      if (state === "missing") {
        console.warn(
          `[incus-manager] Container ${info.name} no longer exists, skipping restore`,
        );
        return false;
      }
      info.state = state === "running" ? "running" : "stopped";
      this.containers.set(sessionId, info);
      console.log(
        `[incus-manager] Restored container ${info.name} state=${info.state}`,
      );
      return true;
    } catch {
      console.warn(
        `[incus-manager] Container ${info.name} no longer exists, skipping restore`,
      );
      return false;
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  /** Clean up all tracked containers (e.g. on server shutdown). */
  cleanupAll(): void {
    for (const [sessionId] of this.containers) {
      this.removeContainer(sessionId);
    }
  }
}

// Singleton
export const incusManager = new IncusManager();
