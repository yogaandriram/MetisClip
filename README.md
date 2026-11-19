# MetisClip

MetisClip adalah aplikasi desktop Windows untuk membuat klip pendek vertikal (9:16) dari video panjang
seperti podcast, wawancara, dan talk show. Sumbernya bisa link YouTube atau file video di PC.

AI membaca seluruh transkrip, memilih momen terbaik, lalu memotongnya tepat di batas kalimat. Crop
mengikuti wajah, dan subtitle animasi bisa diedit per kata sebelum diekspor ke MP4. Klip juga bisa
mengikuti brief campaign dari agensi.

Semua proses berjalan di PC pengguna: unduhan, deteksi wajah, encoding, dan render. Database dan semua
video tersimpan di folder data pilihan pengguna. Yang lewat internet hanya panggilan AI (LLM, dan Groq
Whisper kalau key-nya diisi), YouTube, serta unduhan model sekali saja. Aplikasi tidak memposting ke
media sosial: hasil ekspor diunggah sendiri oleh pengguna.

## Struktur

| Folder | Isi |
|---|---|
| `desktop/` | Shell Electron: menjalankan MongoDB dan engine, menyajikan UI, dan installer NSIS |
| `frontend/` | UI Next.js 14 (static export) yang dimuat di dalam Electron |
| `backend/` | Engine FastAPI (sidecar): pipeline, API lokal, dan database MongoDB |
| `render-engine/` | Render worker Remotion untuk ekspor video dengan subtitle |
| `scripts/` | Skrip PowerShell: unduh binary bawaan, build engine, build installer |
| `docs/` | Kontrak antarbagian aplikasi (`desktop-contract.md`) |

## Prasyarat pengembangan

- Windows 10 22H2 atau Windows 11, x64
- Python 3.10
- Node.js 22 dan npm

Pengguna akhir tidak perlu memasang apa pun: installer sudah membawa Python (engine beku), Node
(Electron), FFmpeg, MongoDB, yt-dlp, dan whisper.cpp.

## Setup sekali

```powershell
python -m venv venv; .\venv\Scripts\activate
pip install -r backend/requirements.txt
cd frontend; npm install; cd ..
cd render-engine; npm install; npx remotion bundle src/index.ts --out-dir build; cd ..
cd desktop; npm install; cd ..
.\scripts\fetch-binaries.ps1      # mongod, ffmpeg, yt-dlp, deno, whisper.cpp -> desktop\resources\bin
```

## Menjalankan mode dev

```powershell
cd desktop; npm run dev
```

Perintah ini menjalankan `next dev` dan Electron. Electron lalu menjalankan MongoDB dan engine dengan
data dev di `%APPDATA%\MetisClip-Dev`. Untuk menjalankan engine saja dan membuka UI di browser biasa,
lihat `docs/desktop-contract.md` §8.

## API key

Jangan menaruh API key di file `.env` atau di kode. Semua key (LLM dan Groq) diisi di aplikasi, lewat
Setup Wizard atau menu Pengaturan, lalu disimpan di Windows Credential Manager. Engine tidak membaca key
dari environment variable, termasuk dalam mode dev.

## Tes

```powershell
pytest backend/tests                       # engine, memakai mongod.exe sementara
cd frontend; npx tsc --noEmit; cd ..       # tipe UI dan kamus bahasa
cd render-engine; npm run typecheck; cd ..
cd desktop; npx tsc --noEmit -p .; cd ..
```

## Build installer

```powershell
.\scripts\build-desktop.ps1          # -> desktop\dist\MetisClip-Setup-<versi>.exe
.\scripts\build-desktop.ps1 -Pack    # folder siap jalan (desktop\dist\win-unpacked), tanpa installer
```

Dokumentasi lain: `desktop/README.md` (shell Electron, installer, dan hook untuk pengujian) dan
`render-engine/README.md` (render worker).
