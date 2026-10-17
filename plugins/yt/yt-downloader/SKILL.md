# 📹 YT-DOWNLOADER & SUNO STUDIO — PLUGIN SKILL
**Panduan Interaksi & Kolaborasi Media Extractor YouTube & Suno AI Anti-Copyright Studio**  
**Flowork Sovereign OS (floworkos.com)**

---

## 1. Peran & Deskripsi Plugin
- **Nama Plugin**: YouTube Downloader & Suno Studio (`yt-downloader`)
- **Fungsi Utama**: 
  1. Ekstraksi audio/video YouTube berkecepatan tinggi dengan `yt-dlp` native + fallback WebAssembly.
  2. **Pemilih Resolusi Video Tingkat Tinggi**: Mendukung **4K UHD (2160p)**, **2K QHD (1440p)**, **Full HD (1080p 60fps)**, **720p HD**, **480p SD**, atau **Best Available (Max Quality)** tanpa kompresi resolusi rendah.
  3. **Lossless Direct Stream Copy**: Pada mode Normal 1.0x, video disalin secara lossless tanpa re-encoding untuk kecepatan maksimal dan kualitas gambar 100% identik dengan sumber YouTube.
  4. **Fitur Khusus Suno AI (Anti-Copyright Bypass)**: Mode akselerasi otomatis memampatkan durasi audio/video menjadi **tepat 59 detik** menggunakan filter DSP FFmpeg `atempo` (pitch-preserved), sehingga lolos filter pemindaian hak cipta Suno AI.
  5. **Mode Normal**: Mengunduh audio/video dengan kecepatan 1.0x dan durasi asli.
  6. **Pilihan Format & Tipe Media**: Audio (MP3 320kbps, WAV Lossless, FLAC) atau Video (MP4 x264/AAC).
  7. **Custom Destination Folder**: Pemilih folder tujuan unduhan bebas via dialog native OS.

---

## 2. Alur Kolaborasi Human & AI
1. **User Mode (Human GUI)**:
   - Pengguna membuka tab `yt-downloader` di Canvas stage X-Flow.
   - Memasukkan URL YouTube dan klik **Analyze Media** (otomatis mendeteksi resolusi maksimal YouTube seperti 4K, 1440p, 1080p).
   - Memilih Mode: **Suno 59s Speed-Up** (Bypass Copyright) atau **Normal 1.0x**.
   - Memilih Tipe & Format: **Video MP4** atau **Audio MP3 / WAV / FLAC**.
   - Memilih Resolusi Video: **Best / 2160p / 1440p / 1080p / 720p / 480p**.
   - Memilih Folder Tujuan penyimpanan hasil unduhan.
   - Mengklik **Extract & Download**.
2. **AI Native Mode (Direct Agent Invocation)**:
   - Pengguna meminta: *"Bro download video ini kualitas 1080p Full HD ya: https://..."*
   - AI memanggil endpoint engine:
     1. Cek info & resolusi: `GET http://127.0.0.1:<PORT>/api/inspect?url=<URL>`
     2. Eksekusi: `POST http://127.0.0.1:<PORT>/api/download-stream` dengan payload:
        ```json
        {
          "url": "https://...",
          "mediaType": "video",
          "format": "mp4",
          "resolution": "1080",
          "speedMode": "normal",
          "targetFolder": "/home/mrflow/Downloads"
        }
        ```

---

## 3. Spesifikasi Endpoint API (Backend Engine)
- **`GET /health`**: Cek status engine, WebAssembly module, dan binary `yt-dlp`.
- **`GET /api/pick-folder`**: Membuka dialog native folder selector (Zenity / Tkinter / PowerShell / AppleScript).
- **`GET /api/inspect?url=<URL>`**: Ekstraksi metadata video (title, duration, author, thumbnail, list `resolutions`, dan `max_resolution`).
- **`POST /api/download-stream`**: Pipeline streaming SSE untuk proses unduh stream video/audio dengan resolusi spesifik, remux MP4, kalkulasi faktor akselerasi Suno 59s, dan penyimpanan.

---

## 4. Variabel Lingkungan & Port
- **Port Environment**: `FLOWORK_APP_PORT`
- **Default Fallback Port**: `17895`
