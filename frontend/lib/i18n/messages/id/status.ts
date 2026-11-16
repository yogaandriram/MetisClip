// Bahasa Indonesia: the source dictionary. Add every key in en/status.ts too (tsc checks it).
// Job, clip and render states and the other labels in lib/format.ts.
export const status = {
  job: {
    pending: 'Menunggu',
    running: 'Berjalan',
    interrupted: 'Terputus',
    cancelled: 'Dibatalkan',
    completed: 'Selesai',
    failed: 'Gagal',
  },
  clip: {
    processing: 'Diproses',
    ready: 'Siap',
    rendering: 'Dirender',
    exported: 'Diekspor',
    failed: 'Gagal',
  },
  /** Short render badge */
  renderBadge: {
    queued: 'Antri render',
    rendering: 'Merender',
    completed: 'Selesai',
    failed: 'Gagal',
    cancelled: 'Dibatalkan',
  },
  /** Longer render progress line */
  render: {
    queued: 'Menunggu antrian render…',
    rendering: 'Membakar subtitle ke video…',
    completed: 'Video selesai dirender',
    failed: 'Render gagal',
    cancelled: 'Render dibatalkan',
  },
  steps: {
    discovery: 'Mencari video sumber di YouTube',
    analysis: 'Menganalisis transkrip & memilih momen viral',
    processing: 'Memotong klip, crop wajah & membuat subtitle',
    waiting: 'Menunggu antrian',
  },
  durations: {
    '30-45': '30 - 45 detik (Ultra Short)',
    '45-60': '45 - 60 detik (Shorts/Reels)',
    '60-75': '60 - 75 detik (Story)',
    '75-90': '75 - 90 detik (Deep-dive)',
  },
  source: { file: 'File', link: 'Link' },
  /** Compact numbers: 1,2 rb / 3,4 jt */
  thousandSuffix: 'rb',
  millionSuffix: 'jt',
}
