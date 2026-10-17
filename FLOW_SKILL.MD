# FLOW_SKILL.MD — SOP & STANDAR PENGEMBANGAN PLUGIN FLOWORK OS (X-FLOW)

> **OTORITAS TERTINGGI**: AWENK AUDICO & TEGUHFX (LEVEL 99 SUPER ADMIN).  
> **DOKTRIN UTAMA**: NANO-MODULAR SURGICAL ARCHITECTURE, POLYGLOT AGNOSTIC, ZERO-TRUST IPC, DAN ZERO-ZOMBIE PROCESS.  
> **TUJUAN BERKAS**: Menjadi panduan operasional (Runbook/SOP) resmi bagi Agent AI, Developer, dan Integrator untuk merancang, membangun, dan menguji plugin dalam ekosistem Flowork OS / X-Flow.

---

## 1. Doktrin & Filosofi Arsitektur Plugin Flowork OS

Arsitektur plugin Flowork OS dirancang dengan prinsip kedaulatan mutlak untuk menjamin skalabilitas, kecepatan eksekusi, dan stabilitas tanpa efek domino:

1. **Nano-Modular & 1 File 1 Fungsi (Anti-Domino Effect)**:
   - Pecah fungsionalitas menjadi modul-modul kecil dan ringkas (kisaran 20–80 baris per fungsi/file).
   - Menghindari pembuatan berkas monolitik raksasa yang rentan memicu halusinasi AI saat pemeliharaan kode.
   - Kerusakan pada satu unit logika tidak boleh merambat ke unit logika lainnya.

2. **Polyglot & Language Agnostic (Bebas Bahasa Pemrograman)**:
   - Core Host X-Flow (Rust) bersifat sepenuhnya agnostik terhadap bahasa pemrograman plugin.
   - Backend plugin bebas ditulis menggunakan **Node.js / ECMAScript (`.mjs`/`.js`)**, **Python (`.py`)**, **Shell/Batch (`.bat`/`.cmd`)**, biner terkompilasi native (**Rust, Go, C/C++, Zig**), maupun client-side **WebAssembly (`.wasm`)**.
   - Core Host tidak peduli runtime internal backend; penghubung kedaulatan hanyalah kontrak `plugin.manifest.json` dan IPC berbasis HTTP/SSE.

3. **Zero-Trust Inter-Component Isolation**:
   - Setiap plugin beroperasi di dalam ruang terisolasi miliknya sendiri (`plugins/<plugin-id>/`).
   - Dilarang membuat shared mutable state atau ketergantungan liar antar plugin tanpa kontrak data eksplisit.
   - Frontend GUI berjalan di dalam Webview / iframe terproteksi dan berkomunikasi dengan backend melalui REST API / SSE menggunakan port dinamis yang dialokasikan Host.

4. **Dynamic Port Injection (Pantang Hardcode Port)**:
   - Core Host mengalokasikan port jaringan bebas secara dinamis saat peluncuran plugin (`PortManager::allocate_free_port()`).
   - Host menyuntikkan port tersebut ke variabel lingkungan (*Environment Variables*):
     - `$FLOWORK_APP_PORT`
     - `$FLOWORK_PLUGIN_PORT`
     - `$PORT`
   - Backend plugin **WAJIB** membaca variabel lingkungan ini saat mengikat (*bind/listen*) socket jaringan. Backend dilarang keras meng-hardcode port statis.

5. **Zero-Zombie Process Lifecycle Management**:
   - Engine backend diluncurkan di bawah kontrol `ProcessSupervisor` dengan process group mandiri (`process_group(0)` di Unix).
   - Saat tab plugin ditutup atau aplikasi Core Host shutdown, Host membasmi seluruh pohon proses secara tuntas (`kill -9 -PID` di Unix, `taskkill /F /T /PID` di Windows).
   - Backend wajib merespons sinyal terminasi dan dilarang meninggalkan *orphaned process* atau *zombie worker* di sistem operasi.

6. **Hot-Plug & Autonomic Discovery**:
   - Folder `plugins/` dipantau secara real-time oleh Core Host via `notify` watcher.
   - Penambahan folder plugin baru, pembaruan manifest, atau penghapusan plugin akan dideteksi dan disinkronkan secara otomatis tanpa perlu me-restart Core Host X-Flow.

