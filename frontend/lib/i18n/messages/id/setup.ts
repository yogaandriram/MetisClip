// Bahasa Indonesia: the source dictionary. Add every key in en/setup.ts too (tsc checks it).
// Setup Wizard (first run). The LLM/Whisper fields come from `settings`, the system check table from `system`.
export const setup = {
  steps: {
    welcome: 'Selamat datang',
    data: 'Lokasi data',
    keys: 'API key',
    check: 'Cek sistem',
    campaign: 'Campaign',
  },
  welcome: {
    eyebrow: 'Pengaturan awal',
    title: 'Selamat datang di MetisClip',
    intro:
      'MetisClip mencari video panjang (podcast, interview) di YouTube, memilih momen yang berpotensi viral dengan AI, lalu memotongnya menjadi klip vertikal 9:16 dengan subtitle yang bisa diedit. Semua data dan video disimpan di komputer Anda sendiri.',
    copyrightTitle: 'Hak cipta adalah tanggung jawab Anda',
    copyrightBody:
      'Video sumber di YouTube dimiliki kreatornya. Sebelum mengunggah klip, pastikan Anda punya izin dari pemilik konten atau penggunaan Anda termasuk penggunaan wajar (fair use) — misalnya dengan atribusi dan transformasi yang jelas — serta mematuhi Ketentuan Layanan YouTube dan platform tujuan. MetisClip tidak memberikan hak apa pun atas konten pihak ketiga.',
    accept: 'Saya memahami dan bertanggung jawab atas konten yang saya klip dan unggah menggunakan MetisClip.',
    start: 'Mulai pengaturan',
  },
  data: {
    title: 'Lokasi data',
    preparing: 'Menyiapkan folder data…',
    startingServices: 'Menyalakan database & engine…',
    connecting: 'Menghubungkan ke engine…',
    useFailed: 'Gagal memakai folder ini.',
    ready: 'Folder data siap dipakai',
    devManualHint: 'Jalankan engine secara manual dan atur NEXT_PUBLIC_ENGINE_URL / NEXT_PUBLIC_ENGINE_TOKEN (lihat frontend/.env.example).',
    pickDialogTitle: 'Pilih folder data MetisClip',
    browserSubtitle: 'Database, video sumber, dan klip disimpan di satu folder di komputer Anda.',
    /** The browser notice has the variable name (code) between these two parts */
    browserNoticeBefore:
      'Pemilihan folder data hanya tersedia di aplikasi desktop MetisClip. Halaman ini sedang dibuka di browser biasa (mode pengembang): engine memakai folder dari variabel',
    browserNoticeAfter: 'saat dijalankan manual.',
    continueDev: 'Lanjut (mode pengembang)',
    alreadySet: 'Folder data sudah diatur sebelumnya.',
    folder: 'Folder data',
    moveLaterHint: 'Memindahkan folder data dapat dilakukan nanti dari menu Sistem.',
    chooseTitle: 'Di mana MetisClip menyimpan data?',
    chooseSubtitle:
      'Database, video sumber, cache, dan semua klip akan disimpan di folder ini. Pilih drive dengan ruang kosong yang cukup — satu video podcast bisa memakan beberapa GB.',
    chooseFolder: 'Pilih folder…',
    freeSpace: 'Ruang kosong:',
    ofTotal: (total: string) => `dari ${total}`,
    existing: 'Folder ini sudah berisi data MetisClip — folder data yang sudah ada akan dipakai (tidak ada yang dihapus).',
    willCreate: 'Folder akan dibuat (atau dipakai) dan diisi struktur data MetisClip.',
    use: 'Gunakan folder ini',
  },
  keys: {
    title: 'API key',
    heading: 'Hubungkan layanan AI',
    subtitle:
      'API key disimpan aman di Windows Credential Manager, bukan di file biasa, dan bisa dilihat lagi lewat ikon mata. Anda bisa melewati langkah ini dan mengisinya nanti di Pengaturan.',
    transcription: 'Transkripsi',
    groqLabel: 'API key Groq (opsional)',
    groqDescription:
      'Tanpa key ini, transkripsi berjalan dengan Whisper lokal di komputer ini (modelnya diunduh sekali saat pertama dipakai). Dengan key Groq, yang bisa dibuat gratis di console.groq.com, transkripsi jauh lebih cepat saat online, dan Whisper lokal tetap menjadi cadangan saat offline.',
    skip: 'Lewati untuk sekarang',
    saveNext: 'Simpan & lanjut',
  },
  check: {
    title: 'Pemeriksaan sistem',
    subtitle: 'Memastikan semua komponen (database, FFmpeg, yt-dlp, renderer) siap dipakai di komputer ini.',
    problems: (n: number) =>
      `${n} komponen bermasalah. Anda tetap bisa melanjutkan, tetapi sebagian fitur mungkin gagal sampai masalahnya diperbaiki.`,
  },
  campaign: {
    title: 'Buat campaign pertama',
    subtitle:
      'Campaign menyimpan semua yang Anda buat di MetisClip: video yang diproses, klip, brief, dan brand template. Untuk channel sendiri cukup beri nama; brief dari agency bisa ditambahkan nanti. Begitu campaign dibuat, AI menyiapkan brand template pertamanya.',
    created: (name: string) => `Campaign "${name}" dibuat`,
    existing: (n: number) => `Anda sudah punya ${n} campaign di folder data ini.`,
    createStart: 'Buat & mulai',
    createNew: 'Buat campaign baru',
    goHome: 'Masuk ke Beranda',
  },
}
