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
