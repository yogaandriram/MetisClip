import type { Messages } from '../id'

export const setup: Messages['setup'] = {
  steps: {
    welcome: 'Welcome',
    data: 'Data location',
    keys: 'API keys',
    check: 'System check',
    campaign: 'Campaign',
  },
  welcome: {
    eyebrow: 'First-time setup',
    title: 'Welcome to MetisClip',
    intro:
      'MetisClip finds long videos (podcasts, interviews) on YouTube, uses AI to pick the moments with viral potential, then cuts them into vertical 9:16 clips with editable subtitles. All data and videos stay on your own computer.',
    copyrightTitle: 'Copyright is your responsibility',
    copyrightBody:
      "Source videos on YouTube belong to their creators. Before you upload a clip, make sure you have the content owner's permission or that your use counts as fair use (for example, with clear attribution and transformation), and that you follow the Terms of Service of YouTube and the platform you post to. MetisClip does not give you any rights to third-party content.",
    accept: 'I understand and take responsibility for the content I clip and upload with MetisClip.',
    start: 'Start setup',
  },
  data: {
    title: 'Data location',
    preparing: 'Preparing the data folder…',
    startingServices: 'Starting the database & engine…',
    connecting: 'Connecting to the engine…',
    useFailed: "Couldn't use this folder.",
    ready: 'The data folder is ready',
    devManualHint: 'Start the engine manually and set NEXT_PUBLIC_ENGINE_URL / NEXT_PUBLIC_ENGINE_TOKEN (see frontend/.env.example).',
    pickDialogTitle: 'Choose the MetisClip data folder',
    browserSubtitle: 'The database, source videos and clips are stored in one folder on your computer.',
    browserNoticeBefore:
      'Choosing the data folder is only available in the MetisClip desktop app. This page is open in a regular browser (developer mode): the engine uses the folder from the',
    browserNoticeAfter: 'variable when it is started manually.',
    continueDev: 'Continue (developer mode)',
    alreadySet: 'The data folder was already set up.',
    folder: 'Data folder',
    moveLaterHint: 'You can move the data folder later from the System page.',
    chooseTitle: 'Where should MetisClip keep its data?',
    chooseSubtitle:
      'The database, source videos, cache and all clips are stored in this folder. Pick a drive with enough free space — one podcast video can take several GB.',
    chooseFolder: 'Choose folder…',
    freeSpace: 'Free space:',
    ofTotal: (total: string) => `of ${total}`,
    existing: 'This folder already contains MetisClip data — the existing data folder will be used (nothing is deleted).',
    willCreate: 'The folder will be created (or used) and filled with the MetisClip data structure.',
    use: 'Use this folder',
  },
  keys: {
    title: 'API keys',
    heading: 'Connect AI services',
    subtitle:
      'API keys are stored safely in Windows Credential Manager, not in a regular file, and you can view them again with the eye icon. You can skip this step and fill them in later in Settings.',
    transcription: 'Transcription',
    groqLabel: 'Groq API key (optional)',
    groqDescription:
      'Without this key, transcription runs with local Whisper on this computer (its model is downloaded once, the first time it is used). With a Groq key, which you can create for free at console.groq.com, transcription is much faster while online, and local Whisper stays as the backup when offline.',
    skip: 'Skip for now',
    saveNext: 'Save & continue',
  },
  check: {
    title: 'System check',
    subtitle: 'Makes sure every component (database, FFmpeg, yt-dlp, renderer) is ready to use on this computer.',
    problems: (n: number) =>
      `${n} ${n === 1 ? 'component has a problem' : 'components have problems'}. You can still continue, but some features may fail until the problem is fixed.`,
  },
  campaign: {
    title: 'Create your first campaign',
    subtitle: "A campaign holds everything you make in MetisClip: the videos you process, the clips, the brief and the brand template. For your own channel a name is enough; an agency's brief can be added later. Once the campaign exists, the AI prepares its first brand template.",
    created: (name: string) => `Campaign "${name}" created`,
    existing: (n: number) => `You already have ${n} ${n === 1 ? 'campaign' : 'campaigns'} in this data folder.`,
    createStart: 'Create & start',
    createNew: 'Create a new campaign',
    goHome: 'Go to Home',
  },
}
