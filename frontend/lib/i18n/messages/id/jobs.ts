// Bahasa Indonesia: the source dictionary. Add every key in en/jobs.ts too (tsc checks it).
// Antrian (the queue tab of Hasil Clip, app/(dashboard)/clips) and job texts shared with Beranda and Cari Video.
export const jobs = {
  /** Short pipeline step names for the pills (DESIGN.md §8.9) */
  stepShort: {
    discovery: 'Discovery',
    analysis: 'Analisis',
    processing: 'Proses',
  },
  progressLabel: 'Progres job',
  loadFailed: 'Gagal memuat antrian',
  resumed: 'Job dilanjutkan',
  /** A completed job whose clips partly failed: process only those again */
  retryFailed: (n: number) => `Ulangi ${n} klip gagal`,
  retryStarted: 'Klip yang gagal diproses ulang',
  again: 'Cari klip lagi',
  againTip: 'Job baru untuk video ini dengan pengaturan yang sama. Momen yang sudah jadi klip di campaign-nya dilewati.',
  againStarted: 'Job baru dimulai: mencari momen lain dari video ini',
  cancelled: 'Job dibatalkan',
  deleted: 'Job dihapus',
  /** "45-60 detik · maks. 3 klip"; max 0 = unlimited */
  config: (duration: string, max: number) => `${duration} detik · maks. ${max || '∞'} klip`,
  createdAt: (date: string) => `dibuat ${date}`,
  configManual: (n: number) => `${n} momen pilihan sendiri`,
  configRecut: 'Potong ulang klip',
  openClip: 'Buka klip',
  emptyTitle: 'Antrian kosong',
  emptyDescription: 'Belum ada job. Tempel link YouTube atau upload video di menu Cari Video.',
  needsAction: 'Perlu tindakan',
  running: 'Sedang berjalan',
  history: 'Riwayat',
  resume: 'Lanjutkan',
  detail: 'Detail',
  detailAria: 'Detail job',
  cancel: 'Batalkan',
  delete: 'Hapus job',
  /** What a finished job made (gap analysis B12) */
  output: (clips: number, exported: number) => (exported ? `${clips} klip, ${exported} sudah diekspor` : `${clips} klip, belum diekspor`),
  viewClips: 'Lihat klip job ini',
  openOutput: 'Buka folder hasil ekspor',
  openOutputFailed: 'Folder hasil ekspor tidak bisa dibuka',
  stoppedAt: (step: string) => `Terhenti di langkah: ${step}.`,
  progressClips: (done: number, total: number) => `${done}/${total} klip`,
  activity: 'Sedang berjalan',
  columns: {
    status: 'Status',
    source: 'Sumber',
    settings: 'Pengaturan',
    created: 'Dibuat',
    actions: 'Aksi',
  },
  cancelModal: {
    title: 'Batalkan job ini?',
    message: 'Proses akan dihentikan. Klip yang sudah selesai tetap tersimpan, dan job bisa dilanjutkan lagi nanti.',
    confirm: 'Batalkan job',
  },
  deleteModal: {
    title: 'Hapus job dari antrian?',
    message: 'Riwayat job ini akan dihapus. Klip yang sudah dihasilkan tidak ikut terhapus.',
    confirm: 'Hapus job',
  },
}
