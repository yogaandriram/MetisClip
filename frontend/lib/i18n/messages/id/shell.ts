// Bahasa Indonesia: the source dictionary. Add every key in en/shell.ts too (tsc checks it).
// App shell: navigation, engine connection, language choice, top-level pages.
export const shell = {
  nav: {
    dashboard: 'Beranda',
    discover: 'Cari Video',
    jobs: 'Antrian',
    clips: 'Hasil Clip',
    brand: 'Brand Template',
    settings: 'Pengaturan',
    system: 'Sistem',
    /** Screen reader name of a nav item with running jobs */
    withRunning: (name: string, n: number) => `${name}, ${n} berjalan`,
  },
  systemHint: {
    dbProblem: 'Database bermasalah',
    engineActive: 'Engine lokal aktif',
  },
  logoHome: 'MetisClip, ke Beranda',
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
  workspacesLoadFailed: 'Gagal memuat daftar workspace',
  language: {
    label: 'Bahasa tampilan',
    hint: 'Bahasa menu, tombol dan pesan di aplikasi. Bahasa video dan subtitle tidak berubah.',
    changed: 'Bahasa tampilan diganti ke Bahasa Indonesia',
  },
}