7. **Real Username & Identitas Paspor Kedaulatan (Haram Placeholder "User/Human")**:
   - Seluruh plugin, label antarmuka GUI, badge pemain, obrolan, dan injeksi prompt **WAJIB menggunakan Real Username** yang diekstrak langsung dari cryptographic passport `.flowork/auth_vault.json` (atau endpoint Host `/api/auth/status`).
   - Dilarang keras menggunakan kata placeholder anonim generik seperti `"User"`, `"Human"`, `"User (White)"`, atau `"Pengguna"`.
   - Gunakan format `@<username>` resmi (contoh: `@awenkaudico` dengan badge `👑 Sovereign Master`).

---

## 2. Struktur Direktori Standar Plugin

Setiap plugin wajib diletakkan di dalam folder `xflow/plugins/<plugin-id>/` dengan topografi direktori sebagai berikut:

```
xflow/plugins/<plugin-id>/
├── plugin.manifest.json          # [MANDATORI] Kontrak baku metadata & entry point
├── gui/                          # [KONDISIONAL] Antarmuka Grafis (Frontend)
│   ├── index.html                # Entry point utama antarmuka (disajikan oleh Host)
│   ├── main.css                  # Berkas styling antarmuka (English UI)
│   └── app.js                    # Logika klien & jembatan IPC ke backend
└── engine/                       # [KONDISIONAL] Logika Mesin (Backend Service)
    ├── server.mjs                # Skrip peladen (contoh: Node.js/MJS)
    │   # ATAU main.py            # Skrip peladen Python
    │   # ATAU worker (biner)     # Biner native hasil kompilasi (Rust/Go/C)
    └── wasm/                     # Modul WebAssembly berkecepatan tinggi (opsional)
```

### Klasifikasi Tipe Plugin:
- **Full-Stack Plugin** (GUI + Backend): Memiliki antarmuka grafis di `gui/` dan peladen backend di `engine/` (contoh: `x-multitrack`, `yt-downloader`).
- **GUI-Only Plugin** (Frontend Static / Pure WASM): Hanya memiliki `gui/index.html`. Tidak memerlukan backend proses (`backend` diatur `null` atau dihilangkan).
- **Backend-Only Plugin** (Headless Daemon / Background Worker): Hanya memiliki entri `backend` untuk memproses tugas komputasi, analitik, atau background synchronization.

---

## 3. Spesifikasi Kontrak `plugin.manifest.json`

Berkas `plugin.manifest.json` adalah paspor kedaulatan setiap plugin yang dibaca oleh parser Core Host (`core/src/manifest.rs`).

### Skema Manifest Baku:
```json
{
  "id": "my-sample-plugin",
  "name": "Sample Audio Processor",
  "version": "1.0.0",
  "author": "Awenk Audico",
  "description": "High-performance modular audio DSP and waveform filter plugin.",
  "category": "Media & Audio",
  "icon": "🎛️",
  "entry": {
    "gui": "gui/index.html",
    "backend": "engine/server.mjs"
  },
  "ipc": {
    "port_env": "FLOWORK_APP_PORT",
    "default_port": 17896
  }
}
```

### Rincian Bidang (*Field Breakdown*):
| Field | Tipe | Status | Deskripsi |
|---|---|---|---|
| `id` | `String` | Mandatori | Pengenal unik plugin dalam format `kebab-case`. Dilarang menggunakan spasi atau karakter spesial. |
| `name` | `String` | Mandatori | Nama formal plugin yang ditampilkan pada Sidebar Dock dan App Launcher. |
| `version` | `String` | Opsional | Versi rilis plugin berbasis Semantic Versioning (default: `"1.0.0"`). |
| `author` | `String` | Opsional | Nama kreator, pengembang, atau institusi pembuat plugin. |
| `description` | `String` | Opsional | Penjelasan singkat fungsionalitas dan peran plugin. |
| `category` | `String` | Opsional | Kategori klasifikasi (contoh: `Media & Audio`, `AI & Automation`, `Tools`, `Network`). |
| `icon` | `String` | Opsional | Simbol representasi visual (karakter emoji UTF-8 atau path ikon). |
| `entry.gui` | `String` | Opsional | Path relatif berkas HTML antarmuka pengguna dari root folder plugin. |
| `entry.backend`| `String` | Opsional | Path relatif berkas skrip backend atau biner native yang akan dieksekusi oleh Process Supervisor. |
| `ipc.port_env` | `String` | Opsional | Nama environment variable penampung port dinamis (default: `"FLOWORK_APP_PORT"`). |
| `ipc.default_port` | `u16` | Opsional | Port fallback jika plugin dijalankan mandiri di luar ekosistem host. |

---

## 4. Mekanisme Runtime & Eksekusi Backend (Supervisor)

