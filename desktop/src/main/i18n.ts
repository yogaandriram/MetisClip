// UI language of the main process (its own error page, dialogs, data-folder checks and engine status
// messages). The choice is made in the UI (frontend/lib/i18n) and saved here in
// %APPDATA%\MetisClip\preferences.json, because main needs it before mongod and the engine run.
// The engine gets it as METISCLIP_LANG at spawn and through PUT /api/settings on a change.
// Log lines stay in one language (Indonesian) for support.
import { readPrefs, writePrefs } from './preferences'

export type Lang = 'id' | 'en'
export const DEFAULT_LANG: Lang = 'id'

export function isLang(v: unknown): v is Lang {
  return v === 'id' || v === 'en'
}

const id = {
  errorPage: {
    title: 'Tampilan MetisClip tidak bisa dimuat',
    body: 'Terjadi masalah saat membuka antarmuka aplikasi.',
    logsAt: 'Detail tersimpan di folder log:',
    retry: 'Coba lagi',
    openLogs: 'Buka folder log',
  },
  rendererGone: (reason: string) => `Renderer berhenti: ${reason}`,
  dataRootMissing: (root: string) => `Folder data tidak ditemukan: ${root}. Sambungkan kembali drive-nya lalu coba lagi, atau pilih lokasi lain.`,
  dataRoot: {
    notAbsolute: 'Path harus berupa folder lengkap di drive lokal, misalnya D:\\MetisClip.',
    driveRoot: 'Pilih atau buat sebuah folder, jangan langsung akar drive (misalnya D:\\MetisClip, bukan D:\\).',
    cloud: (cloud: string) => `Folder ini ada di dalam ${cloud}. Aplikasi sinkronisasi cloud bisa merusak file database, pilih folder lain (misalnya D:\\MetisClip).`,
    windowsDir: 'Folder sistem Windows tidak boleh dipakai.',
    installDir: 'Jangan simpan data di dalam folder instalasi aplikasi (akan terhapus saat update/uninstall).',
    driveMissing: (root: string) => `Drive ${root} tidak ditemukan.`,
    driveNotReady: (root: string) => `Drive ${root} tidak siap atau tidak terpasang.`,
    removable: (root: string) => `Drive ${root} adalah drive lepas-pasang (flashdisk/kartu memori). Pilih drive lokal tetap.`,
    network: (root: string) => `Drive ${root} adalah drive jaringan. Database harus berada di drive lokal.`,
    cdrom: (root: string) => `Drive ${root} adalah drive CD/DVD.`,
    ramDisk: (root: string) => `Drive ${root} adalah RAM disk (isinya hilang saat restart).`,
    unknownType: (root: string, type: string) => `Jenis drive ${root} tidak dikenali (${type}).`,
    typeUnchecked: (root: string) => `Jenis drive ${root} tidak bisa diperiksa.`,
    isFile: 'Path tersebut adalah file, bukan folder.',
    notWritable: (err: string) => `Folder tidak bisa ditulisi (${err}). Pilih folder lain yang bisa Anda ubah.`,
    lowSpaceBlock: (root: string, gb: string) => `Ruang kosong di ${root} hanya ${gb} GB. Minimal 2 GB, disarankan 15 GB atau lebih.`,
    lowSpaceWarn: (root: string, gb: string) => `Ruang kosong di ${root} ${gb} GB. Disarankan minimal 15 GB untuk video dan database.`,
    longPath: (n: number) => `Path cukup panjang (${n} karakter). Path pendek (maks. 60) lebih aman, misalnya D:\\MetisClip.`,
    notEmpty: 'Folder ini tidak kosong. File yang sudah ada tidak akan diubah.',
    cannotCreate: 'Folder data tidak bisa dibuat.',
    setupFailed: (err: string) => `Gagal menyiapkan folder data: ${err}`,
  },
  dataMove: {
    banner: 'Memindahkan folder data. MetisClip berhenti sebentar sampai selesai.',
    notReady: 'MetisClip belum siap. Tunggu sebentar lalu coba lagi.',
    busyRunning: 'Pemindahan folder data sedang berjalan.',
    sameFolder: 'Ini folder data yang dipakai sekarang.',
    insideCurrent: 'Folder tujuan ada di dalam folder data sekarang. Pilih folder di luarnya.',
    containsCurrent: 'Folder tujuan berisi folder data sekarang. Pilih folder lain.',
    hasData: 'Folder ini sudah berisi data MetisClip lain. Pilih folder kosong atau folder baru.',
    notEmpty: 'Folder ini tidak kosong. Pilih folder kosong atau folder baru, misalnya D:\\MetisClip.',
    noSpace: (need: string, free: string) => `Ruang kosong di drive tujuan ${free}, padahal perlu sekitar ${need} (data ditambah cadangan 2 GB).`,
    cancelled: 'Pemindahan dibatalkan. MetisClip tetap memakai folder lama.',
    copyFailed: (err: string) => `Penyalinan gagal: ${err}. MetisClip tetap memakai folder lama.`,
    verifyFailed: (detail: string) => `Salinan tidak sama dengan aslinya (${detail}). MetisClip tetap memakai folder lama.`,
    verifyMissing: (rel: string) => `${rel} tidak ada di salinan`,
    verifySize: (rel: string) => `ukuran ${rel} berbeda`,
    verifyCount: (copied: number, total: number) => `${copied} dari ${total} file tersalin`,
    startFailed: (err: string) => `MetisClip tidak bisa berjalan dari folder baru: ${err}. MetisClip tetap memakai folder lama.`,
    saveFailed: (err: string) => `Lokasi baru tidak bisa disimpan: ${err}. MetisClip tetap memakai folder lama.`,
    previousGone: 'Folder lama sudah tidak ada.',
    previousInUse: 'Folder itu sedang dipakai MetisClip, jadi tidak dihapus.',
    deleteFailed: (err: string) => `Sebagian isi folder lama tidak bisa dihapus: ${err}. Tutup aplikasi yang membuka file di sana, lalu coba lagi.`,
  },
  engine: {
    venvMissing: (cmd: string) => `Python venv tidak ditemukan di ${cmd}. Buat venv dan instal backend/requirements.txt.`,
    exeMissing: (cmd: string) => `metisclip-engine.exe tidak ditemukan di ${cmd}. Instal ulang aplikasi.`,
    readyTimeout: (s: number, hint: string) => `Engine tidak siap dalam ${s} detik. ${hint}`.trim(),
    startFailed: 'Engine gagal start',
    exitedAtStart: (code: number | null, hint: string) => `Engine berhenti saat start (exit ${code}). ${hint}`.trim(),
    lastMessage: (line: string) => `Pesan terakhir: ${line}`,
    failed: 'Engine gagal dijalankan',
    appClosing: 'Aplikasi sedang ditutup',
    preparingDb: 'Menyiapkan database...',
    startingEngine: 'Menjalankan engine...',
    dbPortChanged: 'Port database berubah',
    unhealthy: (err: string) => `Engine tidak sehat (/health: ${err})`,
    crashed: (code: number | null) => `Engine berhenti tak terduga (exit ${code})`,
    gaveUp: (reason: string, n: number) => `${reason}. Engine sudah dimulai ulang ${n} kali; buka folder log untuk detailnya.`,
    restarting: (reason: string) => `${reason}. Memulai ulang engine...`,
    mongoNotRunning: 'MongoDB tidak berjalan',
    restartFailed: (err: string) => `Engine gagal dimulai ulang: ${err}`,
  },
  mongod: {
    exeMissing: (exe: string) => `mongod.exe tidak ditemukan di ${exe}. Jalankan scripts\\fetch-binaries.ps1 (dev) atau instal ulang aplikasi.`,
    startFailed: (err: string) => `MongoDB gagal dijalankan: ${err}`,
    exitedAtStart: (code: number | null, detail: string) => `mongod berhenti saat start (exit ${code}). ${detail}`.trim(),
    noResponse: (s: number) => `mongod tidak merespons dalam ${s} detik`,
    crashLoop: 'MongoDB berhenti berulang kali. Buka folder log untuk detailnya.',
  },
  tray: {
    tooltip: 'MetisClip',
    open: 'Buka MetisClip',
    quit: 'Keluar dari MetisClip',
    noticeTitle: 'MetisClip masih berjalan',
    noticeBody: 'Job dan ekspor tetap jalan. Klik ikon MetisClip di area notifikasi untuk membukanya lagi, atau klik kanan untuk keluar.',
  },
  close: {
    busyTitle: 'Masih ada pekerjaan yang berjalan',
    busyDetail: (items: string) =>
      `Sedang berjalan: ${items}.

Jika MetisClip ditutup sekarang, pekerjaan ini berhenti. Job bisa dilanjutkan dari Antrian saat MetisClip dibuka lagi, ekspor video perlu diulang.`,
    runInTray: 'Jalankan di latar belakang',
    quit: 'Tutup sekarang',
    cancel: 'Batal',
    remember: 'Selalu jalankan di tray saat jendela ditutup',
    items: {
      jobs: (n: number) => `${n} job clip`,
      renders: (n: number) => `${n} ekspor video`,
      parses: (n: number) => `${n} pembacaan brief`,
      designs: (n: number) => `${n} desain template oleh AI`,
      downloads: (n: number) => `${n} unduhan model Whisper`,
    } as Record<string, (n: number) => string>,
  },
  /** "Mulai ulang dan pasang" while work runs (updater.ts, index.ts) */
  update: {
    busyTitle: (version: string) => `Pasang MetisClip ${version} sekarang?`,
    busyDetail: (items: string) =>
      `Sedang berjalan: ${items}.

MetisClip ditutup untuk memasang versi baru, jadi pekerjaan ini berhenti. Job bisa dilanjutkan dari Antrian setelah MetisClip terbuka lagi, ekspor video perlu diulang.`,
    install: 'Pasang dan mulai ulang',
    later: 'Nanti',
  },
  ipc: {
    denied: 'Akses ditolak',
    notText: 'Argumen harus berupa teks',
    tooLong: 'Argumen terlalu panjang',
    notAbsolute: 'Path harus absolut',
    notFound: 'File atau folder tidak ditemukan',
    chooseFolder: 'Pilih folder',
    chooseFile: 'Pilih file',
    blockedExecutable: 'File program/skrip tidak boleh dibuka dari aplikasi.',
    httpOnly: 'Hanya tautan http(s) yang boleh dibuka',
  },
}

