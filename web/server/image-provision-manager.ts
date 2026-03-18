import { join, dirname } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { incusManager } from "./incus-manager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageProvisionState {
  image: string;
  status: "idle" | "building" | "ready" | "error";
  /** Last N lines of build output (ring buffer) */
  progress: string[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PROGRESS_LINES = 200; // Provision builds are verbose
const WEB_DIR = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// ImageProvisionManager — singleton that tracks background image builds
// ---------------------------------------------------------------------------

type ReadyListener = () => void;

class ImageProvisionManager {
  private states = new Map<string, ImageProvisionState>();
  private readyListeners = new Map<string, ReadyListener[]>();
  private progressListeners = new Map<string, Array<(line: string) => void>>();

  /**
   * Get the current state for an image.
   * If the image exists locally and we have no tracking entry, return "ready".
   */
  getState(image: string): ImageProvisionState {
    const existing = this.states.get(image);
    if (existing) return existing;

    const ready = incusManager.imageExists(image);
    return {
      image,
      status: ready ? "ready" : "idle",
      progress: [],
    };
  }

  /** Quick check: is the image available locally right now? */
  isReady(image: string): boolean {
    return this.getState(image).status === "ready";
  }

  /**
   * Ensure the image is available. Starts a background build if missing.
   * No-op if already building or ready.
   */
  ensureImage(image: string): void {
    const state = this.getState(image);
    if (state.status === "ready" || state.status === "building") return;
    this.startBuild(image);
  }

  /**
   * Wait for an image that is currently building to become ready.
   * Resolves true if ready, false if build failed or timed out.
   * If image is already ready, resolves immediately.
   */
  waitForReady(image: string, timeoutMs = 1_200_000): Promise<boolean> {
    const state = this.getState(image);
    if (state.status === "ready") return Promise.resolve(true);
    if (state.status === "error") return Promise.resolve(false);
    if (state.status === "idle") {
      this.startBuild(image);
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const arr = this.readyListeners.get(image);
        if (arr) {
          const idx = arr.indexOf(listener);
          if (idx >= 0) arr.splice(idx, 1);
          if (arr.length === 0) this.readyListeners.delete(image);
        }
        resolve(result);
      };

      const timer = setTimeout(() => done(false), timeoutMs);

      const listener: ReadyListener = () => {
        const s = this.getState(image);
        if (s.status === "ready") done(true);
        else if (s.status === "error") done(false);
      };

      const listeners = this.readyListeners.get(image) ?? [];
      listeners.push(listener);
      this.readyListeners.set(image, listeners);

      const currentState = this.getState(image);
      if (currentState.status === "ready") done(true);
      else if (currentState.status === "error") done(false);
    });
  }

  /**
   * Trigger a rebuild even if image is already present (for updates).
   */
  rebuild(image: string): void {
    const state = this.getState(image);
    if (state.status === "building") return;
    this.startBuild(image);
  }

  /**
   * Subscribe to progress lines for a specific image.
   * Returns an unsubscribe function.
   */
  onProgress(image: string, cb: (line: string) => void): () => void {
    const key = `progress:${image}`;
    const listeners = this.progressListeners.get(key) ?? [];
    listeners.push(cb);
    this.progressListeners.set(key, listeners);
    return () => {
      const arr = this.progressListeners.get(key);
      if (arr) {
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /**
   * Ensure the user-editable provision script exists at ~/.companion/incus/.
   * Copies the bundled default if not present.
   */
  ensureProvisionScript(): string {
    const homedir = process.env.HOME || "/root";
    const userDir = join(homedir, ".companion/incus");
    const userScript = join(userDir, "provision-companion.sh");

    if (!existsSync(userScript)) {
      const packageRoot = process.env.__COMPANION_PACKAGE_ROOT || join(WEB_DIR, "..");
      const bundledScript = join(packageRoot, "incus/provision-companion.sh");

      if (existsSync(bundledScript)) {
        mkdirSync(userDir, { recursive: true });
        copyFileSync(bundledScript, userScript);
        console.log(`[image-provision] Copied bundled provision script to ${userScript}`);
      }
    }

    return userScript;
  }

  /**
   * Reset the user's provision script to the bundled default.
   */
  resetProvisionScript(): void {
    const homedir = process.env.HOME || "/root";
    const userDir = join(homedir, ".companion/incus");
    const userScript = join(userDir, "provision-companion.sh");
    const packageRoot = process.env.__COMPANION_PACKAGE_ROOT || join(WEB_DIR, "..");
    const bundledScript = join(packageRoot, "incus/provision-companion.sh");

    if (existsSync(bundledScript)) {
      mkdirSync(userDir, { recursive: true });
      copyFileSync(bundledScript, userScript);
      console.log(`[image-provision] Reset provision script to bundled default`);
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private startBuild(image: string): void {
    const state: ImageProvisionState = {
      image,
      status: "building",
      progress: [],
      startedAt: Date.now(),
    };
    this.states.set(image, state);

    // Ensure provision script exists before building
    this.ensureProvisionScript();

    // Start async build
    this.doBuild(image);
  }

  private async doBuild(image: string): Promise<void> {
    try {
      const result = await incusManager.buildImage(image, (line) => {
        this.appendProgress(image, line);
      });

      if (result.success) {
        this.markReady(image);
      } else {
        this.markError(image, "Build failed — check progress output for details");
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.markError(image, reason);
    }
  }

  private appendProgress(image: string, line: string): void {
    const state = this.states.get(image);
    if (!state) return;
    state.progress.push(line);
    if (state.progress.length > MAX_PROGRESS_LINES) {
      state.progress.splice(0, state.progress.length - MAX_PROGRESS_LINES);
    }

    const key = `progress:${image}`;
    const listeners = this.progressListeners.get(key);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(line); } catch { /* ignore */ }
      }
    }
  }

  private markReady(image: string): void {
    const state = this.states.get(image);
    if (state) {
      state.status = "ready";
      state.completedAt = Date.now();
      this.appendProgress(image, "Image ready");
    }
    this.notifyListeners(image);
  }

  private markError(image: string, error: string): void {
    const state = this.states.get(image);
    if (state) {
      state.status = "error";
      state.error = error;
      state.completedAt = Date.now();
      this.appendProgress(image, `Error: ${error}`);
    }
    this.notifyListeners(image);
  }

  private notifyListeners(image: string): void {
    const listeners = this.readyListeners.get(image);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(); } catch { /* ignore */ }
      }
      this.readyListeners.delete(image);
    }
  }
}

// Singleton export
export const imageProvisionManager = new ImageProvisionManager();
