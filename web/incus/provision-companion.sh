#!/usr/bin/env bash
# provision-companion.sh — Provision an Incus container for Companion Incus
#
# This script runs inside a fresh Ubuntu 24.04 Incus container to install
# the developer toolchain. It is the Incus equivalent of the Docker
# Dockerfile.the-companion from the original Companion project.
#
# Usage:
#   incus file push provision-companion.sh <container>/tmp/
#   incus exec <container> -- bash /tmp/provision-companion.sh
#
# Version: 1.0.0
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Constants ──────────────────────────────────────────────────────────────

CODE_USER="code"
CODE_UID=1000
CODE_HOME="/home/${CODE_USER}"
NODE_MAJOR=22

# ─── DNS Configuration ─────────────────────────────────────────────────────
# systemd-resolved can fail inside Incus containers. Detect and fix.

configure_dns_if_needed() {
    echo "==> Checking DNS resolution..."
    if host -W 2 archive.ubuntu.com >/dev/null 2>&1; then
        echo "    DNS is working."
        return 0
    fi

    echo "    DNS resolution failed. Disabling systemd-resolved and configuring static DNS..."
    systemctl disable --now systemd-resolved 2>/dev/null || true
    rm -f /etc/resolv.conf
    cat > /etc/resolv.conf <<'RESOLV'
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
RESOLV

    # Verify fix worked
    if ! host -W 5 archive.ubuntu.com >/dev/null 2>&1; then
        echo "    WARNING: DNS still not working after fix. Continuing anyway..."
    else
        echo "    DNS fixed."
    fi
}

# ─── Base Dependencies ─────────────────────────────────────────────────────

install_base_dependencies() {
    echo "==> Installing base dependencies..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        curl wget git ca-certificates gnupg jq unzip sudo \
        tmux ripgrep fzf \
        build-essential pkg-config libssl-dev \
        python3 python3-pip python3-venv \
        host dnsutils \
        locales
    # Set locale
    locale-gen en_US.UTF-8
    update-locale LANG=en_US.UTF-8
}

# ─── Create Code User ──────────────────────────────────────────────────────
# Rename the default ubuntu user (UID 1000) to "code" for semantics.

create_code_user() {
    echo "==> Creating ${CODE_USER} user..."

    # Check if ubuntu user exists and rename it
    if id ubuntu >/dev/null 2>&1; then
        # Kill any processes owned by ubuntu first
        pkill -u ubuntu 2>/dev/null || true
        sleep 1

        usermod -l "${CODE_USER}" -d "${CODE_HOME}" -m ubuntu 2>/dev/null || {
            # If rename fails (e.g., user logged in), create fresh
            userdel -r ubuntu 2>/dev/null || true
            useradd -m -s /bin/bash -u "${CODE_UID}" "${CODE_USER}"
        }
        groupmod -n "${CODE_USER}" ubuntu 2>/dev/null || true
    elif ! id "${CODE_USER}" >/dev/null 2>&1; then
        useradd -m -s /bin/bash -u "${CODE_UID}" "${CODE_USER}"
    fi

    # Passwordless sudo
    echo "${CODE_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${CODE_USER}"
    chmod 440 "/etc/sudoers.d/${CODE_USER}"

    # Ensure home directory exists and is owned correctly
    mkdir -p "${CODE_HOME}"
    chown -R "${CODE_UID}:${CODE_UID}" "${CODE_HOME}"
}

# ─── /tmp Cleanup Timer ────────────────────────────────────────────────────
# AI agents fill /tmp quickly. Auto-clean files older than 1 hour.

configure_tmp_cleanup() {
    echo "==> Configuring /tmp auto-cleanup..."
    mkdir -p /etc/systemd/system/systemd-tmpfiles-clean.timer.d
    cat > /etc/systemd/system/systemd-tmpfiles-clean.timer.d/override.conf <<'TIMER'
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
TIMER

    cat > /etc/tmpfiles.d/companion-tmp.conf <<'TMPFILES'
# Clean /tmp files older than 1 hour
d /tmp 1777 root root 1h
TMPFILES
}

# ─── Power Wrappers ────────────────────────────────────────────────────────
# Make shutdown/reboot etc. no-ops inside the container for better UX.

