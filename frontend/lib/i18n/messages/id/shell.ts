// Bahasa Indonesia: the source dictionary. Add every key in en/shell.ts too (tsc checks it).
// App shell: navigation, engine connection, language choice, top-level pages.
export const shell = {
  nav: {
    dashboard: 'Beranda',
    discover: 'Cari Video',
    clips: 'Hasil Clip',
    brand: 'Brand Template',
    settings: 'Pengaturan',
    system: 'Sistem',
    label: 'Navigasi utama',
    /** Screen reader name of a nav item with running jobs */
    withRunning: (name: string, n: number) => `${name}, ${n} berjalan`,
  },
  systemHint: {
    dbProblem: 'Database bermasalah',
    engineActive: 'Engine lokal aktif',
  },
  logoHome: 'MetisClip, ke Beranda',
  /** The profile circle at the top of the shell: the active campaign and its menu */
  campaignMenu: {
    label: 'Menu campaign',
    button: (name: string) => `Campaign aktif: ${name}. Buka menu campaign`,
    buttonEmpty: 'Belum ada campaign aktif. Buka menu campaign',
    loading: 'Memuat campaign…',
    empty: 'Belum ada campaign aktif. Buat satu untuk mulai.',
    active: 'Campaign aktif',
    plain: 'Tanpa brief',
    briefed: 'Dengan brief',
    switchTo: 'Ganti ke',
    create: 'Campaign baru',
    manage: 'Kelola campaign',
  },
  loadingApp: 'Memuat MetisClip…',
  notFound: {
    message: 'Halaman tidak ditemukan.',
    backHome: 'Kembali ke Beranda',
  },
  engine: {
    connecting: 'Menghubungkan ke engine MetisClip…',
    failedToStart: 'Engine MetisClip gagal dijalankan.',
    devHint: (base: string) => `Pastikan engine berjalan di ${base} (lihat frontend/.env.example).`,
    stopped: 'Engine MetisClip berhenti.',
    unreachableTitle: 'Engine MetisClip tidak dapat dihubungi',
    unreachableFallback: 'Terjadi kesalahan saat menyalakan engine lokal.',
    relaunch: 'Mulai ulang aplikasi',
    bannerStopped: 'Engine berhenti.',
    bannerRestarting: 'Engine sedang dimulai ulang…',
    notReady: 'Engine belum siap',
    cannotConnect: 'Tidak dapat terhubung ke engine MetisClip',
    requestFailed: (status: number) => `Permintaan gagal (HTTP ${status})`,
  },
  campaignsLoadFailed: 'Gagal memuat daftar campaign',
  language: {
    label: 'Bahasa tampilan',
    hint: 'Bahasa menu, tombol dan pesan di aplikasi. Bahasa video dan subtitle tidak berubah.',
    changed: 'Bahasa tampilan diganti ke Bahasa Indonesia',
  },
  /** Shown while the PC has no network (§9.3) */
  offline: {
    title: 'Kamu sedang offline.',
    body: 'Mengedit dan mengekspor clip tetap bisa. Mengunduh video YouTube dan fitur AI butuh internet.',
    dismiss: 'Tutup pemberitahuan offline',
  },
  /** Windows notifications while the window is in the background (§9.3, ShellContext.tsx) */
  notify: {
    jobDone: (n: number) => `Job selesai: ${n} klip siap`,
    jobDoneNone: 'Job selesai tanpa klip',
    jobFailed: 'Job gagal',
    renderDone: 'Ekspor video selesai',
    renderSavedIn: (folder: string) => `Tersimpan di ${folder}`,
    renderNotCopied: 'Videonya selesai, tapi belum tersalin ke folder ekspor. Buka clip-nya untuk mencoba lagi.',
    renderFailed: 'Ekspor video gagal',
  },
}