Core Host mendeteksi ekstensi berkas yang didefinisikan pada `entry.backend` dan secara otomatis menentukan runtime eksekutor:

| Ekstensi Berkas | Runtime Eksekutor | Perintah Peluncuran Host |
|---|---|---|
| `.py` | Python 3 | `python3 <abs_path>` (Linux/macOS) / `python <abs_path>` (Windows) |
| `.mjs` / `.js` | Node.js | `node <abs_path>` |
| `.bat` / `.cmd` | Windows Batch | `cmd /C <abs_path>` |
| *Tanpa ekstensi* / biner terkompilasi | Native Binary | Langsung dieksekusi sebagai biner native OS (`./<bin_path>`) |

### Aturan Injeksi Port Backend:
Saat meluncurkan engine, Host menyuntikkan port bebas ke proses backend. Backend wajib mengambil port dari environment variable:

#### Contoh Implementasi Backend Node.js (`engine/server.mjs`):
```javascript
import http from 'node:http';

// Tangkap port dinamis dari environment variable yang di-inject Host
const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17894', 10);
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Plugin Backend] Engine listening on http://${HOST}:${PORT}`);
});
```

#### Contoh Implementasi Backend Python (`engine/server.py`):
```python
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

PORT = int(os.environ.get("FLOWORK_APP_PORT", os.environ.get("PORT", 17894)))
HOST = "127.0.0.1"

class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "port": PORT}).encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), SimpleHandler)
    print(f"[Plugin Python] Engine listening on http://{HOST}:{PORT}", file=sys.stderr)
    server.serve_forever()
```

#### Contoh Implementasi Backend Biner Native Rust (`engine/src/main.rs`):
```rust
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port: u16 = env::var("FLOWORK_APP_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "17894".to_string())
        .parse()?;

    println!("[Plugin Rust Native] Bound to port: {}", port);
    // Jalankan axum / actix / hyper listener di 127.0.0.1:port
    Ok(())
}
```

---

## 5. Mekanisme Antarmuka GUI & Penyajian Aset Statis

Core Host X-Flow menyajikan antarmuka grafis plugin melalui web server internal (`core/src/asset_server.rs`):

- **Rute URL**: `http://127.0.0.1:PORT/plugins/<plugin-id>/gui/`
- **Injeksi `<base href>` Otomatis**:
  Core Host secara otomatis menyuntikkan tag `<base href="/plugins/<plugin-id>/gui/">` ke dalam tag `<head>` pada berkas HTML jika belum ada.
  Hal ini menjamin bahwa pemanggilan berkas statis relatif (`./main.css`, `./app.js`, `./assets/logo.png`) akan selalu terselesaikan dengan benar tanpa resiko path rusak.

### Logika Penghubung GUI ke Backend Engine (`app.js`):
Ketika antarmuka pengguna dimuat, GUI meminta Core Host untuk memastikan backend plugin aktif dan mendapatkan port dinamisnya melalui API Host:

```javascript
async function initializePluginBackend(pluginId) {
  try {
    // 1. Minta Host untuk meluncurkan backend engine dan mengembalikan port aktif
    const response = await fetch(`/api/plugins/${pluginId}/launch`, { method: 'POST' });
    const data = await response.json();

    if (data.status === 'ok') {
      const backendPort = data.port;
      const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
      console.log(`[Plugin GUI] Backend connected at: ${backendBaseUrl}`);

      // 2. Hubungi endpoint kesehatan backend engine
      const healthCheck = await fetch(`${backendBaseUrl}/api/health`);
      const healthData = await healthCheck.json();
      console.log('[Plugin GUI] Engine Health:', healthData);

      return backendBaseUrl;
    } else {
      console.error('[Plugin GUI] Failed to launch backend engine:', data.message);
    }
  } catch (err) {
    console.error('[Plugin GUI] IPC Connection Error:', err);
  }
}
```

---

## 6. Katalog REST API Core Host untuk Plugin

Setiap plugin yang berjalan di dalam antarmuka X-Flow dapat memanfaatkan layanan native Core Host melalui REST API:

