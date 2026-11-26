// Bantuan: the first-steps guide on Beranda and the help page. Topic ids are fixed in
// app/(dashboard)/help/page.tsx (groups, links) and in `?topic=<id>` links.
export const help = {
  title: 'Bantuan',
  subtitle: 'Cara memakai MetisClip, dan jalan keluar kalau ada yang tidak berjalan.',
  /** The top bar's help button (F1 opens it too) */
  open: 'Bantuan (F1)',
  searchLabel: 'Cari di bantuan',
  searchPlaceholder: 'Cari, misalnya "yt-dlp" atau "ekspor"',
  clearSearch: 'Hapus pencarian',
  searchEmpty: (query: string) => `Tidak ada topik yang cocok dengan "${query}".`,
  searchCount: (n: number) => `${n} topik cocok`,

  firstSteps: {
    title: 'Langkah pertama',
    welcomeTitle: 'Selamat datang di MetisClip',
    progress: (done: number, total: number) => `${done} dari ${total} langkah selesai`,
    done: 'Selesai',
    hide: 'Sembunyikan panduan',
    hidden: 'Panduan disembunyikan. Langkah-langkahnya tetap ada di Bantuan (F1).',
    openHelp: 'Buka Bantuan',
    allDone: 'Semua langkah selesai. Clip berikutnya tinggal diulang dari Cari Video.',
    steps: {
      campaign: {
        title: 'Buat campaign',
        text: 'Campaign menampung job, clip, dan brand template. Campaign pertamamu dibuat di Setup Wizard.',
        action: 'Kelola campaign',
      },
      ai: {
        title: 'Hubungkan AI',
        text: 'Isi API key LLM di Pengaturan, lalu klik Tes. AI memakainya untuk memilih momen terbaik.',
        action: 'Buka Pengaturan',
      },
      job: {
        title: 'Mulai job pertama',
        text: 'Tempel link YouTube atau pilih file video di Cari Video. AI memilih momen terbaik dan memotongnya jadi clip 9:16.',
        action: 'Buka Cari Video',
      },
      clip: {
        title: 'Periksa clip',
        text: 'Clip muncul di Hasil Clip begitu jadi. Buka di editor untuk merapikan subtitle, gaya caption, dan layout.',
        running: 'Job sedang berjalan. Clip muncul di Hasil Clip begitu jadi.',
        action: 'Buka Hasil Clip',
      },
      export: {
        title: 'Ekspor clip',
        text: 'Klik Ekspor di editor. Video MP4 masuk ke folder ekspor, siap kamu unggah sendiri ke TikTok, Reels, atau Shorts.',
        action: 'Buka Hasil Clip',
      },
    },
  },

  groups: {
    start: 'Membuat clip',
    campaign: 'Campaign dan brief',
    edit: 'Mengedit dan mengekspor',
    trouble: 'Kalau ada masalah',
    data: 'Data dan privasi',
  },

  links: {
    discover: 'Buka Cari Video',
    queue: 'Buka Antrian',
    clips: 'Buka Hasil Clip',
    campaigns: 'Kelola campaign',
    brand: 'Buka Brand Template',
    settings: 'Buka Pengaturan',
    system: 'Buka Sistem',
    about: 'Tentang MetisClip',
  },

  topics: {
    how: {
      q: 'Bagaimana MetisClip membuat clip?',
      a: [
        'Tempel link YouTube atau pilih file video di Cari Video, pilih campaign-nya, lalu mulai proses.',
        'MetisClip membaca seluruh transkrip video. AI mengusulkan momen yang kuat dan memberinya skor viral, lalu tiap momen dipotong jadi video 9:16 yang mengikuti wajah, lengkap dengan subtitle per kata.',
        'Pemotongan, pelacakan wajah, dan render berjalan di PC kamu. Yang dikirim ke AI hanya teks transkripnya.',
      ],
    },
    sources: {
      q: 'Video apa saja yang bisa dipakai?',
      a: [
        'Link YouTube video panjang, misalnya podcast, wawancara, atau talk show. Kamu bisa menempel beberapa link sekaligus, atau mengambil video dari playlist (sampai 50 video); tiap video menjadi job sendiri.',
        'File video di PC: MP4, MKV, MOV, WEBM, M4V, atau AVI. File dipakai di tempatnya tanpa disalin, jadi jangan dipindahkan sebelum job selesai.',
      ],
    },
    manual: {
      q: 'Bisakah memilih momennya sendiri?',
      a: [
        'Bisa. Di Cari Video pilih "Pilih momen sendiri", lalu ketik waktu mulai dan selesai tiap momen (sampai 20 momen).',
        'Clip yang sudah jadi bisa dipotong ulang lewat "Ubah potongan" di editor. Gaya, template, judul, dan editan subtitle-nya tetap.',
      ],
    },
    again: {
      q: 'Bagaimana mendapat clip lain dari video yang sama?',
      a: ['Klik "Cari klip lagi" di halaman job atau di Antrian. Momen yang sudah menjadi clip di campaign itu dilewati, jadi hasilnya momen baru.'],
    },
    time: {
      q: 'Berapa lama satu job?',
      a: [
        'Tergantung transkripnya. Video YouTube yang punya subtitle langsung dianalisis. File upload dan video tanpa subtitle ditranskripsi dulu: dengan API key Groq hanya beberapa detik, dengan Whisper lokal di laptop kira-kira setengah durasi videonya.',
        'Setelah itu tiap clip diunduh, dilacak wajahnya, dan diberi subtitle. Pantau semuanya di Antrian. MetisClip boleh diminimalkan selama job berjalan.',
      ],
    },
    campaign: {
      q: 'Apa itu campaign?',
      a: [
        'Campaign adalah wadah semua job dan clip. Tiap campaign punya folder clip, brand template, dan brief dari agensi kalau ada.',
        'Campaign tanpa brief cocok untuk channel sendiri: clip dipilih dari skor viral saja. Ganti campaign aktif lewat lingkaran profil di kiri atas.',
      ],
    },
    brief: {
      q: 'Bagaimana memakai brief dari agensi?',
      a: [
        'Di halaman campaign, tempel teks brief, tambahkan file PDF atau DOCX, atau tempel screenshot, lalu klik "Pahami brief". Periksa hasil bacaan AI dan pertanyaan yang belum terjawab, lalu simpan.',
        'Job berikutnya memilih momen yang sesuai brief, dan tiap clip mendapat checklist serta teks posting. Kalau hanya sedikit momen yang memenuhi brief, MetisClip membuat lebih sedikit clip, bukan clip yang melanggar brief.',
      ],
    },
    template: {
      q: 'Bagaimana mengatur tampilan clip?',
      a: [
        'Di Brand Template: gaya caption dan posisinya, layout (layar penuh, podcast, kartu, dua pembicara, atau otomatis per adegan), dan logo. AI membuatkan template pertama untuk tiap campaign baru.',
        'Perubahan di editor clip hanya berlaku untuk clip itu. Template berlaku untuk semua clip yang memakainya.',
      ],
    },
    words: {
      q: 'Bagaimana memperbaiki subtitle?',
      a: [
        'Buka clip di editor. Klik kartu kata untuk melompat ke waktunya, lalu ubah teks atau waktunya. Ctrl+F mencari dan mengganti kata, dan menu "…" di tiap kata bisa memecah atau menggabungkan kata.',
        'Kata yang waktunya bermasalah ditandai, dan "Rapikan waktu" membereskan semuanya. Ctrl+Z membatalkan, Ctrl+S menyimpan.',
      ],
    },
    export: {
      q: 'Di mana file hasil ekspor?',
      a: [
        'Klik Ekspor (Ctrl+E) di editor, atau pilih beberapa clip di Hasil Clip lalu "Render & ekspor". Video dirender dengan subtitle lalu disalin ke folder ekspor (Pengaturan, Folder ekspor).',
        'Di sebelah MP4 ada .jpg kalau kamu memilih sampul, dan .txt berisi teks posting untuk clip campaign. Clip yang tidak berubah sejak render terakhir langsung disalin lagi tanpa render.',
        'Clip yang sudah dirender juga bisa diseret dari Hasil Clip ke Explorer atau aplikasi lain. Di Antrian, "Buka folder hasil ekspor" membuka folder video terbaru dari sebuah job.',
      ],
    },
    post: {
      q: 'Bagaimana mengunggah ke TikTok, Reels, atau Shorts?',
      a: [
        'MetisClip tidak memposting dan tidak terhubung ke akun media sosial. Unggah file dari folder ekspor lewat aplikasi atau situs platformnya.',
        'Teks posting ada di tab Campaign di editor, dan "Salin kredit" di bagian Sumber video menyalin nama channel beserta link-nya.',
      ],
    },
    formats: {
      q: 'Bisakah mengekspor selain 9:16, atau dalam bahasa lain?',
      a: [
        'Format video di editor mengubah clip itu ke 9:16, 1:1, atau 16:9. Kualitas ekspor (Tinggi, Standar, Hemat) diatur di Pengaturan.',
        'Bagian Terjemahan di editor menerjemahkan subtitle dan judul ke 10 bahasa, dengan waktu yang mengikuti ucapan.',
      ],
    },
    youtube: {
      q: 'Video YouTube gagal diunduh',
      a: [
        'YouTube sering mengubah sistemnya. Buka Sistem dan klik "Update yt-dlp" (MetisClip juga memeriksanya sekali sehari).',
        'Kalau muncul pesan "Sign in to confirm you\'re not a bot", pilih file cookies YouTube di Pengaturan, atau coba player client lain di bagian lanjutan.',
      ],
    },
    ai: {
      q: 'AI gagal memilih momen, atau kuotanya habis',
      a: [
        'Periksa API key di Pengaturan dengan tombol "Tes". Kalau kuota harian habis, tunggu sampai pulih (pesan job menyebut perkiraannya) atau pilih model lain.',
        'Job yang berhenti bisa dilanjutkan dari Antrian dengan "Lanjutkan". Bagian yang sudah selesai tidak diulang.',
      ],
    },
    slow: {
      q: 'Prosesnya lambat, atau "Menunggu RAM"',
      a: [
        '"Menunggu RAM" berarti MetisClip menahan langkah berat sampai RAM cukup, supaya PC tetap lancar. Tutup aplikasi lain yang berat, atau tunggu sebentar.',
        'Transkripsi dengan Whisper lokal memakan CPU. Isi API key Groq di Pengaturan supaya transkripsi selesai dalam hitungan detik.',
      ],
    },
    stopped: {
      q: 'Job berhenti di tengah jalan',
      a: [
        'Kalau MetisClip ditutup atau PC mati saat job berjalan, job-nya terhenti. Klik "Lanjutkan" di Antrian; clip yang sudah jadi tidak dibuat ulang.',
        'Kalau sebagian clip gagal, "Ulangi klip gagal" di Antrian hanya membuat ulang clip itu.',
      ],
    },
    disk: {
      q: 'Ruang disk hampir penuh',
      a: [
        'Di bawah 2 GB ruang kosong, MetisClip tidak memulai job atau ekspor baru, dan job yang berjalan berhenti sebelum potongan berikutnya.',
        'Di Sistem kamu bisa mengosongkan cache, melihat ukuran tiap campaign, atau memindahkan folder data ke drive lain. Lanjutkan job-nya setelah ruangnya cukup.',
      ],
    },
    report: {
      q: 'Masih bermasalah?',
      a: [
        'Buka Tentang MetisClip di Sistem dan klik "Salin info sistem". Teksnya berisi versi, komponen, dan pengaturan, tanpa API key.',
        'Sertakan teks itu dan file log ("Buka folder log") saat melaporkan masalah.',
      ],
    },
    where: {
      q: 'Di mana data saya disimpan?',
      a: [
        'Semua ada di folder data yang kamu pilih saat setup: database, clip, cache, backup, dan model Whisper. Lokasinya terlihat di Sistem.',
        'Database dicadangkan otomatis tiap hari, dan "Pulihkan" di Sistem mengembalikan cadangan. "Pindahkan lokasi data" memindahkan semuanya ke folder lain.',
      ],
    },
    privacy: {
      q: 'Apa yang dikirim ke internet?',
      a: [
        'Teks transkrip dan brief dikirim ke penyedia AI pilihanmu. Audio dikirim ke Groq hanya kalau API key Groq diisi. Video diunduh dari YouTube lewat yt-dlp.',
        'Video dan clip tidak pernah diunggah. API key disimpan di Windows Credential Manager, bukan di file.',
      ],
    },
    rights: {
      q: 'Bagaimana dengan hak cipta?',
      a: [
        'Kamu bertanggung jawab memastikan boleh memakai ulang video orang lain. Cantumkan sumbernya: "Salin kredit" di editor, atau kredit sumber di layout podcast dan kartu.',
      ],
    },
  },

  shortcuts: {
    title: 'Pintasan keyboard',
    help: 'Buka Bantuan',
    editor: 'Di editor clip',
  },
  support: {
    title: 'Masih bermasalah?',
    text: 'Salin info sistem di Tentang MetisClip (tanpa API key), lalu sertakan bersama file log saat melaporkan masalah.',
    about: 'Tentang MetisClip',
    openLogs: 'Buka folder log',
  },
}
