import type { Messages } from '../id'

export const help: Messages['help'] = {
  title: 'Help',
  subtitle: "How to use MetisClip, and what to do when something doesn't work.",
  open: 'Help (F1)',
  searchLabel: 'Search help',
  searchPlaceholder: 'Search, for example "yt-dlp" or "export"',
  clearSearch: 'Clear search',
  searchEmpty: (query: string) => `No topic matches "${query}".`,
  searchCount: (n: number) => `${n} matching ${n === 1 ? 'topic' : 'topics'}`,

  firstSteps: {
    title: 'First steps',
    welcomeTitle: 'Welcome to MetisClip',
    progress: (done: number, total: number) => `${done} of ${total} steps done`,
    done: 'Done',
    hide: 'Hide the guide',
    hidden: 'Guide hidden. The steps are still in Help (F1).',
    openHelp: 'Open Help',
    allDone: 'All steps done. For the next clips, start again from Find Video.',
    steps: {
      campaign: {
        title: 'Create a campaign',
        text: 'A campaign holds jobs, clips and brand templates. Your first one was made in the Setup Wizard.',
        action: 'Manage campaigns',
      },
      ai: {
        title: 'Connect the AI',
        text: 'Enter the LLM API key in Settings, then click Test. The AI uses it to pick the best moments.',
        action: 'Open Settings',
      },
      job: {
        title: 'Start the first job',
        text: 'Paste a YouTube link or choose a video file in Find Video. The AI picks the best moments and cuts them into 9:16 clips.',
        action: 'Open Find Video',
      },
      clip: {
        title: 'Check the clips',
        text: 'Clips appear in Clips as soon as they are ready. Open one in the editor to fix the subtitles, caption style and layout.',
        running: 'A job is running. Clips appear in Clips as soon as they are ready.',
        action: 'Open Clips',
      },
      export: {
        title: 'Export a clip',
        text: 'Click Export in the editor. The MP4 goes to the export folder, ready for you to upload to TikTok, Reels or Shorts yourself.',
        action: 'Open Clips',
      },
    },
  },

  groups: {
    start: 'Making clips',
    campaign: 'Campaigns and briefs',
    edit: 'Editing and exporting',
    trouble: 'When something goes wrong',
    data: 'Data and privacy',
  },

  links: {
    discover: 'Open Find Video',
    queue: 'Open the queue',
    clips: 'Open Clips',
    campaigns: 'Manage campaigns',
    brand: 'Open Brand Template',
    settings: 'Open Settings',
    system: 'Open System',
    about: 'About MetisClip',
  },

  topics: {
    how: {
      q: 'How does MetisClip make clips?',
      a: [
        'Paste a YouTube link or choose a video file in Find Video, pick its campaign, then start.',
        'MetisClip reads the whole transcript. The AI suggests strong moments and gives each a viral score, then every moment is cut into a 9:16 video that follows the faces, with word-by-word subtitles.',
        'Cutting, face tracking and rendering run on your PC. Only the transcript text goes to the AI.',
      ],
    },
    sources: {
      q: 'Which videos can I use?',
      a: [
        'Links to long YouTube videos, such as podcasts, interviews or talk shows. You can paste several links at once, or take the videos of a playlist (up to 50); each video becomes its own job.',
        "Video files on your PC: MP4, MKV, MOV, WEBM, M4V or AVI. The file is used where it is, not copied, so don't move it before the job finishes.",
      ],
    },
    manual: {
      q: 'Can I choose the moments myself?',
      a: [
        'Yes. In Find Video choose "Choose the moments yourself", then type the start and end of each moment (up to 20).',
        'A finished clip can be cut again with "Change cut" in the editor. Its style, template, title and subtitle edits stay.',
      ],
    },
    again: {
      q: 'How do I get more clips from the same video?',
      a: ['Click "Find more clips" on the job page or in the queue. Moments that are already clips in that campaign are skipped, so you get new ones.'],
    },
    time: {
      q: 'How long does a job take?',
      a: [
        'It depends on the transcript. YouTube videos with subtitles are analyzed at once. Uploads and videos without subtitles are transcribed first: a few seconds with a Groq API key, about half the video\'s length with local Whisper on a laptop.',
        'Then every clip is downloaded, face-tracked and subtitled. Follow it all in the queue. You can minimize MetisClip while a job runs.',
      ],
    },
    campaign: {
      q: 'What is a campaign?',
      a: [
        'A campaign holds all jobs and clips. Each campaign has its clip folder, brand templates and, if there is one, an agency brief.',
        'A campaign without a brief suits your own channel: clips are picked by viral score alone. Switch the active campaign with the profile circle at the top left.',
      ],
    },
    brief: {
      q: "How do I use an agency's brief?",
      a: [
        'On the campaign page, paste the brief text, add PDF or DOCX files, or paste screenshots, then click "Understand the brief". Check what the AI read and its open questions, then save.',
        'The next jobs pick moments that fit the brief, and every clip gets a checklist and post text. When only a few moments meet the brief, MetisClip makes fewer clips rather than clips that break it.',
      ],
    },
    template: {
      q: 'How do I set how clips look?',
      a: [
        'In Brand Template: the caption style and position, the layout (full screen, podcast, card, two speakers or automatic per scene) and the logo. The AI designs the first template of every new campaign.',
        'Changes in the clip editor apply to that clip only. A template applies to every clip that uses it.',
      ],
    },
    words: {
      q: 'How do I fix the subtitles?',
      a: [
        'Open the clip in the editor. Click a word card to jump to its time, then change its text or times. Ctrl+F finds and replaces words, and the "…" menu of each word splits or merges words.',
        'Words with bad times are marked, and "Fix times" tidies them all. Ctrl+Z undoes, Ctrl+S saves.',
      ],
    },
    export: {
      q: 'Where are the exported files?',
      a: [
        'Click Export (Ctrl+E) in the editor, or select several clips in Clips and click "Render & export". The video is rendered with its subtitles and copied to the export folder (Settings, Export folder).',
        "Next to the MP4 you get a .jpg when you chose a cover, and a .txt with the post text for campaign clips. A clip that hasn't changed since its last render is copied again without a render.",
        'A rendered clip can also be dragged from Clips into Explorer or another app. In the queue, "Open the export folder" opens the folder of the newest video a job exported.',
      ],
    },
    post: {
      q: 'How do I upload to TikTok, Reels or Shorts?',
      a: [
        "MetisClip doesn't post and doesn't connect to social media accounts. Upload the files from the export folder with the platform's app or website.",
        'The post text is in the editor\'s Campaign tab, and "Copy credit" in the Source video section copies the channel name with its link.',
      ],
    },
    formats: {
      q: 'Can I export other than 9:16, or in another language?',
      a: [
        "Video format in the editor turns that clip into 9:16, 1:1 or 16:9. The export quality (High, Standard, Small) is set in Settings.",
        "The editor's Translation section translates the subtitles and the title into 10 languages, timed like the speech.",
      ],
    },
    youtube: {
      q: "A YouTube video won't download",
      a: [
        'YouTube changes often. Open System and click "Update yt-dlp" (MetisClip also checks once a day).',
        'If the message says "Sign in to confirm you\'re not a bot", choose a YouTube cookies file in Settings, or try another player client in the advanced part.',
      ],
    },
    ai: {
      q: 'The AI failed to pick moments, or its quota ran out',
      a: [
        'Check the API key in Settings with the "Test" button. When the daily quota is used up, wait until it comes back (the job message gives an estimate) or choose another model.',
        "A stopped job can be resumed from the queue with \"Resume\". The parts already done aren't repeated.",
      ],
    },
    slow: {
      q: 'It is slow, or says "Waiting for RAM"',
      a: [
        '"Waiting for RAM" means MetisClip holds a heavy step back until there is enough RAM, so your PC stays responsive. Close other heavy apps, or wait a moment.',
        'Transcribing with local Whisper takes a lot of CPU. Enter a Groq API key in Settings and transcription finishes in seconds.',
      ],
    },
    stopped: {
      q: 'A job stopped half-way',
      a: [
        "If MetisClip was closed or the PC turned off while a job ran, the job is interrupted. Click \"Resume\" in the queue; clips already made aren't made again.",
        'If some clips failed, "Retry failed clips" in the queue makes only those again.',
      ],
    },
    disk: {
      q: 'The disk is almost full',
      a: [
        'Below 2 GB of free space, MetisClip starts no new job or export, and a running job stops before its next cut.',
        'In System you can empty the cache, see the size of each campaign, or move the data folder to another drive. Resume the job once there is room.',
      ],
    },
    report: {
      q: 'Still stuck?',
      a: [
        'Open About MetisClip in System and click "Copy system info". The text lists the versions, components and settings, without API keys.',
        'Include that text and the log files ("Open log folder") when you report the problem.',
      ],
    },
    where: {
      q: 'Where is my data stored?',
      a: [
        'Everything is in the data folder you chose during setup: the database, clips, cache, backups and Whisper models. System shows where it is.',
        'The database is backed up every day, and "Restore" in System brings a backup back. "Move data location" moves everything to another folder.',
      ],
    },
    privacy: {
      q: 'What goes over the internet?',
      a: [
        'Transcript and brief text go to the AI provider you chose. Audio goes to Groq only when a Groq API key is set. Videos are downloaded from YouTube with yt-dlp.',
        'Videos and clips are never uploaded. API keys are kept in Windows Credential Manager, not in a file.',
      ],
    },
    rights: {
      q: 'What about copyright?',
      a: [
        "You are responsible for making sure you may reuse someone else's video. Credit the source: \"Copy credit\" in the editor, or the source credit in the podcast and card layouts.",
      ],
    },
  },

  shortcuts: {
    title: 'Keyboard shortcuts',
    help: 'Open Help',
    editor: 'In the clip editor',
  },
  support: {
    title: 'Still stuck?',
    text: 'Copy the system info in About MetisClip (no API keys in it), and include it with the log files when you report the problem.',
    about: 'About MetisClip',
    openLogs: 'Open log folder',
  },
}