| Endpoint | Method | Fungsi | Parameter / Payload |
|---|---|---|---|
| `/api/plugins` | `GET` | Mengambil seluruh katalog plugin yang terpasang di sistem. | Tidak ada. |
| `/api/plugins/:id/launch` | `POST` | Menjalankan backend engine plugin dan mengembalikan port yang dialokasikan. | Path param: `id`. |
| `/api/plugins/:id/stop` | `POST` | Menghentikan backend engine plugin secara paksa (clean SIGKILL). | Path param: `id`. |
| `/api/plugins/:id/status` | `GET` | Memeriksa apakah backend plugin sedang berjalan beserta port aktifnya. | Path param: `id`. |
| `/api/events` | `GET` | Saluran Server-Sent Events (SSE) untuk memantau lifecycle plugin (*Attached/Detached*). | Stream event. |
| `/api/prompt-dispatch` | `POST` | Menginjeksi prompt secara atomik langsung ke chat yang sedang terbuka (Canvas UI & Antigravity IDE). | JSON: `{"prompt": "..."}` |
| `/api/dialog/default-dir` | `GET` | Mendapatkan path folder bawaan sistem pengguna (*Music, Downloads, Desktop, Home*). | Tidak ada. |
| `/api/dialog/save-file` | `GET` | Memunculkan dialog penyimpanan berkas native sistem operasi (*Save File Dialog*). | Query param: `?name=example.wav` |
| `/api/fs/save-file` | `POST` | Menulis data berkas (*Buffer / Base64*) langsung ke media penyimpanan fisik. | JSON: `{"targetPath": "...", "base64Data": "..."}` |

---

## 7. Langkah Demi Langkah Membuat Aplikasi / Plugin Baru Dari Nol

Berikut adalah Runbook & SOP baku bagi Agent AI atau Developer saat merancang dan membangun aplikasi/plugin baru di ekosistem X-Flow:

### Langkah 1: Tentukan Kategori & Scaffold Struktur Direktori
Pilih pola arsitektur aplikasi Anda:
- **Full-Stack Application** (Frontend GUI + Backend Microservice Engine) -> Direkomendasikan untuk aplikasi dengan I/O, file system, atau kalkulasi berat.
- **Client-Only Application** (Pure HTML5/CSS/JS/WASM) -> Cocok untuk visualizer murni, tools utilitas ringan, atau kalkulator.

Buat struktur direktori di dalam `xflow/plugins/<plugin-id>/`:
```bash
mkdir -p xflow/plugins/my-app/gui xflow/plugins/my-app/engine
```

### Langkah 2: Buat Paspor Kedaulatan `plugin.manifest.json`
Tulis berkas `xflow/plugins/my-app/plugin.manifest.json`:
```json
{
  "id": "my-app",
  "name": "My Sovereign App",
  "version": "1.0.0",
  "author": "Flowork Developer",
  "description": "High-efficiency utility plugin with active agent chat integration.",
  "category": "Tools",
  "icon": "⚡",
  "entry": {
    "gui": "gui/index.html",
    "backend": "engine/server.mjs"
  },
  "ipc": {
    "port_env": "FLOWORK_APP_PORT",
    "default_port": 17825
  }
}
```

