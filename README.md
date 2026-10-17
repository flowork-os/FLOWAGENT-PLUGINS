<div align="center">

# 🌐 Flowork OS Unified Sovereign Plugin Registry (Multi-OS)

**High-Performance Modular GUI, Native Binary & Bytecode Extension Registry for Sovereign AI Agents across Linux & Windows**

[![Platform](https://img.shields.io/badge/Platform-Linux%20x86__64%20%7C%20Windows%20x64-00D26A?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/flowork-os/FLOWAGENT-PLUGINS)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%20%7C%20Go%20%7C%20Rust%20%7C%20WASM%20%7C%20Canvas%20GUI-339933?style=for-the-badge&logo=rust&logoColor=white)](https://floworkos.com)
[![Distribution](https://img.shields.io/badge/Distribution-Zero--API%20CDN-00D26A?style=for-the-badge)](https://plugins.floworkos.com)
[![Architecture](https://img.shields.io/badge/Architecture-Nano--Modular%20Sharded%20V2-00F5FF?style=for-the-badge)](https://floworkos.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/flowork-os/FLOWAGENT-PLUGINS/pulls)

<br />

<a href="https://github.com/flowork-os/FLOWORK-AGENT">
  <img src="https://img.shields.io/badge/%E2%9A%A1%20DOWNLOAD%20FLOWORK%20AGENT-INSTALL%20NOW%20%E2%86%92-FF0055?style=for-the-badge&logo=rocket&logoColor=white&labelColor=0D1117" alt="Download Flowork Agent" height="54" />
</a>

<br /><br />

<p align="center">
  <a href="#-get-the-flowork-agent">Download Agent</a> •
  <a href="#-overview">Overview</a> •
  <a href="#-dynamic-discovery--app-store">Discovery</a> •
  <a href="#-architecture--specs">Architecture</a> •
  <a href="#-zero-api-cdn-installation">Installation</a> •
  <a href="#-plugin-manifest-specification">Manifest Spec</a> •
  <a href="#-publishing-guidelines">Publishing</a>
</p>

---

</div>

## ⚡ Get the Flowork Agent

To execute sovereign plugins, launch interactive canvas webviews, and orchestrate zero-conflict IPC runtimes, download and install the official **Flowork Agent Engine**:

<div align="center">

[![Download Flowork Agent](https://img.shields.io/badge/%E2%9A%A1%20DOWNLOAD%20FLOWORK%20AGENT-CLICK%20TO%20GET%20STARTED-FF0055?style=for-the-badge&logo=github&logoColor=white&labelColor=0D1117)](https://github.com/flowork-os/FLOWORK-AGENT)

**[👉 https://github.com/flowork-os/FLOWORK-AGENT 👈](https://github.com/flowork-os/FLOWORK-AGENT)**

*Native support for Linux (x86_64, AArch64) • Windows 10/11 • macOS*

</div>

---

## 🌟 Overview

The **Flowork OS Linux Plugin Registry** is the decentralized package registry for verified sovereign extensions and desktop applications engineered specifically for **Flowork OS** and autonomous AI agents on Linux.

Built upon the **Nano-Plug Architecture**, plugins deliver high-performance visual computing and backend computation without polluting LLM context windows:
- ⚡ **Zero Prompt Bloat**: Extensions remain completely off-context until explicitly mounted or invoked.
- 🎨 **Visual Canvas UI + Daemon Engine**: Full dual-process architecture combining reactive HTML5/Canvas interfaces with high-throughput native Node.js/WASM backends.
- 🔒 **Zero-Zombie Lifecycle**: Managed IPC supervision with dynamic port allocation (`$FLOWORK_APP_PORT`) and instant signal termination (`SIGTERM`/`SIGINT`).
- 🌐 **Zero GitHub API Quota**: Sharded CDN packaging distributed via Cloudflare Edge Gateways and raw tarball streaming.

---

## 🔍 Dynamic Discovery & App Store

To support limitless catalog expansion without bloating repository files, all plugins are indexed dynamically and queried through automated discovery endpoints:

### 1. Web App Store
Explore, search, and inspect plugins interactively on the official portal:
👉 **[https://plugins.floworkos.com](https://plugins.floworkos.com)**

### 2. Edge Gateway API
Real-time JSON search endpoint powered by Cloudflare Workers:
```bash
# Query verified Linux plugins
curl -s "https://plugins.floworkos.com/api/plugins?os=linux&q=chess"
```

### 3. Agent & CLI Discovery
Flowork AI agents search the catalog autonomously via semantic indexing:
```bash
# Search registry via Flowork CLI
flowork plugin search "video editor"
```

---

## 🏛️ Architecture & Specs

```
FLOWAGENT-PLUGINS/
├── index/                        # O(1) Crates.io-style sharded lookup metadata
│   └── <aa>/<bb>/<plugin_id>.json
├── plugins/                      # Sovereign plugin source trees
│   └── <aa>/<plugin_id>/
│       ├── plugin.manifest.json  # Plug & Play agnostic manifest
│       ├── SKILL.md              # 20-keyword Agent runbook & SOP
│       ├── gui/                  # HTML5 / Canvas frontend
│       └── engine/               # Node.js / WASM backend
├── plugins.json                  # Root registry index
└── README.md
```

### Two-Tier Directory Sharding
To maintain sub-millisecond Git index performance and eliminate filesystem inode bottlenecks as the registry grows to thousands of packages:
$$\text{Source Path} = \text{plugins}/\{id[0..2]\}/\{id\}$$
$$\text{Index Shard} = \text{index}/\{id[0..2]\}/\{id[2..4]\}/\{id\}.\text{json}$$

### Dual-Process IPC Lifecycle
1. **Host Boot**: Flowork OS allocates an available ephemeral TCP port and sets `FLOWORK_APP_PORT=<PORT>`.
2. **Process Spawn**: The engine background process spawns via `node engine/server.mjs` or native binary.
3. **Canvas Docking**: The graphical interface (`gui/index.html`) is rendered in the Flowork Canvas webview communicating over the allocated port.
4. **Clean Teardown**: Upon tab close or unmount, `SIGTERM` terminates the background process cleanly without orphan zombies.

---

## 🚀 Zero-API CDN Installation

Plugins are downloaded and unpacked directly via raw GitHub archive streaming, consuming zero GitHub API tokens:

```bash
# Direct CDN Tarball Stream
PLUGIN_ID="chess"
PREFIX="${PLUGIN_ID:0:2}"

curl -sL "https://codeload.github.com/flowork-os/FLOWAGENT-PLUGINS/tar.gz/main" | \
  tar -xz --strip-components=3 -C ./plugins/ "FLOWAGENT-PLUGINS-main/plugins/${PREFIX}/${PLUGIN_ID}"
```

Or via Flowork Agent CLI:
```bash
flowork plugin install <plugin_id>
```

---

## 📋 Plugin Manifest Specification

Every plugin includes a mandatory `plugin.manifest.json`:

```json
{
  "id": "sample-plugin",
  "name": "Sample Plugin",
  "version": "1.0.0",
  "author": "Flowork OS & Community",
  "category": "Utilities",
  "icon": "⚡",
  "description": "High-performance sovereign extension with real-time IPC.",
  "entry": {
    "gui": "gui/index.html",
    "backend": "engine/server.mjs"
  },
  "ipc": {
    "port_env": "FLOWORK_APP_PORT",
    "default_port": 17820
  },
  "dependencies": {
    "system": ["node", "bash"],
    "npm": []
  }
}
```

---

## 🛠️ Publishing Guidelines

1. **Strict 1-Folder / 1-Plugin Isolation**: No dependencies outside the plugin directory.
2. **Mandatory `SKILL.md`**: Must provide agent instructions with exactly 20 English keywords in YAML frontmatter.
3. **Dynamic Port Binding**: Must bind dynamically to `process.env.FLOWORK_APP_PORT || default_port`.
4. **Zero External CDN Leaks**: All CSS, JavaScript libraries, fonts, and assets must be self-contained locally.
5. **Multi-Architecture Linux Ready**: Ensure compatibility with Ubuntu, Debian, Arch Linux, Fedora, and Alpine.

### Submit via Pull Request
```bash
git checkout -b feature/new-plugin
# Place plugin in plugins/{id[:2]}/{id}
git add plugins/ index/ plugins.json
git commit -m "feat(plugin): publish <id> to Linux registry"
git push origin feature/new-plugin
```

---

## 📄 License & Sovereignty

Licensed under the **MIT License**. Built with sovereign pride by the Flowork OS Community.

Co-authored-by: Flowork OS <agent@floworkos.com>
