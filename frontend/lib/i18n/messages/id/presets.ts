// Bahasa Indonesia: the source dictionary. Add every key in en/presets.ts too (tsc checks it).
// Display text of the ready-made presets (lib/presets keeps only their ids and settings).
export const presets = {
  /** Layout presets of the Brand Template gallery, by LAYOUT_PRESETS id */
  layout: {
    full: { name: 'Penuh 9:16', description: 'Video dipotong 9:16 mengikuti wajah.' },
    'full-zoom': { name: 'Penuh + zoom', description: 'Zoom halus di setiap kata kunci AI.' },
    podcast: { name: 'Podcast blur', description: 'Rasio asli, latar video blur, judul di atas.' },
    'podcast-dark': { name: 'Podcast gelap', description: 'Rasio asli di atas latar hitam.' },
    'podcast-boxed': { name: 'Judul kotak', description: 'Gradasi, video membulat, judul dalam kotak.' },
    'blur-clean': { name: 'Blur tanpa judul', description: 'Rasio asli di atas blur, tanpa teks tambahan.' },
    'card-light': { name: 'Kartu terang', description: 'Gaya postingan: nama akun, teks, lalu video.' },
    'card-dark': { name: 'Kartu gelap', description: 'Gaya postingan gelap di atas latar hitam.' },
    split: { name: 'Video pendamping', description: 'Pembicara di atas, video pendamping tanpa suara di bawah.' },
    'split-line': { name: 'Pendamping + garis', description: 'Pembicara lebih besar, garis putih di tengah.' },
    duo: { name: 'Dua pembicara', description: 'Dua orang dalam satu frame dipisah atas dan bawah.' },
    'duo-line': { name: 'Dua pembicara + garis', description: 'Dua panel dengan garis putih di tengah.' },
    auto: { name: 'Otomatis per adegan', description: 'Satu orang penuh, dua orang dua panel, slide dalam bingkai.' },
  },
}
