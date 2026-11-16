// Bahasa Indonesia: the source dictionary. Add every key in en/clips.ts too (tsc checks it).
// Hasil Clip gallery (app/(dashboard)/clips).
export const clips = {
  title: 'Hasil Pemotongan Clip',
  subtitle: 'Klik salah satu clip untuk membuka editor subtitle.',
  /** Fills "… untuk mulai menggunakan {what}" in the no-workspace state */
  galleryName: 'galeri clip',
  loadFailed: 'Gagal memuat clip',
  deleted: 'Clip dihapus',
  desktopOnly: 'Hanya tersedia di aplikasi desktop',
  noVideoFile: 'File video belum tersedia',
  exportDialogTitle: 'Ekspor clip ke folder',
  exported: 'Clip diekspor',
  cannotExport: 'Clip belum bisa diekspor',
  emptyTitle: 'Belum ada clip',
  emptyDescription: 'Clip yang dihasilkan AI akan muncul di sini secara otomatis. Mulai dari menu Cari Video.',
  newClip: 'Klip baru',
  filterAria: 'Filter status clip',
  noneWithStatus: 'Tidak ada clip dengan status ini',
  noneWithStatusDescription: (status: string) => `Belum ada clip berstatus "${status}" untuk workspace ini.`,
  showAll: 'Tampilkan semua',
  openEditor: (hook: string, score: number, status: string, clock: string) => `Buka editor: ${hook} (skor viral ${score}, ${status}, durasi ${clock})`,
  edit: 'Edit',
  export: 'Ekspor',
  delete: 'Hapus clip',
  deleteModal: {
    title: 'Hapus clip ini?',
    message: 'Clip beserta file videonya (mentah & hasil render) akan dihapus permanen dari folder data. Tindakan ini tidak bisa dibatalkan.',
    confirm: 'Hapus permanen',
  },
}
