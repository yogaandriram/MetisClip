// Bahasa Indonesia: the source dictionary. Add every key in en/editor.ts too (tsc checks it).
// Clip editor (app/(dashboard)/clips/detail).
export const editor = {
  title: 'Editor klip',
  back: 'Kembali ke Hasil Clip',

  layoutModes: {
    full: 'Penuh 9:16',
    podcast: 'Podcast',
    card: 'Kartu',
    split: 'Pendamping',
    duo: 'Dua orang',
    auto: 'Per adegan',
  },
  /** "Layout otomatis sesuai konten" in the layout panel */
  smart: {
    toggle: 'Otomatis sesuai konten',
    hint: 'Layout dipilih dari isi clip ini. Matikan untuk memilih layout sendiri atau mengikuti layout default template.',
    kinds: {
      vertical: 'Video sumber tegak',
      speaker: 'Satu pembicara',
      duo: 'Dua orang berdampingan',
      screen: 'Slide, layar atau keramaian',
      mixed: 'Campuran wajah dan slide',
    },
    picked: (kind: string, layout: string) => `Isi clip: ${kind}. Layout: ${layout}.`,
    shares: (solo: string, duo: string, other: string) => `Satu orang ${solo} · dua orang ${duo} · lainnya ${other}`,
    missingTitle: 'Isi clip belum dianalisis',
    missingBody: 'Analisis wajah menentukan layout yang cocok. Sampai itu clip memakai layout default, dan saat ekspor analisisnya dijalankan dulu.',
    rules: 'Atur pilihan per isi clip',
  },
  layoutHints: {
    full: 'Video dipotong 9:16 mengikuti wajah pembicara.',
    podcast: 'Video tampil utuh dengan rasio aslinya, judul di atas. Latar dan gaya judul diatur di Brand Template.',
    card: 'Video di dalam kartu bergaya postingan, judul sebagai teks postingan. Nama akun dan warna kartu diatur di Brand Template.',
    split: 'Pembicara dan video pendamping tanpa suara yang diputar berulang. Videonya diunggah di Brand Template.',
    duo: 'Dua orang dalam satu frame dipisah jadi panel atas dan bawah, masing-masing mengikuti wajahnya. Adegan lain tampil penuh 9:16.',
    auto: 'Tampilan dipilih per adegan dari hasil face tracking: satu orang penuh, dua orang dua panel, slide atau adegan ramai dalam bingkai. Gantinya hanya di potongan kamera.',
  },
  views: {
    duo: 'Dua panel',
    full: 'Penuh',
    framed: 'Bingkai',
  },
  duoTop: {
    left: 'Orang kiri',
    right: 'Orang kanan',
  },
  zoomStyles: {
    keywords: 'Di kata kunci',
    sentences: 'Tiap kalimat',
  },
  ratioSource: 'Asli',

  shortcuts: {
    title: 'Pintasan keyboard',
    spaceKey: 'Spasi',
    playPause: 'Putar / jeda',
    step: 'Mundur / maju 0,1 detik',
    stepLong: 'Mundur / maju 1 detik',
    save: 'Simpan',
    undo: 'Undo',
    redo: 'Redo',
    export: 'Ekspor video',
  },

  // Loading and events
  noIdInUrl: 'ID clip tidak ada di alamat halaman.',
  notFound: 'Clip tidak ditemukan',
  loadErrorTitle: 'Clip tidak dapat dibuka',
  backToGallery: 'Kembali ke galeri',
  /** Toast before the folder path */
  renderDoneSavedIn: 'Render selesai, tersimpan di',
  renderDoneNotCopied: (error: string) => `Render selesai, tapi belum tersalin ke folder ekspor. ${error}`,
  renderDone: 'Render selesai',
  clipDeleted: 'Clip ini dihapus',

  // Actions
  changesSaved: 'Perubahan disimpan',
  saveFailed: 'Gagal menyimpan perubahan',
  usingTemplate: (name: string) => `Memakai template "${name}". Klik Simpan untuk menyimpan.`,
  styleReset: (name: string) => `Gaya dikembalikan ke template "${name}". Klik Simpan untuk menyimpan.`,
  /** Name of the built-in style inside a sentence */
  builtIn: 'bawaan',
  speakerNoneFound: 'AI tidak menemukan nama orang di judul video, nama channel, atau ucapan klip ini. Isi namanya sendiri.',
  speakerSuggestFailed: 'Usulan nama gagal',
  preparingSource: 'Menyiapkan video sumber…',
  sourceReady: 'Video sumber siap',
  sourceFailed: 'Video sumber gagal disiapkan',
  analyzingFaces: 'Menganalisis wajah… Bisa butuh beberapa puluh detik.',
  facesDone: (scenes: number) => `Analisis selesai: ${scenes} adegan`,
  facesFailed: 'Analisis wajah gagal',
  enableAiFirst: 'Aktifkan "Sorot kata kunci" atau "Emoji otomatis" dulu',
  /** null = that kind was not requested */
  aiMarked: (keywords: number | null, emojis: number | null) => {
    const parts: string[] = []
    if (keywords !== null) parts.push(`${keywords} kata kunci`)
    if (emojis !== null) parts.push(`${emojis} emoji`)
    return `AI menandai ${parts.join(' dan ')}`
  },
  aiFailed: 'Gagal menjalankan AI subtitle',
  renderStartFailed: 'Gagal memulai render',
  exportDialogTitle: 'Ekspor clip ke folder',
  clipExported: 'Clip diekspor',
  cannotExport: 'Clip belum bisa diekspor',

  // Header
  unsaved: 'Belum disimpan',
  wordCount: (n: number) => `${n} kata`,
  renderProgress: (pct: number) => `Render ${pct}%`,
  export: 'Ekspor',

  // Render modal footer
  cancelRender: 'Batalkan render',
  retryCopy: 'Coba salin lagi',
  copyToExportFolder: 'Salin ke folder ekspor',
  exportTo: 'Ekspor ke…',
  retryRender: 'Coba render lagi',

  // Word list
  captionTitle: 'Caption',
  captionSubtitle: 'Edit teks dan timing (detik). Klik kartu untuk melompat.',
  noSubtitles: 'Belum ada subtitle',
  noSubtitlesBody: 'Tambahkan kata pertama, lalu atur teks dan waktunya.',
  addWord: 'Tambah kata',
  /** Text of a word added to an empty list */
  firstWordText: 'Teks',
  /** Text of a word inserted after another */
  insertedWordText: 'Baru',
  wordAria: (n: number) => `Kata ${n}`,
  fillerTitle: 'Kata pengisi: disembunyikan dari subtitle dan dipotong dari video',
  fillerBadge: 'pengisi',
  keywordOn: 'Kata kunci (klik untuk hapus sorotan)',
  keywordOff: 'Jadikan kata kunci (disorot)',
  deleteWord: 'Hapus kata',
  wordStart: (n: number) => `Mulai kata ${n} (detik)`,
  wordEnd: (n: number) => `Selesai kata ${n} (detik)`,
  emojiPlaceholder: 'emoji',
  emojiAria: (n: number) => `Emoji kata ${n}`,
  emojiTitle: 'Emoji di atas subtitle mulai kata ini (kosongkan untuk menghapus)',
  insertWord: 'Sisipkan kata',

  // Stage
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Y)',
  cutTooltip: 'Bagian yang dipotong (kata pengisi / jeda hening) dilewati saat diputar dan tidak ada di hasil ekspor',
  /** seconds: already formatted ("2,5") */
  cutSeconds: (seconds: string) => `−${seconds} dtk dipotong`,
  fullscreen: 'Layar penuh',
  companionNotUploaded: 'Video pendamping belum diunggah',
  videoNotReady: 'File video belum tersedia (clip masih diproses).',
  play: 'Putar (Spasi)',
  pause: 'Jeda (Spasi)',
  timeline: 'Posisi video',
  timeOf: (current: string, total: string) => `${current} dari ${total}`,

  // Properties panel
  propsTitle: 'Properti',
  propsSubtitle: 'Perubahan di sini hanya berlaku untuk clip ini.',
  manageTemplates: 'Kelola template',
  templateSelect: 'Brand Template clip ini',
  templateHint: 'Mengganti template memakai gaya caption, logo, dan pengaturan AI dari template itu untuk clip ini.',
  builtInTemplate: 'Bawaan MetisClip',
  campaignDefault: (name: string) => `${name} (template campaign)`,
  resetToTemplate: 'Reset ke template',

  layoutTitle: 'Layout',
  followTemplate: 'Ikuti template',
  adjustStyle: 'Atur gaya',
  videoView: 'Tampilan video',
  facesMissingTitle: 'Wajah belum dianalisis',
  analyzeNow: 'Analisis sekarang',
  facesMissingBody:
    'Clip ini dibuat sebelum hasil face tracking disimpan. Analisis berjalan otomatis saat ekspor, atau jalankan sekarang untuk melihat preview.',
  noDuoTitle: 'Tidak ada adegan dua orang',
  noDuoBody: 'Tidak ada adegan dengan dua orang berdampingan dalam satu frame. Clip ini tampil seperti layout Penuh 9:16.',
  autoSolo: 'Satu orang',
  autoSoloAria: 'Tampilan adegan satu orang',
  autoDuo: 'Dua orang berdampingan',
  autoDuoAria: 'Tampilan adegan dua orang',
  autoGroup: 'Ramai',
  autoGroupHint: 'Tiga orang atau lebih, atau dua orang yang terlalu rapat untuk dipisah.',
  autoGroupAria: 'Tampilan adegan ramai',
  autoNone: 'Tanpa wajah',
  autoNoneHint: 'Slide, rekaman layar, B-roll.',
  autoNoneAria: 'Tampilan adegan tanpa wajah',
  topPanel: 'Panel atas',
  topPanelHint: 'Orang di sisi kiri atau kanan video sumber.',
  topPanelAria: 'Orang di panel atas',
  faceSize: 'Ukuran wajah',
  faceSizeHint: 'Tinggi wajah dibanding panelnya.',
  topPanelHeight: 'Tinggi panel atas',
  sourceMissingTitle: 'Video sumber belum ada',
  prepareNow: 'Siapkan sekarang',
  sourceMissingBody:
    'Clip ini dibuat sebelum video rasio aslinya disimpan. Video itu disiapkan otomatis saat ekspor, atau siapkan sekarang untuk melihat preview.',
  postText: 'Teks postingan',
  titleAbove: 'Judul di atas video',
  titleHint: 'Kutipan pembuka dari AI. Teks panjang otomatis mengecil supaya muat.',
  titleFixed: 'Judul memakai teks tetap dari Brand Template.',
  titleOff: 'Judul dimatikan di Brand Template.',
  videoRatio: 'Rasio video',
  cardPosition: 'Posisi kartu',
  videoPosition: 'Posisi video',
  focusX: 'Fokus horizontal',
  companionMissingTitle: 'Video pendamping belum ada',
  uploadInBrand: 'Unggah di Brand Template',
  companionMissingBody: 'Layout ini memakai video pendamping dari Brand Template. Tanpa video itu, clip tidak bisa diekspor dengan layout ini.',
  speakerFocusY: 'Fokus vertikal pembicara',
  speakerFocusHint: 'Geser bila kepala terpotong.',
  speakerHeight: 'Tinggi bagian pembicara',
  zoom: 'Zoom dinamis',
  zoomHint: 'Video membesar sebentar untuk memberi penekanan.',
  zoomWhen: 'Kapan zoom',
  /** option: the "Tiap kalimat" choice */
  noKeywordsForZoom: (option: string) =>
    `Belum ada kata kunci di clip ini. Tandai lewat AI subtitle atau ikon bintang di tiap kata, atau pilih "${option}".`,

  speakerTitle: 'Nama pembicara',
  showSpeaker: 'Tampilkan nama pembicara',
  showSpeakerHint: 'Label nama muncul beberapa detik di awal clip. Gaya dan posisinya diatur di Brand Template.',
  speakerName: 'Nama',
  speakerNamePlaceholder: 'Misal: dr. Andi Pratama',
  speakerRole: 'Keterangan',
  speakerRolePlaceholder: 'Misal: Dokter gizi',
  suggestWithAi: 'Usulkan dengan AI',
  aiSuggestions: 'Usulan AI',
  aiSuggestionsHint: 'Diambil dari judul video, nama channel dan ucapan. Periksa sebelum dipakai.',
  speakerEmpty: 'Label tidak tampil selama nama kosong.',

  animationTitle: 'Gaya animasi',
  animationHint: 'Setiap preset punya font bawaan sendiri. Memilih preset mengganti pengaturan font ke bawaannya.',
  presetGroup: 'Preset animasi',

  aiTitle: 'AI subtitle',
  aiHint: 'Default dari Brand Template. Perubahan di sini hanya untuk clip ini dan ikut ke hasil ekspor.',
  fillerToggle: 'Hapus kata pengisi (eh, hmm)',
  pausesToggle: 'Hapus jeda hening',
  keywordsToggle: 'Sorot kata kunci (AI)',
  emojisToggle: 'Emoji otomatis (AI)',
  keywordCount: (n: number) => `${n} kata kunci`,
  emojiCount: (n: number) => `${n} emoji`,
  editablePerWord: '(bisa diubah per kata di daftar caption)',
  reanalyze: 'Analisis ulang dengan AI',
  analyze: 'Analisis dengan AI',

  fontTitle: 'Tampilan font',
  presetDefaultTitle: (preset: string) => `Kembalikan font ke bawaan preset ${preset}`,
  presetDefault: 'Bawaan preset',
  font: 'Font',
  fontTrigger: (font: string) => `Font: ${font}`,
  weight: 'Ketebalan',
  fontColor: 'Warna font',
  fontSize: 'Ukuran font',
  sync: 'Sinkronisasi suara (delay)',
  syncHint: 'Geser ke kanan jika subtitle muncul terlalu cepat.',

  positionTitle: 'Posisi caption',

  highlightTitle: 'Highlight & dekorasi',
  highlightColor: 'Warna highlight',
  extraFormat: 'Format tambahan',
  italic: 'Miring',
  underline: 'Garis bawah',
  uppercase: 'Huruf kapital',

  strokeTitle: 'Garis luar & bayangan',
  strokeColor: 'Warna garis luar',
  strokeWidth: 'Tebal garis luar',
  shadow: 'Bayangan (shadow)',
  shadowColor: 'Warna bayangan',
  shadowX: 'Geser X',
  shadowY: 'Geser Y',
  blur: 'Blur',

  // Export modal
  exportTitle: 'Ekspor video',
  renderProgressLabel: 'Progres render',
  canClose: 'Anda boleh menutup jendela ini; render tetap berjalan di latar belakang.',
  copiedToFolder: 'Disalin ke folder',
  savedInExportFolder: 'Tersimpan di folder ekspor',
  changeFolderHint: 'Folder ini bisa diganti di Pengaturan → Folder ekspor.',
  notCopiedTitle: 'Belum tersalin ke folder ekspor',

  // Confirmations
  resetConfirmTitle: 'Kembalikan ke Brand Template?',
  resetConfirmBody: (template: string) =>
    `Gaya caption dan pengaturan AI khusus clip ini diganti dengan template "${template}". Teks & timing subtitle tidak berubah. Bisa di-undo; tersimpan setelah klik Simpan.`,
  resetConfirm: 'Reset gaya',
  unsavedTitle: 'Perubahan belum disimpan',
  unsavedBody: 'Simpan perubahan subtitle sebelum keluar dari editor?',
  saveAndLeave: 'Simpan & keluar',
  leaveWithoutSaving: 'Keluar tanpa menyimpan',

  // Scene strip
  scenes: 'Adegan',
  sceneAria: (n: number, view: string, from: string, to: string) => `Adegan ${n}: ${view}, ${from} sampai ${to}`,
  viewSeconds: (view: string, seconds: number) => `${view} ${seconds} dtk`,
}
