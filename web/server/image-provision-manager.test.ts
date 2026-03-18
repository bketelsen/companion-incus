import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock incus-manager before importing
vi.mock("./incus-manager.js", () => ({
  incusManager: {
    imageExists: vi.fn(),
    buildImage: vi.fn(),
  },
}));

const { incusManager } = await import("./incus-manager.js");
const { imageProvisionManager } = await import("./image-provision-manager.js");

// Access private state for testing
const manager = imageProvisionManager as any;

describe("ImageProvisionManager", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear internal state between tests
    manager.states.clear();
    manager.readyListeners.clear();
    manager.progressListeners.clear();
  });

  describe("getState", () => {
    it("returns 'ready' when image exists locally and no tracking entry", () => {
      (incusManager.imageExists as any).mockReturnValue(true);
      const state = imageProvisionManager.getState("companion-incus");
      expect(state.status).toBe("ready");
      expect(state.image).toBe("companion-incus");
    });

    it("returns 'idle' when image does not exist and no tracking entry", () => {
      (incusManager.imageExists as any).mockReturnValue(false);
      const state = imageProvisionManager.getState("companion-incus");
      expect(state.status).toBe("idle");
    });

    it("returns tracked state when entry exists", () => {
      manager.states.set("companion-incus", {
        image: "companion-incus",
        status: "building",
        progress: ["Building..."],
        startedAt: Date.now(),
      });
      const state = imageProvisionManager.getState("companion-incus");
      expect(state.status).toBe("building");
    });
  });

  describe("isReady", () => {
    it("returns true when image is ready", () => {
      (incusManager.imageExists as any).mockReturnValue(true);
      expect(imageProvisionManager.isReady("companion-incus")).toBe(true);
    });

    it("returns false when image is not ready", () => {
      (incusManager.imageExists as any).mockReturnValue(false);
      expect(imageProvisionManager.isReady("companion-incus")).toBe(false);
    });
  });

  describe("ensureImage", () => {
    it("no-ops when image is already ready", () => {
      (incusManager.imageExists as any).mockReturnValue(true);
      imageProvisionManager.ensureImage("companion-incus");
      // buildImage should NOT be called
      expect(incusManager.buildImage).not.toHaveBeenCalled();
    });

    it("triggers build when image is idle", () => {
      (incusManager.imageExists as any).mockReturnValue(false);
      (incusManager.buildImage as any).mockResolvedValue({ success: true, log: "" });
      imageProvisionManager.ensureImage("companion-incus");
      // State should be building
      expect(manager.states.get("companion-incus")?.status).toBe("building");
    });
  });

  describe("rebuild", () => {
    it("triggers build even when image is ready", () => {
      (incusManager.imageExists as any).mockReturnValue(true);
      (incusManager.buildImage as any).mockResolvedValue({ success: true, log: "" });
      imageProvisionManager.rebuild("companion-incus");
      expect(manager.states.get("companion-incus")?.status).toBe("building");
    });

    it("no-ops when already building", () => {
      manager.states.set("companion-incus", {
        image: "companion-incus",
        status: "building",
        progress: [],
      });
      imageProvisionManager.rebuild("companion-incus");
      // Should not start another build
      expect(incusManager.buildImage).not.toHaveBeenCalled();
    });
  });

  describe("waitForReady", () => {
    it("resolves immediately when image is ready", async () => {
      (incusManager.imageExists as any).mockReturnValue(true);
      const result = await imageProvisionManager.waitForReady("companion-incus");
      expect(result).toBe(true);
    });

    it("resolves false when image has error", async () => {
      manager.states.set("companion-incus", {
        image: "companion-incus",
        status: "error",
        progress: [],
        error: "build failed",
      });
      const result = await imageProvisionManager.waitForReady("companion-incus");
      expect(result).toBe(false);
    });
  });

  describe("onProgress", () => {
    it("fires callback for build progress lines", () => {
      const lines: string[] = [];
      const unsub = imageProvisionManager.onProgress("companion-incus", (line) => {
        lines.push(line);
      });

      // Simulate progress
      manager.appendProgress("companion-incus", "Step 1...");
      // appendProgress requires a tracked state
      manager.states.set("companion-incus", {
        image: "companion-incus",
        status: "building",
        progress: [],
      });
      manager.appendProgress("companion-incus", "Step 2...");

      expect(lines).toContain("Step 2...");

      // Cleanup
      unsub();
    });

    it("unsubscribe removes listener", () => {
      const lines: string[] = [];
      const unsub = imageProvisionManager.onProgress("companion-incus", (line) => {
        lines.push(line);
      });

      unsub();

      manager.states.set("companion-incus", {
        image: "companion-incus",
        status: "building",
        progress: [],
      });
      manager.appendProgress("companion-incus", "Should not appear");

      expect(lines).not.toContain("Should not appear");
    });
  });
});
