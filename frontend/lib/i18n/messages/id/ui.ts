// Bahasa Indonesia: the source dictionary. Add every key in en/ui.ts too (tsc checks it).
// Built-in text of the component library (frontend/components/ui).
export const ui = {
  confirm: 'Ya, lanjutkan',
  show: 'Tampilkan',
  hide: 'Sembunyikan',
  colorCode: 'Kode warna',
  decrease: 'Kurangi',
  increase: 'Tambah',
  progress: 'Progres',
  viralScore: 'Skor viral',
  viralScoreValue: (n: number) => `Skor viral ${n}`,
  recentColors: 'Terakhir dipakai',
  stepDone: 'Selesai',
  /** Top bar pill: "<n> proses berjalan" (the number is shown separately) */
  runningJobs: (_n: number) => `proses berjalan`,
  newClip: 'Klip baru',
  workspaceSwitcher: {
    loading: 'Memuat workspace…',
    choose: 'Pilih workspace',
    active: (name: string) => `Workspace aktif: ${name}. Ganti workspace`,
    heading: 'Workspace',
    empty: 'Belum ada workspace. Buat satu untuk mulai.',
    manage: 'Kelola workspace',
  },
  tags: {
    remove: (tag: string) => `Hapus ${tag}`,
    full: (n: number) => `Maksimal ${n} item`,
  },
}