type MainMessages = typeof id

const en: MainMessages = {
  errorPage: {
    title: "MetisClip's interface couldn't be loaded",
    body: 'Something went wrong while opening the app interface.',
    logsAt: 'Details are saved in the log folder:',
    retry: 'Try again',
    openLogs: 'Open log folder',
  },
  rendererGone: (reason: string) => `The renderer stopped: ${reason}`,
  dataRootMissing: (root: string) => `Data folder not found: ${root}. Reconnect its drive and try again, or choose another location.`,
  dataRoot: {
    notAbsolute: 'The path must be a full folder path on a local drive, for example D:\\MetisClip.',
    driveRoot: 'Choose or create a folder instead of the drive root (for example D:\\MetisClip, not D:\\).',
    cloud: (cloud: string) => `This folder is inside ${cloud}. Cloud sync apps can damage database files, so choose another folder (for example D:\\MetisClip).`,
    windowsDir: "Windows system folders can't be used.",
    installDir: "Don't keep data inside the app's install folder (it is deleted on update/uninstall).",
    driveMissing: (root: string) => `Drive ${root} was not found.`,
    driveNotReady: (root: string) => `Drive ${root} is not ready or not connected.`,
    removable: (root: string) => `Drive ${root} is a removable drive (USB stick/memory card). Choose a fixed local drive.`,
    network: (root: string) => `Drive ${root} is a network drive. The database must be on a local drive.`,
    cdrom: (root: string) => `Drive ${root} is a CD/DVD drive.`,
    ramDisk: (root: string) => `Drive ${root} is a RAM disk (its contents are lost on restart).`,
    unknownType: (root: string, type: string) => `The type of drive ${root} is not recognized (${type}).`,
    typeUnchecked: (root: string) => `The type of drive ${root} couldn't be checked.`,
    isFile: 'That path is a file, not a folder.',
    notWritable: (err: string) => `The folder can't be written to (${err}). Choose a folder you can modify.`,
    lowSpaceBlock: (root: string, gb: string) => `Only ${gb} GB is free on ${root}. At least 2 GB is required; 15 GB or more is recommended.`,
    lowSpaceWarn: (root: string, gb: string) => `${gb} GB is free on ${root}. At least 15 GB is recommended for videos and the database.`,
    longPath: (n: number) => `The path is fairly long (${n} characters). A short path (60 at most) is safer, for example D:\\MetisClip.`,
    notEmpty: "This folder isn't empty. Existing files won't be changed.",
    cannotCreate: "The data folder couldn't be created.",
    setupFailed: (err: string) => `Couldn't prepare the data folder: ${err}`,
  },
  dataMove: {
    banner: 'Moving the data folder. MetisClip pauses until it is done.',
    notReady: "MetisClip isn't ready yet. Wait a moment and try again.",
    busyRunning: 'The data folder is already being moved.',
    sameFolder: 'This is the data folder in use now.',
    insideCurrent: 'The destination is inside the current data folder. Choose a folder outside it.',
    containsCurrent: 'The destination contains the current data folder. Choose another folder.',
    hasData: 'This folder already holds other MetisClip data. Choose an empty or new folder.',
    notEmpty: "This folder isn't empty. Choose an empty or new folder, for example D:\\MetisClip.",
    noSpace: (need: string, free: string) => `The destination drive has ${free} free, but about ${need} is needed (the data plus a 2 GB reserve).`,
    cancelled: 'The move was cancelled. MetisClip keeps using the old folder.',
    copyFailed: (err: string) => `Copying failed: ${err}. MetisClip keeps using the old folder.`,
    verifyFailed: (detail: string) => `The copy doesn't match the original (${detail}). MetisClip keeps using the old folder.`,
    verifyMissing: (rel: string) => `${rel} is missing from the copy`,
    verifySize: (rel: string) => `${rel} has a different size`,
    verifyCount: (copied: number, total: number) => `${copied} of ${total} files copied`,
    startFailed: (err: string) => `MetisClip can't run from the new folder: ${err}. MetisClip keeps using the old folder.`,
    saveFailed: (err: string) => `The new location couldn't be saved: ${err}. MetisClip keeps using the old folder.`,
    previousGone: 'The old folder no longer exists.',
    previousInUse: 'MetisClip is using that folder, so it was not deleted.',
    deleteFailed: (err: string) => `Part of the old folder couldn't be deleted: ${err}. Close the apps that have files open there, then try again.`,
  },
  engine: {
    venvMissing: (cmd: string) => `Python venv not found at ${cmd}. Create the venv and install backend/requirements.txt.`,
    exeMissing: (cmd: string) => `metisclip-engine.exe not found at ${cmd}. Reinstall the app.`,
    readyTimeout: (s: number, hint: string) => `The engine wasn't ready within ${s} seconds. ${hint}`.trim(),
    startFailed: 'The engine failed to start',
    exitedAtStart: (code: number | null, hint: string) => `The engine stopped while starting (exit ${code}). ${hint}`.trim(),
    lastMessage: (line: string) => `Last message: ${line}`,
    failed: 'The engine failed to start',
    appClosing: 'The app is closing',
    preparingDb: 'Preparing the database...',
    startingEngine: 'Starting the engine...',
    dbPortChanged: 'The database port changed',
    unhealthy: (err: string) => `The engine is not healthy (/health: ${err})`,
    crashed: (code: number | null) => `The engine stopped unexpectedly (exit ${code})`,
    gaveUp: (reason: string, n: number) => `${reason}. The engine was already restarted ${n} times; open the log folder for details.`,
    restarting: (reason: string) => `${reason}. Restarting the engine...`,
    mongoNotRunning: 'MongoDB is not running',
    restartFailed: (err: string) => `The engine failed to restart: ${err}`,
  },
  mongod: {
    exeMissing: (exe: string) => `mongod.exe not found at ${exe}. Run scripts\\fetch-binaries.ps1 (dev) or reinstall the app.`,
    startFailed: (err: string) => `MongoDB failed to start: ${err}`,
    exitedAtStart: (code: number | null, detail: string) => `mongod stopped while starting (exit ${code}). ${detail}`.trim(),
    noResponse: (s: number) => `mongod didn't respond within ${s} seconds`,
    crashLoop: 'MongoDB stopped repeatedly. Open the log folder for details.',
  },
  tray: {
    tooltip: 'MetisClip',
    open: 'Open MetisClip',
    quit: 'Quit MetisClip',
    noticeTitle: 'MetisClip is still running',
    noticeBody: 'Jobs and exports keep going. Click the MetisClip icon in the notification area to open it again, or right-click it to quit.',
  },
  close: {
    busyTitle: 'Work is still running',
    busyDetail: (items: string) =>
      `Running now: ${items}.

If MetisClip closes now, this work stops. Jobs can be resumed from the Queue when MetisClip opens again; video exports have to be started again.`,
    runInTray: 'Keep running in the background',
    quit: 'Close now',
    cancel: 'Cancel',
    remember: 'Always keep running in the tray when the window is closed',
    items: {
      jobs: (n: number) => `${n} clip job${n === 1 ? '' : 's'}`,
      renders: (n: number) => `${n} video export${n === 1 ? '' : 's'}`,
      parses: (n: number) => `${n} brief reading${n === 1 ? '' : 's'}`,
      designs: (n: number) => `${n} AI template design${n === 1 ? '' : 's'}`,
      downloads: (n: number) => `${n} Whisper model download${n === 1 ? '' : 's'}`,
    },
  },
  update: {
    busyTitle: (version: string) => `Install MetisClip ${version} now?`,
    busyDetail: (items: string) =>
      `Running now: ${items}.

MetisClip closes to install the new version, so this work stops. Jobs can be resumed from the Queue once MetisClip is open again; video exports have to be started again.`,
    install: 'Install and restart',
    later: 'Later',
  },
  ipc: {
    denied: 'Access denied',
    notText: 'The argument must be text',
    tooLong: 'The argument is too long',
    notAbsolute: 'The path must be absolute',
    notFound: 'File or folder not found',
    chooseFolder: 'Choose folder',
    chooseFile: 'Choose file',
    blockedExecutable: "Program and script files can't be opened from the app.",
    httpOnly: 'Only http(s) links can be opened',
  },
}

const MESSAGES: Record<Lang, MainMessages> = { id, en }

let current: Lang | null = null

export function getLanguage(): Lang {
  if (current) return current
  const saved = readPrefs().language
  current = isLang(saved) ? saved : DEFAULT_LANG
  return current
}

/** Saves the choice (preferences.json). Returns false when it was already the current language. */
export function setLanguage(lang: Lang): boolean {
  if (lang === getLanguage()) return false
  current = lang
  writePrefs({ language: lang })
  return true
}

/** Messages in the saved language. */
export function tr(): MainMessages {
  return MESSAGES[getLanguage()]
}
