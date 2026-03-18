import { existsSync } from "node:fs";
import type { Hono } from "hono";
import { join } from "node:path";
import * as envManager from "../env-manager.js";
import { incusManager } from "../incus-manager.js";
import { imageProvisionManager } from "../image-provision-manager.js";

export function registerEnvRoutes(
  api: Hono,
  options: { webDir: string },
): void {
  api.get("/envs", (c) => {
    try {
      return c.json(envManager.listEnvs());
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/envs/:slug", (c) => {
    const env = envManager.getEnv(c.req.param("slug"));
    if (!env) return c.json({ error: "Environment not found" }, 404);
    return c.json(env);
  });

  api.post("/envs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const env = envManager.createEnv(body.name, body.variables || {});
      return c.json(env, 201);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.put("/envs/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json().catch(() => ({}));
    try {
      const env = envManager.updateEnv(slug, {
        name: body.name,
        variables: body.variables,
      });
      if (!env) return c.json({ error: "Environment not found" }, 404);
      return c.json(env);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.delete("/envs/:slug", (c) => {
    try {
      const deleted = envManager.deleteEnv(c.req.param("slug"));
      if (!deleted) return c.json({ error: "Environment not found" }, 404);
      return c.json({ ok: true });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.post("/incus/build-image", async (c) => {
    if (!incusManager.checkIncus()) return c.json({ error: "Incus is not available" }, 503);
    try {
      imageProvisionManager.rebuild("companion-incus");
      const ready = await imageProvisionManager.waitForReady("companion-incus", 300_000);
      if (ready) {
        return c.json({ success: true });
      }
      const state = imageProvisionManager.getState("companion-incus");
      return c.json({ success: false, error: state.error || "Build timed out" }, 500);
    } catch (e: unknown) {
      return c.json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/incus/image-status", (c) => {
    const exists = incusManager.imageExists("companion-incus");
    return c.json({ exists, image: "companion-incus" });
  });

  api.get("/images/:tag/status", (c) => {
    const tag = decodeURIComponent(c.req.param("tag"));
    if (!tag) return c.json({ error: "Image tag is required" }, 400);
    return c.json(imageProvisionManager.getState(tag));
  });

  api.post("/images/:tag/pull", (c) => {
    const tag = decodeURIComponent(c.req.param("tag"));
    if (!tag) return c.json({ error: "Image tag is required" }, 400);
    if (!incusManager.checkIncus()) {
      return c.json({ error: "Incus is not available" }, 503);
    }
    imageProvisionManager.rebuild(tag);
    return c.json({ ok: true, state: imageProvisionManager.getState(tag) });
  });
}
