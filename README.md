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

- Windows 11 x64. Windows 10 22H2 bisa dipakai tetapi tidak diuji, dan MongoDB 8.0 yang dibundel
  secara resmi hanya mendukung Windows 11 dan Windows Server 2022.
- CPU dengan AVX (syarat MongoDB)
- Python 3.10
- Node.js 22 dan npm

Pengguna akhir tidak perlu memasang apa pun: installer sudah membawa Python (engine beku), Node
(Electron), FFmpeg, MongoDB, yt-dlp, deno, whisper.cpp, dan Chrome Headless Shell untuk render.

## Setup sekali

```powershell
python -m venv venv; .\venv\Scripts\activate
pip install -r backend/requirements.txt
cd frontend; npm install; cd ..
cd render-engine; npm install; npm run build; npm run browser:ensure; cd ..
cd desktop; npm install; cd ..
.\scripts\fetch-binaries.ps1      # mongod, yt-dlp, deno, whisper.cpp -> desktop\resources\bin
```

- `npm run build` di `render-engine` membuat bundle Remotion (`build\`) dan render worker
  (`dist\render.js`). Tanpa keduanya ekspor video gagal, dan Sistem menulis "render-engine/dist/render.js
  belum di-build".
- `npm run browser:ensure` mengunduh Chrome Headless Shell yang dipakai Remotion saat dev ke
  `render-engine\node_modules\.remotion\`. Installer tidak memakai salinan ini:
  `build-desktop.ps1` mengunduh zip resminya sendiri dan mencocokkan SHA256-nya.
- `fetch-binaries.ps1` tidak mengunduh FFmpeg. Saat dev, engine memakai FFmpeg dari paket Python
  `imageio-ffmpeg`. Untuk installer, `build-engine.ps1` menyalinnya ke `desktop\resources\bin` setelah
  SHA256-nya dicocokkan.
- Ulangi `npm run build` di `render-engine` setiap kali preset subtitle atau layout di
  `frontend/lib/presets` berubah, karena render memakai bundle yang sudah di-build.

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

## Lisensi dan kredit

MetisClip dirilis dengan lisensi MIT (`LICENSE`). Installer-nya juga membawa perangkat lunak pihak ketiga,
masing-masing dengan lisensinya sendiri. Daftar lengkapnya ada di `THIRD_PARTY_NOTICES.md`,
dan teks lisensinya bisa dibaca di aplikasi lewat Sistem → Tentang MetisClip → Lisensi pihak ketiga.

MetisClip dibangun di atas proyek open source berikut. Terima kasih kepada para pembuatnya. Nama-nama di
bawah disebut sebagai kredit, bukan sebagai dukungan dari pemilik proyek tersebut.

| Proyek | Dipakai untuk | Lisensi |
|---|---|---|
| [Remotion](https://www.remotion.dev) | Render video dengan subtitle dan layout | Remotion License |
| [FFmpeg](https://ffmpeg.org) | Memotong dan meng-encode video, menyamakan volume suara | GPL v3 (build [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)); GPL v2 atau lebih baru (build Remotion) |
| [fdk-aac-free](https://src.fedoraproject.org/rpms/fdk-aac-free) (Fraunhofer FDK AAC) | Audio AAC di FFmpeg milik Remotion | FDK AAC License |
| [MongoDB Community Server](https://www.mongodb.com) | Database lokal | SSPL |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) dan [Deno](https://deno.com) | Metadata dan unduhan YouTube | Unlicense, MIT |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Transkripsi tanpa internet | MIT |
| [MediaPipe](https://ai.google.dev/edge/mediapipe) dan [OpenCV](https://opencv.org) | Deteksi wajah untuk crop | Apache 2.0 |
| [Electron](https://www.electronjs.org) dan [Chrome Headless Shell](https://developer.chrome.com/blog/chrome-headless-shell) | Aplikasi desktop, browser untuk render | MIT, BSD-3-Clause dan lainnya |
| [Next.js](https://nextjs.org) dan [React](https://react.dev) | Tampilan aplikasi | MIT |
| [FastAPI](https://fastapi.tiangolo.com), [PyMongo](https://pymongo.readthedocs.io), [Python](https://www.python.org) dan [PyInstaller](https://pyinstaller.org) | Engine lokal | MIT, Apache 2.0, PSF, GPL v2 dengan pengecualian bootloader |

Yang perlu diketahui:

- **Remotion License** gratis untuk perorangan, perusahaan dengan paling banyak 3 karyawan, dan organisasi
  nirlaba. Perusahaan yang lebih besar dan merender dengan MetisClip memerlukan
  [Company License](https://www.remotion.pro/license) dari Remotion.
- **FFmpeg** ikut dalam dua build: `ffmpeg.exe` dari gyan.dev (GPL v3) yang dijalankan MetisClip, dan build
  milik Remotion di dalam paket compositor-nya (GPL v2 atau lebih baru, dengan fdk-aac-free untuk AAC).
  Keduanya program terpisah yang tidak ditautkan ke kode MetisClip. Lokasi kode sumber masing-masing ada di
  `THIRD_PARTY_NOTICES.md`. Lisensi FDK AAC tidak memberi hak paten apa pun.
- **MongoDB** dibundel tanpa diubah, bersama teks lisensinya.
