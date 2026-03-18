import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { shellEscape, validateContainerName } from "./incus-manager.js";

// ---------------------------------------------------------------------------
// shellEscape
// ---------------------------------------------------------------------------

describe("shellEscape", () => {
  it("passes through safe strings unchanged", () => {
    expect(shellEscape("companion-abc123")).toBe("companion-abc123");
    expect(shellEscape("images:ubuntu/24.04")).toBe("images:ubuntu/24.04");
    expect(shellEscape("/tmp/workspace")).toBe("/tmp/workspace");
    expect(shellEscape("HOME=/home/code")).toBe("HOME=/home/code");
  });

  it("wraps strings with special characters in single quotes", () => {
    expect(shellEscape("hello world")).toBe("'hello world'");
    expect(shellEscape("foo;bar")).toBe("'foo;bar'");
    expect(shellEscape("$HOME")).toBe("'$HOME'");
  });

  it("escapes single quotes within strings", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it("handles empty strings", () => {
    expect(shellEscape("")).toBe("''");
  });
});

// ---------------------------------------------------------------------------
// validateContainerName
// ---------------------------------------------------------------------------

describe("validateContainerName", () => {
  it("accepts valid Incus container names", () => {
    expect(() => validateContainerName("companion-abc12345")).not.toThrow();
    expect(() => validateContainerName("mycontainer")).not.toThrow();
    expect(() => validateContainerName("Test123")).not.toThrow();
    expect(() => validateContainerName("a")).not.toThrow();
  });

  it("rejects names starting with a digit", () => {
    expect(() => validateContainerName("123abc")).toThrow(/Invalid Incus container name/);
  });

  it("rejects names starting with a hyphen", () => {
    expect(() => validateContainerName("-bad")).toThrow(/Invalid Incus container name/);
  });

  it("rejects empty strings", () => {
    expect(() => validateContainerName("")).toThrow(/Invalid Incus container name/);
  });

  it("rejects path traversal attempts", () => {
    expect(() => validateContainerName("../bad")).toThrow(/Invalid Incus container name/);
  });

  it("rejects names with special characters", () => {
    expect(() => validateContainerName("foo bar")).toThrow(/Invalid Incus container name/);
    expect(() => validateContainerName("foo;bar")).toThrow(/Invalid Incus container name/);
    expect(() => validateContainerName("foo.bar")).toThrow(/Invalid Incus container name/);
  });
});

// ---------------------------------------------------------------------------
// IncusManager — availability checks
// ---------------------------------------------------------------------------

// We mock child_process.execSync at the module level for the IncusManager tests.
// The manager uses exec() which wraps execSync internally.
const mockExecSync = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Re-import after mock to get the mocked version
const { IncusManager } = await import("./incus-manager.js");

describe("IncusManager", () => {
  let manager: InstanceType<typeof IncusManager>;

  beforeEach(() => {
    manager = new IncusManager();
    mockExecSync.mockReset();
  });

  // ─── checkIncus / getIncusVersion ──────────────────────────────────────

  describe("checkIncus", () => {
    it("returns true when incus version succeeds", () => {
      mockExecSync.mockReturnValue("6.0.0");
      expect(manager.checkIncus()).toBe(true);
      // Verify the correct command was called
      expect(mockExecSync).toHaveBeenCalledWith(
        "incus version",
        expect.objectContaining({ encoding: "utf-8" }),
      );
    });

    it("returns false when incus version fails", () => {
      mockExecSync.mockImplementation(() => { throw new Error("not found"); });
      expect(manager.checkIncus()).toBe(false);
    });
  });

  describe("getIncusVersion", () => {
    it("returns version string on success", () => {
      mockExecSync.mockReturnValue("6.0.0");
      expect(manager.getIncusVersion()).toBe("6.0.0");
    });

    it("returns null on failure", () => {
      mockExecSync.mockImplementation(() => { throw new Error("not found"); });
      expect(manager.getIncusVersion()).toBeNull();
    });
  });

  // ─── imageExists / listImages ──────────────────────────────────────────

  describe("imageExists", () => {
    it("returns true when image alias exists", () => {
      mockExecSync.mockReturnValue("some info output");
      expect(manager.imageExists("companion-incus")).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        "incus image info companion-incus",
        expect.objectContaining({ encoding: "utf-8" }),
      );
    });

    it("returns false when image alias does not exist", () => {
      mockExecSync.mockImplementation(() => { throw new Error("not found"); });
      expect(manager.imageExists("nonexistent")).toBe(false);
    });
  });

  describe("listImages", () => {
    it("parses image aliases from JSON output", () => {
      const jsonOutput = JSON.stringify([
        { aliases: [{ name: "companion-incus" }, { name: "base" }] },
        { aliases: [{ name: "test-image" }] },
        { aliases: [] },
      ]);
      mockExecSync.mockReturnValue(jsonOutput);
      expect(manager.listImages()).toEqual(["base", "companion-incus", "test-image"]);
    });

    it("returns empty array on failure", () => {
      mockExecSync.mockImplementation(() => { throw new Error("failed"); });
      expect(manager.listImages()).toEqual([]);
    });

    it("returns empty array for empty output", () => {
      mockExecSync.mockReturnValue("");
      expect(manager.listImages()).toEqual([]);
    });
  });

  // ─── execInContainer ───────────────────────────────────────────────────

  describe("execInContainer", () => {
    it("builds correct incus exec command with user context", () => {
      // Set up a tracked container with known user info
      // We need to use the internal containers map
      const info = {
        name: "companion-abc12345",
        image: "companion-incus",
        portMappings: [],
        hostCwd: "/tmp/test",
        containerCwd: "/workspace",
        hostWorkspaceDir: "/tmp/companion-ws-abc12345",
        homeDir: "/home/code",
        user: { uid: 1000, gid: 1000, name: "code" },
        state: "running" as const,
      };
      // Access private containers map through any cast
      (manager as any).containers.set("test-session", info);

      mockExecSync.mockReturnValue("output");
      manager.execInContainer("companion-abc12345", ["sh", "-lc", "echo hello"]);

      expect(mockExecSync).toHaveBeenCalledWith(
        "incus exec --cwd /workspace --user 1000 --group 1000 --env HOME=/home/code companion-abc12345 -- sh -lc 'echo hello'",
        expect.objectContaining({ encoding: "utf-8" }),
      );
    });
  });

  // ─── buildExecCommand ──────────────────────────────────────────────────

  describe("buildExecCommand", () => {
    beforeEach(() => {
      const info = {
        name: "companion-abc12345",
        image: "companion-incus",
        portMappings: [],
        hostCwd: "/tmp/test",
        containerCwd: "/workspace",
        hostWorkspaceDir: "/tmp/companion-ws-abc12345",
        homeDir: "/home/code",
        user: { uid: 1000, gid: 1000, name: "code" },
        state: "running" as const,
      };
      (manager as any).containers.set("test-session", info);
    });

    it("returns correct command array for interactive exec", () => {
      const cmd = manager.buildExecCommand("companion-abc12345", {
        interactive: true,
        cmd: ["bash", "-l"],
      });
      expect(cmd).toEqual([
        "incus", "exec",
        "--cwd", "/workspace",
        "--user", "1000",
        "--group", "1000",
        "--env", "HOME=/home/code",
        "companion-abc12345", "--",
        "bash", "-l",
      ]);
    });

    it("includes extra env vars", () => {
      const cmd = manager.buildExecCommand("companion-abc12345", {
        env: { CODEX_HOME: "/home/code/.codex", FOO: "bar" },
        cmd: ["bash", "-l"],
      });
      expect(cmd).toContain("--env");
      expect(cmd).toContain("CODEX_HOME=/home/code/.codex");
      expect(cmd).toContain("FOO=bar");
    });
  });

  // ─── hasBinaryInContainer ──────────────────────────────────────────────

  describe("hasBinaryInContainer", () => {
    beforeEach(() => {
      const info = {
        name: "companion-abc12345",
        image: "companion-incus",
        portMappings: [],
        hostCwd: "/tmp/test",
        containerCwd: "/workspace",
        hostWorkspaceDir: "/tmp/companion-ws-abc12345",
        homeDir: "/home/code",
        user: { uid: 1000, gid: 1000, name: "code" },
        state: "running" as const,
      };
      (manager as any).containers.set("test-session", info);
    });

    it("returns true when binary exists", () => {
      mockExecSync.mockReturnValue("/usr/bin/node");
      expect(manager.hasBinaryInContainer("companion-abc12345", "node")).toBe(true);
    });

    it("returns false when binary does not exist", () => {
      mockExecSync.mockImplementation(() => { throw new Error("not found"); });
      expect(manager.hasBinaryInContainer("companion-abc12345", "nonexistent")).toBe(false);
    });
  });

  // ─── getHostAddress ────────────────────────────────────────────────────

  describe("getHostAddress", () => {
    it("parses bridge IP from ip addr output", () => {
      mockExecSync.mockReturnValue("10.0.0.1");
      expect(manager.getHostAddress()).toBe("10.0.0.1");
    });

    it("caches the result after first call", () => {
      mockExecSync.mockReturnValue("10.0.0.1");
      manager.getHostAddress();
      manager.getHostAddress();
      // execSync called only once (cached)
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it("throws when bridge IP cannot be resolved", () => {
      mockExecSync.mockImplementation(() => { throw new Error("no bridge"); });
      expect(() => manager.getHostAddress()).toThrow(/Could not discover host address/);
    });
  });

  // ─── isContainerAlive ──────────────────────────────────────────────────

  describe("isContainerAlive", () => {
    it("returns 'running' for running containers", () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { name: "companion-abc12345", status: "Running" },
      ]));
      expect(manager.isContainerAlive("companion-abc12345")).toBe("running");
    });

    it("returns 'stopped' for stopped containers", () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { name: "companion-abc12345", status: "Stopped" },
      ]));
      expect(manager.isContainerAlive("companion-abc12345")).toBe("stopped");
    });

    it("returns 'missing' when container not found", () => {
      mockExecSync.mockReturnValue(JSON.stringify([]));
      expect(manager.isContainerAlive("companion-abc12345")).toBe("missing");
    });

    it("returns 'missing' on error", () => {
      mockExecSync.mockImplementation(() => { throw new Error("failed"); });
      expect(manager.isContainerAlive("companion-abc12345")).toBe("missing");
    });
  });

  // ─── Container Tracking ────────────────────────────────────────────────

  describe("container tracking", () => {
    const makeInfo = (name: string) => ({
      name,
      image: "companion-incus",
      portMappings: [],
      hostCwd: "/tmp/test",
      containerCwd: "/workspace",
      hostWorkspaceDir: `/tmp/companion-ws-${name}`,
      homeDir: "/home/code",
      user: { uid: 1000, gid: 1000, name: "code" },
      state: "running" as const,
    }) as any;

    it("getContainer returns undefined for unknown session", () => {
      expect(manager.getContainer("unknown")).toBeUndefined();
    });

    it("getContainerByName finds tracked containers", () => {
      const info = makeInfo("companion-abc12345");
      (manager as any).containers.set("session-1", info);
      expect(manager.getContainerByName("companion-abc12345")).toBe(info);
    });

    it("listContainers returns all tracked containers", () => {
      (manager as any).containers.set("s1", makeInfo("c1"));
      (manager as any).containers.set("s2", makeInfo("c2"));
      expect(manager.listContainers()).toHaveLength(2);
    });

    it("retrack moves container to new session key by name", () => {
      const info = makeInfo("companion-abc12345");
      (manager as any).containers.set("old-session", info);
      manager.retrack("companion-abc12345", "new-session");
      expect(manager.getContainer("old-session")).toBeUndefined();
      expect(manager.getContainer("new-session")).toBe(info);
    });
  });

  // ─── Persistence ───────────────────────────────────────────────────────

  describe("persistence", () => {
    const tmpFile = "/tmp/incus-manager-test-state.json";

    afterEach(() => {
      try { require("node:fs").unlinkSync(tmpFile); } catch { /* ok */ }
    });

    it("persistState writes tracked containers to disk", () => {
      const info = {
        name: "companion-abc12345",
        image: "companion-incus",
        portMappings: [{ containerPort: 3000, hostPort: 49152 }],
        hostCwd: "/tmp/test",
        containerCwd: "/workspace",
        hostWorkspaceDir: "/tmp/companion-ws-abc12345",
        homeDir: "/home/code",
        user: { uid: 1000, gid: 1000, name: "code" },
        state: "running" as const,
      };
      (manager as any).containers.set("session-1", info);
      manager.persistState(tmpFile);

      const { readFileSync } = require("node:fs");
      const data = JSON.parse(readFileSync(tmpFile, "utf-8"));
      expect(data).toHaveLength(1);
      expect(data[0].sessionId).toBe("session-1");
      expect(data[0].info.name).toBe("companion-abc12345");
    });

    it("persistState skips removed containers", () => {
      (manager as any).containers.set("session-1", {
        name: "removed-container",
        state: "removed",
      });
      manager.persistState(tmpFile);

      const { readFileSync } = require("node:fs");
      const data = JSON.parse(readFileSync(tmpFile, "utf-8"));
      expect(data).toHaveLength(0);
    });

    it("restoreState round-trips with persistState", () => {
      const info = {
        name: "companion-abc12345",
        image: "companion-incus",
        portMappings: [],
        hostCwd: "/tmp/test",
        containerCwd: "/workspace",
        hostWorkspaceDir: "/tmp/companion-ws-abc12345",
        homeDir: "/home/code",
        user: { uid: 1000, gid: 1000, name: "code" },
        state: "running" as const,
      };
      (manager as any).containers.set("session-1", info);
      manager.persistState(tmpFile);

      // Create new manager and restore
      const manager2 = new IncusManager();
      // Mock isContainerAlive to return "running"
      mockExecSync.mockReturnValue(JSON.stringify([
        { name: "companion-abc12345", status: "Running" },
      ]));
      const restored = manager2.restoreState(tmpFile);
      expect(restored).toBe(1);
      expect(manager2.getContainer("session-1")?.name).toBe("companion-abc12345");
    });

    it("restoreState returns 0 for missing file", () => {
      expect(manager.restoreState("/tmp/nonexistent-file.json")).toBe(0);
    });
  });
});
