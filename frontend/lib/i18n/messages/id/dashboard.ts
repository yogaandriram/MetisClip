// Bahasa Indonesia: the source dictionary. Add every key in en/dashboard.ts too (tsc checks it).
// Beranda (app/(dashboard)/dashboard).
export const dashboard = {
  title: 'Beranda',
  subtitle: 'Ringkasan aktivitas agentic AI.',
  summaryLoading: 'Memuat ringkasan…',
  summaryUnavailable: 'Ringkasan belum bisa dimuat.',
  /** "{clips}, {jobs}." */
  summary: (clips: string, jobs: string) => `${clips}, ${jobs}.`,
  readyClips: (n: number) => `${n} klip siap ekspor`,
  noReadyClips: 'Belum ada klip siap ekspor',
  runningJobs: (n: number) => `${n} proses berjalan`,
  noRunningJobs: 'tidak ada proses berjalan',
  loadFailed: 'Gagal memuat ringkasan',
  keys: {
    title: 'API key belum lengkap',
    openSettings: 'Buka Pengaturan',
    groq: 'API key Groq',
    llm: (provider: string) => `API key ${provider}`,
    /** names: e.g. ["API key OpenAI", "API key Groq"] */
    missing: (names: string[]) => `${names.join(' dan ')} belum diisi. Pipeline AI tidak akan berjalan tanpa key ini.`,
  },
  stats: {
    readyClips: 'Klip siap ekspor',
    videosProcessed: 'Video diproses',
    newClip: 'Buat klip baru',
  },
  latestClips: {
    title: 'Klip terbaru',
    made: (n: number, shown: string) => `${shown} klip dibuat di workspace ini`,
    seeAll: 'Lihat semua',
    emptyTitle: 'Belum ada klip',
    emptyDescription: 'Tempel link YouTube atau pilih file video di Cari Video untuk membuat klip pertama.',
    openDiscover: 'Buka Cari Video',
    openClip: (name: string) => `Buka klip: ${name}`,
  },
  latestJobs: {
    title: 'Job terbaru',
    empty: 'Belum ada job. Mulai dari Cari Video.',
    fallbackTitle: 'Job',
  },
  hero: {
    running: 'Proses berjalan',
    idleTitle: 'Tempel link YouTube',
    idleText: 'Tidak ada proses berjalan. Mulai dari link video panjang atau file di PC Anda.',
    seeQueue: 'Lihat antrian',
    queued: 'Antri',
    clipOf: (done: number, total: number) => `klip ${done} dari ${total}`,
  },
}
