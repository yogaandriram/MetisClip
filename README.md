# MetisClip — Panduan Menjalankan Project

MetisClip adalah sistem **Agentic AI** premium yang otomatis mencari video panjang di YouTube, mendeteksi adegan paling viral, memotongnya menjadi Shorts format vertical 9:16, men-generate subtitle dinamis, dan menjadwalkan postingan secara otomatis.

---

## Prasyarat Pemasangan
Sebelum memulai, pastikan komputer Anda telah terpasang:
1. **Node.js** (Versi 18 ke atas) & **npm**
2. **Python** (Versi 3.10 ke atas) & **pip**
3. **FFmpeg** (opsional, sistem menggunakan Sandbox failover jika tidak ada)

---

## Langkah 1: API Key
Jangan isi kredensial apa pun di file `.env`. Semua API key (LLM dan Groq) diisi langsung di aplikasi desktop, lewat **Setup Wizard** saat pertama kali dibuka atau menu **Pengaturan**. Key disimpan di Windows Credential Manager, bukan di file project. Engine tidak membaca API key dari `.env`, juga dalam mode dev.

---

## Langkah 2: Menjalankan Backend API (FastAPI)
Buka terminal baru di direktori `c:\laragon\www\metisclip` lalu ketik perintah berikut:

```bash
# 1. Buat virtual environment Python
python -m venv venv

# 2. Aktifkan virtual environment (Windows PowerShell)
.\venv\Scripts\activate

# 3. Install semua dependensi library
pip install -r backend/requirements.txt

# 4. Jalankan server backend
python -m uvicorn backend.main:app --reload --port 8000
```
> Server backend kini aktif di: **`http://localhost:8000`**
>
> 📝 **Swagger API Docs** dapat diakses di: **`http://localhost:8000/docs`**

---

## Langkah 3: Menjalankan Frontend (Next.js 14)
Buka terminal kedua di direktori `c:\laragon\www\metisclip` lalu ketik perintah berikut:

```bash
# 1. Masuk ke folder frontend
cd frontend

# 2. Install semua dependensi Node.js
npm install

# 3. Jalankan server Next.js development
npm run dev
```
> Aplikasi web kini aktif di: **`http://localhost:3000`**

---

## Cara Mengakses Antarmuka Web
Buka browser pilihan Anda (seperti Chrome, Edge, atau Firefox) lalu buka alamat berikut:

* **Landing Page Utama**: [http://localhost:3000](http://localhost:3000) (Halaman awal bercahaya neon premium)
* **Pencarian AI & Tracker (Discover)**: [http://localhost:3000/discover](http://localhost:3000/discover) (Meluncurkan LangGraph Agentic Pipeline)
* **Hasil Pemotongan (Clip Gallery)**: [http://localhost:3000/clips](http://localhost:3000/clips) (Melihat video hasil potongan AI)
* **Subtitle Karaoke Editor**: [http://localhost:3000/clips/clip-uuid-1](http://localhost:3000/clips/clip-uuid-1) (Edit transkrip kata demi kata & style warna dinamis)
* **Visual Scheduler**: [http://localhost:3000/schedule](http://localhost:3000/schedule) (Kalender jam ramai traffic YouTube Shorts)
* **Pengaturan (Settings)**: [http://localhost:3000/settings](http://localhost:3000/settings) (Hubungkan ke kanal YouTube & input API Keys)
