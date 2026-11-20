import type { Messages } from '../id'

export const ui: Messages['ui'] = {
  confirm: 'Yes, continue',
  show: 'Show',
  hide: 'Hide',
  colorCode: 'Color code',
  decrease: 'Decrease',
  increase: 'Increase',
  progress: 'Progress',
  viralScore: 'Viral score',
  viralScoreValue: (n: number) => `Viral score ${n}`,
  manualClip: 'Manual',
  manualClipTip: 'A moment you chose, without a viral score',
  recentColors: 'Recently used',
  stepDone: 'Done',
  runningJobs: (n: number) => (n === 1 ? 'job running' : 'jobs running'),
  newClip: 'New clip',
  tags: {
    remove: (tag: string) => `Remove ${tag}`,
    full: (n: number) => `Up to ${n} items`,
  },
}
