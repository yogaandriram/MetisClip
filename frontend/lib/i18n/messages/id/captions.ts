// Bahasa Indonesia: the source dictionary. Add every key in en/captions.ts too (tsc checks it).
// Caption controls shared by the clip editor and the Brand Template (components/captions).
export const captions = {
  quick: {
    top: 'Atas',
    middle: 'Tengah',
    bottom: 'Bawah',
  },
  quickLabel: 'Posisi cepat',
  quickHint: 'Ketiganya berada di area yang tidak tertutup tampilan TikTok, IG Reels, dan YT Shorts.',
  quickGroup: 'Posisi cepat caption',
  vertical: 'Posisi vertikal',
  verticalHint: 'Jarak bagian bawah caption dari bawah video.',
  horizontal: 'Posisi horizontal',
  horizontalHint: (pct: number) => `${pct}% = tengah video.`,
  safeTitle: 'Aman di semua platform',
  safeBody: 'Caption tidak tertutup judul, keterangan, atau tombol TikTok, IG Reels, dan YT Shorts.',
  /** "TikTok, IG Reels dan YT Shorts" */
  listJoin: (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`),
  coveredTitle: (platforms: string) => `Bisa tertutup tampilan ${platforms}`,
  coveredBody: 'Sebagian caption berada di area judul, keterangan, atau tombol aplikasi tersebut.',
  moveToSafe: 'Pindahkan ke area aman',
}