### Langkah 3: Implementasikan Backend Engine (`engine/server.mjs`)
Backend wajib mendukung pembacaan port dinamis dan penanganan sinyal terminasi bersih (Zero-Zombie):
```javascript
import http from 'node:http';

// Tangkap port dinamis yang dialokasikan Host
const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17825', 10);
const HOST = '127.0.0.1';

// In-memory app state
let appState = { counter: 0, status: 'ready' };
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (_) { sseClients.delete(client); }
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // SSE Real-Time Stream
  if (req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // State Query
  if (req.url === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(appState));
  }

  // Action Endpoint (Dapat dipanggil oleh User di GUI maupun Agent via curl)
  if (req.url === '/api/increment' && req.method === 'POST') {
    appState.counter++;
    broadcast('update', appState);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, state: appState }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[my-app] Engine listening on http://${HOST}:${PORT}`);
});
```

### Langkah 4: Bangun Frontend GUI (`gui/index.html` & `gui/app.js`)
Antarmuka pengguna wajib menggunakan Bahasa Inggris formal, responsif, dan terhubung ke backend engine via port dinamis:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Sovereign App</title>
  <style>
    body {
      margin: 0; padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #080B11; color: #F8FAFC;
    }
    .card {
      background: #0F172A; border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 12px; padding: 24px; max-width: 520px;
    }
    .btn {
      background: #38BDF8; color: #080B11; border: none;
      padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer;
    }
    .btn:hover { opacity: 0.9; }
    .btn-dispatch {
      background: #A855F7; color: #FFFFFF; margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚡ My Sovereign App</h2>
    <p>Engine Port: <strong id="engine-port">Connecting...</strong></p>
    <p>Current Counter: <strong id="counter-val" style="font-size: 24px; color: #38BDF8;">0</strong></p>
    <button class="btn" id="btn-increment">Increment Counter</button>
    <button class="btn btn-dispatch" id="btn-ask-agent">Dispatch to Agent Chat</button>
  </div>

  <script>
    let enginePort = '17825';
    let currentUsername = 'awenkaudico';
    let lastDispatchedKey = '';
    let lastDispatchedTime = 0;

    async function init() {
      // 1. Ambil Real Username dari Paspor Auth Host (Dilarang Placeholder "User")
      try {
        const authRes = await fetch('/api/auth/status');
        if (authRes.ok) {
          const authData = await authRes.json();
          if (authData.user && authData.user.username) {
            currentUsername = authData.user.username;
            const elUser = document.getElementById('user-badge');
            if (elUser) elUser.textContent = `@${currentUsername}`;
          }
        }
      } catch (_) {}

      // 2. Dapatkan port dinamis dari Supervisor Core Host
      const res = await fetch('/api/plugins/my-app/launch', { method: 'POST' });
      const data = await res.json();
      if (data.port) {
        enginePort = data.port;
        document.getElementById('engine-port').textContent = `:${enginePort}`;
        connectEvents();
      }
    }

    function connectEvents() {
      const sse = new EventSource(`http://127.0.0.1:${enginePort}/api/events`);
      sse.addEventListener('update', (e) => {
        const state = JSON.parse(e.data);
        document.getElementById('counter-val').textContent = state.counter;
      });
    }

    // Aksi Klik Tombol Biasa
    document.getElementById('btn-increment').addEventListener('click', async () => {
      await fetch(`http://127.0.0.1:${enginePort}/api/increment`, { method: 'POST' });
    });

    // Aksi Injeksi Prompt ke Chat yang Sedang Terbuka (Menggunakan Real Username)
    document.getElementById('btn-ask-agent').addEventListener('click', () => {
      const currentVal = document.getElementById('counter-val').textContent;
      const prompt = `[MY-APP] ☕ Halo Mr. Flow AI! Gua @${currentUsername} lagi mantau counter aplikasi yang sekarang bernilai ${currentVal}.\n` +
        `Tolong analisis nilai ini dan naikkan nilainya dengan mengeksekusi curl:\n` +
        `curl -s -X POST http://127.0.0.1:${enginePort}/api/increment\n` +
        `Kelar eksekusi, panggil gua @${currentUsername} di chat dengan gaya warkop yang asik ya bro!`;

      dispatchPromptToActiveChat(prompt, `ask_counter_${currentVal}`);
    });

    // ── FUNGSI RESMI INJEKSI PROMPT BEBAS DUPLIKASI ──
    function dispatchPromptToActiveChat(promptText, actionKey) {
      const now = Date.now();
      if (lastDispatchedKey === actionKey && (now - lastDispatchedTime) < 3000) {
        console.log('[My-App] ⏳ Debounced duplicate prompt dispatch within 3000ms');
        return;
      }
      lastDispatchedKey = actionKey;
      lastDispatchedTime = now;

      // Single Unified Dispatch ke Host Core
      fetch('/api/prompt-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      }).catch(err => console.error('[My-App] Dispatch error:', err));
    }

    init();
  </script>
</body>
</html>
```

### Langkah 5: Tulis Dokumen Mandatori `SKILL.md` (Runbook Agent AI)
Wajib membuat berkas `xflow/plugins/my-app/SKILL.md` agar Agent AI sadar cara mengoperasikan plugin ini (lihat Bab 10).

### Langkah 6: Quality Control (QC) & Pembuktian Terminal (Exit Code 0)
1. Periksa integritas sintaksis JSON:
   ```bash
   node -e 'JSON.parse(fs.readFileSync("xflow/plugins/my-app/plugin.manifest.json"))'
   ```
2. Pastikan file server dapat dieksekusi mandiri tanpa syntax error (Exit Code 0).
3. Verifikasi ketersediaan aplikasi di katalog:
   ```bash
   curl -s http://127.0.0.1:19890/api/plugins | grep "my-app"
   ```

---

## 8. Tutorial Mendalam: Injeksi Prompt ke Chat Aktif (Prompt Injection Bridge)

### A. Mengapa Prompt Injection Dibutuhkan? (Arsitektur Dual-Sovereignty)
Dalam filosofi kedaulatan Flowork OS, sebuah aplikasi tidak boleh terisolasi menjadi "pulau mati". Ada 3 pola interaksi yang dimungkinkan:
1. **Mode Human Murni (0% AI)**: Pengguna memakai tombol/mouse di GUI seperti software desktop konvensional.
2. **Mode Agent Murni (100% AI)**: Agent mengeksekusi tugas analitik atau pemrosesan background via REST API tanpa membuka jendela antarmuka.
3. **Mode Hybrid Collaborative / Duel**: Pengguna melangkah di antarmuka (misal menggeser bidak catur di `Chess Arena`), dan aplikasi secara otomatis **mengirimkan notifikasi taktis FEN dan giliran langkah langsung ke chat yang sedang terbuka** tempat pengguna dan AI sedang berinteraksi! AI di chat membaca konteks, memberikan komentar, lalu mengeksekusi langkah balasan via API.

### B. Mekanisme Di Balik Layar (Under The Hood)
Bagaimana X-Flow Core menyuntikkan prompt ke jendela obrolan yang sedang aktif?
```
+-----------------------------------------------------------------------------------+
|                            GUI Plugin (iframe di Stage)                           |
|       User click / move action -> fetch('http://127.0.0.1:19890/api/prompt-dispatch')    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           X-Flow Core Host (Rust :19890)                          |
|         - Atomic Mutex Deduplication Guard (Tolak duplikasi <3000ms)               |
+--------------------+----------------------------------------------+---------------+
                     |                                              |
     (1. SSE Broadcast)                               (2. Background CDP Dispatch)
                     v                                              v
+-----------------------------------+             +----------------------------------+
|      Canvas UI Chat Sidebar       |             |     Google Antigravity IDE Chat  |
|       (canvas-ui/canvas.js)       |             |  - Baca DevToolsActivePort       |
|  - Menerima SSE 'PromptDispatched'|             |  - Connect WebSocket Debugger    |
|  - Menampilkan bubble chat di     |             |  - Native CDP Input.insertText   |
|    sidebar kanan antarmuka Canvas |             |  - Klik tombol kirim pesan       |
+-----------------------------------+             +----------------------------------+
```

### C. Anatomi Endpoint Host: `POST /api/prompt-dispatch`
- **URL**: `http://127.0.0.1:19890/api/prompt-dispatch` (atau `/api/chat/prompt-dispatch`)
- **Headers**: `Content-Type: application/json`
- **Body Payload**:
  ```json
  {
    "prompt": "[MY-APP] Pesan teks lengkap yang ingin disuntikkan ke chat"
  }
  ```
- **Response**:
  ```json
  {"status": "ok", "message": "Prompt dispatched directly to active chat."}
  ```
  Atau jika terjadi duplikasi cepat dalam 3 detik:
  ```json
  {"status": "ok", "debounced": true, "message": "Prompt debounced (identical duplicate)"}
  ```

### D. Eliminasi Total Bug "Satu Terkirim, Satu Masuk Pending"
Banyak developer pemula mengalami bug di mana sebuah aksi mengirimkan **dua prompt sekaligus**, sehingga pesan pertama diproses oleh model, dan pesan kedua berakhir tertumpuk di baki antrean (*pending tray*).

#### Akar Masalah:
1. **Dual Dispatch**: Frontend mengirim `window.parent.postMessage` DAN sekaligus memanggil `fetch('/api/prompt-dispatch')`.
2. **Race Condition**: Host memancarkan SSE dan menjalankan CDP sekaligus. Keduanya tiba di mesin chat hanya selisih 50–150 milidetik saat model AI sudah beralih ke status `isChatStreaming = true`. Akibatnya pesan kedua langsung dilempar masuk ke baki antrean antarmuka chat!

#### 4 Aturan Besi Mencegah Duplikasi:
1. **Haram Dual-Dispatch**:
   - Di dalam kode GUI plugin, **JANGAN** memanggil `window.parent.postMessage` jika sudah memanggil `fetch('/api/prompt-dispatch')`.
   - Gunakan satu pintu tunggal: `fetch('/api/prompt-dispatch')`. Host Core yang akan bertanggung jawab membagikannya ke Canvas UI dan IDE secara teratur.
2. **Client Move / Action Lock**:
   - Pasang boolean guard `let isExecuting = false` pada handler event untuk mencegah trigger berulang akibat double click mouse atau gesture touch cepat.
3. **Client Timestamp Debounce**:
   - Simpan `lastDispatchedKey` dan periksa `(Date.now() - lastDispatchedTime) < 3000`. Jika aksi identik terjadi dalam 3 detik, abaikan!
4. **Host & Dispatcher Busy Shield**:
   - Host Core dilengkapi atomic mutex yang menolak paket identik dalam 3000ms.
   - `prompt_dispatcher.mjs` dilengkapi detektor tombol *Cancel*. Jika giliran AI sebelumnya masih berpikir atau menulis output, script menunggu hingga turn selesai sebelum melakukan submit.

---

## 9. Gaya Bahasa Interaktif Agen: Protokol Warkop Banter

Dalam ekosistem Flowork OS, interaksi agen AI diatur oleh dua mode kesadaran:

1. **Mode Rekayasa / Diagnostik / Terminal (Engineering Mode)**:
   - Berlaku saat audit sistem, inspeksi kode, refaktorisasi, dan perbaikan bug.
   - Karakteristik: Dingin, lugas, jujur radikal, berbasis data empiris, zero flattery, dan pantang menjadi yes-man.
2. **Mode Interaktif / Gaming / Duel (Warkop Banter Protocol)**:
   - Berlaku saat duel interaktif dengan pengguna di antarmuka plugin (seperti `Chess Arena` atau mini games).
   - Karakteristik: **Santai, akrab, kocak, khas suasana tongkrongan warung kopi (warkop) Indonesia**:
     - Menyapa dengan santai: *"☕ Waduh bos! Sambil nyruput kopi item, rokok sebat di meja warkop nih!"*
     - Menarasikan langkah dengan seru: *"Gua (Putih) barusan geser bidak: f4 -> e5 nih! Giliran lu bales pukulan maut pake curl!"*
     - Membakar semangat kompetitif secara sehat tanpa arogansi kosong.

### Contoh Format Prompt Warkop untuk Injeksi Chat:
```javascript
const warkopBanter = [
  "☕ Santai dulu bos sambil nyruput kopi item warkop!",
  "☕ Rokok sebat, kopi kental udah siap di meja nih bos!",
  "☕ Tarik nafas, sruput kopi item dulu biar ga tremor tangannya!",
  "☕ Nongkrong di warkop sambil ngasah taktik, mantap betul bos!"
];
const greeting = warkopBanter[Math.floor(Math.random() * warkopBanter.length)];

const prompt = `[CHESS ARENA WARKOP] ♟️ ${greeting}\n` +
  `Gua (Human / Putih) barusan geser bidak: ${from} -> ${to} nih!\n` +
  `Posisi Papan Terkini (FEN): "${state.fen}"\n` +
  `Langkah ke-#${state.moveNumber} | Giliran lu nih bro: Hitam / Black (Mr. Flow AI).\n\n` +
  `Ayo giliran lu bales! Baca posisi papannya, sruput kopi lu, terus bales pukulan maut lu pake curl:\n` +
  `curl -s -X POST http://127.0.0.1:${enginePort}/api/move -H "Content-Type: application/json" -d '{"from": "<FROM>", "to": "<TO>", "comment": "..."}'\n\n` +
  `Kelar eksekusi curl, bales di chat pake gaya warkop yang asik & kocak ya bro! Gass!`;
```

---

## 10. Doktrin Mandatori Berkas `SKILL.md` per Plugin (Runbook AI)

### A. Mengapa Setiap Plugin Wajib Memiliki `SKILL.md`?
Tanpa berkas `SKILL.md`, AI Agent yang beroperasi di chat atau terminal akan **buta terhadap arsitektur plugin** dan rentan "sotoy" (berhalusinasi endpoint, salah menebak port, atau salah parameter curl).

Sistem X-Flow Core menyuntikkan Doktrin Kedaulatan ke dalam otak AI:
> **Setiap kali AI menerima instruksi terkait plugin, AI DIWAJIBKAN membaca `xflow/plugins/<plugin-id>/SKILL.md` terlebih dahulu sebelum mengeksekusi perintah apapun!**

### B. Format Standar Berkas `xflow/plugins/<id>/SKILL.md`:
```markdown
---
name: my-app
description: Sovereign microservice and real-time interactive utility for X-Flow
---

# ⚡ SKILL: MY SOVEREIGN APP

Panduan operasional bagi Agent AI untuk berinteraksi dengan plugin `my-app`.

## 1. Arsitektur & Port Dinamis
- Plugin ini berjalan sebagai Node.js/Python microservice pada port dinamis.
- Periksa port aktif plugin via Supervisor Host:
  \`\`\`bash
  curl -s http://127.0.0.1:19890/api/plugins/my-app/status
  \`\`\`

## 2. Katalog Endpoint REST API
- \`GET /api/state\`: Membaca kondisi data terkini.
- \`POST /api/increment\`: Menjalankan aksi kenaikan nilai.

## 3. Contoh Eksekusi Agent (Curl Runbook)
### Membaca status state:
\`\`\`bash
curl -s http://127.0.0.1:<PORT>/api/state
\`\`\`

### Menjalankan aksi balasan:
\`\`\`bash
curl -s -X POST http://127.0.0.1:<PORT>/api/increment -H "Content-Type: application/json"
\`\`\`
```

---

## 11. Registrasi ke App Store & Copilot Catalog (Pebble Store)

X-Flow dilengkapi App Store terintegrasi yang menyajikan kartu-kartu aplikasi (*Pebble Cards*):

### A. Alur Registri App Store (GitHub Upstream Exclusive):
1. **GitHub Upstream Registry**:
   Core Host memantau repositori resmi `flowork-os/FLOWAGENT-PLUGINS/plugins.json`. Seluruh kartu di tab App Store **hanya menyajikan aplikasi resmi yang diambil dari GitHub**.
2. **Resilient Offline Cache & Fallback**:
   Core Host (`core/src/copilot.rs`) menerapkan prinsip kedaulatan:
   - Jika koneksi internet atau token GitHub aktif, katalog terverifikasi diunduh dari GitHub dan disimpan ke `.registry_cache.json`.
   - Jika offline, Core Host memuat salinan terakhir dari `.registry_cache.json` atau fallback bawaan GitHub.
   - **Pemisahan Tegas Lokal vs App Store**: Plugin eksperimental lokal yang belum ada di GitHub tidak akan disuntikkan ke App Store. Plugin lokal tetap aktif di dock "Local Plugins" (`/api/plugins`), sedangkan App Store murni menampilkan ekstensi cloud dari GitHub.


### B. Mendaftarkan Plugin Baru ke App Store:
Agar aplikasi Anda muncul di App Store bagi pengguna lain:
1. Pastikan `plugin.manifest.json` lengkap dengan `id`, `name`, `description`, `version`, `category`, dan `icon`.
2. Lakukan commit plugin ke repositori plugin GitHub resmi dengan format co-author kedaulatan:
   ```
   Co-authored-by: Flowork OS <agent@floworkos.com>
   ```
3. Host akan mendeteksi commit SHA baru dan menampilkan badge pembaruan secara otomatis di UI.

---

## 12. Pantangan Mutlak (The Taboos) & Checklist Kedaulatan Final

1. **HARAM Hardcode Port**:
   Wajib membaca `$FLOWORK_APP_PORT` atau `$PORT`. Port statis memicu konflik jaringan fatal saat multi-instance berjalan.
2. **HARAM Meninggalkan Zombie Process**:
   Backend wajib keluar bersih saat Host mengirimkan sinyal SIGTERM/SIGKILL. Tidak boleh ada process leak di sistem operasi.
3. **HARAM Hardcode Path Absolut File**:
   Dilarang keras menulis path `/home/mrflow/...` atau `C:\Users\...`. Selalu gunakan path relatif atau API default directory Host.
4. **HARAM Menggunakan Bahasa Indonesia pada GUI**:
   Seluruh teks antarmuka grafis (UI), label, tombol, dan pesan error di layar **WAJIB menggunakan Bahasa Inggris formal**.
5. **HARAM Dual-Dispatch Prompt**:
   Pantang memanggil `window.parent.postMessage` dan `fetch('/api/prompt-dispatch')` secara bersamaan karena memicu bug duplikasi antrean pending.
6. **HARAM Menulis Kode Monolitik Raksasa**:
   Terapkan doktrin Nano-Modular: pecah logika menjadi berkas-berkas ringkas 20–80 baris.
7. **HARAM Membuat File Sampah di Root**:
   Seluruh skrip eksperimen atau file sementara wajib diisolasi di `.flowork_spam/` atau `.FLO_BIN/`.
8. **MANDATORI Bukti Empiris Exit Code 0**:
   Setiap perubahan atau pembuatan aplikasi baru HANYA DIAKUI SELESAI jika telah lolos pengujian terminal dengan status **Exit Code 0**.
9. **HARAM Menggunakan Placeholder Anonim ("User", "Human")**:
   Wajib mengambil dan menampilkan username kedaulatan asli dari `.flowork/auth_vault.json` (melalui Host API `/api/auth/status` atau Engine `/api/user`). Tidak ada kompromi menyembunyikan identitas Sang Pencipta atau Pengguna Kedaulatan di bawah label generik.