configure_power_wrappers() {
    echo "==> Configuring power management wrappers..."
    for cmd in shutdown poweroff reboot halt; do
        cat > "/usr/local/bin/${cmd}" <<WRAPPER
#!/bin/bash
echo "Power management is disabled inside containers."
echo "Use the Companion Incus UI to manage container lifecycle."
WRAPPER
        chmod +x "/usr/local/bin/${cmd}"
    done
}

# ─── Node.js ───────────────────────────────────────────────────────────────

install_nodejs() {
    echo "==> Installing Node.js ${NODE_MAJOR}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
    npm install -g npm@latest
}

# ─── Claude Code CLI ───────────────────────────────────────────────────────

install_claude_cli() {
    echo "==> Installing Claude Code CLI..."
    # Install as code user, then symlink to /usr/local/bin
    su - "${CODE_USER}" -c 'curl -fsSL https://claude.ai/install.sh | bash' || {
        echo "    WARNING: Claude CLI install failed. Skipping."
        return 0
    }
    # Symlink to make available system-wide
    if [ -f "${CODE_HOME}/.claude/local/bin/claude" ]; then
        ln -sf "${CODE_HOME}/.claude/local/bin/claude" /usr/local/bin/claude
    fi
}

# ─── Codex CLI ─────────────────────────────────────────────────────────────

install_codex_cli() {
    echo "==> Installing Codex CLI..."
    npm install -g @openai/codex 2>/dev/null || {
        echo "    WARNING: Codex CLI install failed. Skipping."
        return 0
    }
}

# ─── Bun ────────────────────────────────────────────────────────────────────

install_bun() {
    echo "==> Installing Bun..."
    su - "${CODE_USER}" -c 'curl -fsSL https://bun.sh/install | bash' || {
        echo "    WARNING: Bun install failed. Skipping."
        return 0
    }
    # Symlink
    if [ -f "${CODE_HOME}/.bun/bin/bun" ]; then
        ln -sf "${CODE_HOME}/.bun/bin/bun" /usr/local/bin/bun
        ln -sf "${CODE_HOME}/.bun/bin/bunx" /usr/local/bin/bunx
    fi
}

# ─── GitHub CLI ────────────────────────────────────────────────────────────

install_github_cli() {
    echo "==> Installing GitHub CLI..."
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
        dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
        tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -qq
    apt-get install -y gh
}

# ─── Docker CE ─────────────────────────────────────────────────────────────
# Docker inside Incus (via nesting). Socket permissions via primary group.

install_docker() {
    echo "==> Installing Docker CE..."
    curl -fsSL https://get.docker.com | sh

    # Configure Docker daemon to use code user's primary group for socket
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<DAEMON
{
    "group": "${CODE_USER}"
}
DAEMON

    # Also configure systemd socket to use code group
    mkdir -p /etc/systemd/system/docker.socket.d
    cat > /etc/systemd/system/docker.socket.d/override.conf <<SOCKET
[Socket]
SocketGroup=${CODE_USER}
SOCKET

    systemctl daemon-reload
    systemctl enable docker
}

# ─── code-server ───────────────────────────────────────────────────────────

install_code_server() {
    echo "==> Installing code-server..."
    curl -fsSL https://code-server.dev/install.sh | sh || {
        echo "    WARNING: code-server install failed. Skipping."
        return 0
    }
}

# ─── Browser Preview (Xvfb + noVNC + Chromium) ────────────────────────────

install_browser_preview() {
    echo "==> Installing browser preview dependencies..."
    apt-get install -y --no-install-recommends \
        xvfb x11vnc novnc websockify \
        chromium-browser 2>/dev/null || \
    apt-get install -y --no-install-recommends \
        xvfb x11vnc novnc websockify \
        chromium 2>/dev/null || {
        echo "    WARNING: Browser preview dependencies install failed. Skipping."
        return 0
    }
}

# ─── Cleanup ───────────────────────────────────────────────────────────────

cleanup() {
    echo "==> Cleaning up..."
    apt-get clean
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
}

# ─── Main ──────────────────────────────────────────────────────────────────

main() {
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   Companion Incus — Container Provisioning                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    configure_dns_if_needed
    install_base_dependencies
    create_code_user
    configure_tmp_cleanup
    configure_power_wrappers
    install_nodejs
    install_claude_cli
    install_codex_cli
    install_bun
    install_github_cli
    install_docker
    install_code_server
    install_browser_preview
    cleanup

    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   Provisioning complete!                                  ║"
    echo "╚════════════════════════════════════════════════════════════╝"
}

main "$@"
