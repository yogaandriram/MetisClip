import type { Messages } from '../id'

export const dashboard: Messages['dashboard'] = {
  title: 'Home',
  subtitle: 'An overview of your agentic AI activity.',
  summaryLoading: 'Loading overview…',
  summaryUnavailable: "The overview couldn't be loaded yet.",
  summary: (clips: string, jobs: string) => `${clips}, ${jobs}.`,
  readyClips: (n: number) => `${n} ${n === 1 ? 'clip' : 'clips'} ready to export`,
  noReadyClips: 'No clips ready to export yet',
  runningJobs: (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'} running`,
  noRunningJobs: 'nothing running',
  loadFailed: "Couldn't load the overview",
  keys: {
    title: 'API keys missing',
    openSettings: 'Open Settings',
    groq: 'Groq API key',
    llm: (provider: string) => `${provider} API key`,
    missing: (names: string[]) =>
      names.length > 1
        ? `The ${names.join(' and the ')} are not set yet. The AI pipeline won't run without these keys.`
        : `The ${names[0]} is not set yet. The AI pipeline won't run without this key.`,
  },
  stats: {
    readyClips: 'Clips ready to export',
    videosProcessed: 'Videos processed',
    newClip: 'Make new clips',
  },
  latestClips: {
    title: 'Latest clips',
    made: (n: number, shown: string) => `${shown} ${n === 1 ? 'clip' : 'clips'} made in this workspace`,
    seeAll: 'See all',
    emptyTitle: 'No clips yet',
    emptyDescription: 'Paste a YouTube link or choose a video file in Find Video to make your first clips.',
    openDiscover: 'Open Find Video',
    openClip: (name: string) => `Open clip: ${name}`,
  },
  latestJobs: {
    title: 'Latest jobs',
    empty: 'No jobs yet. Start from Find Video.',
    fallbackTitle: 'Job',
  },
  hero: {
    running: 'Running',
    idleTitle: 'Paste a YouTube link',
    idleText: 'Nothing is running. Start from a long video link or a file on your PC.',
    seeQueue: 'View queue',
    queued: 'Queued',
    clipOf: (done: number, total: number) => `clip ${done} of ${total}`,
  },
}
