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
  recentColors: 'Recently used',
  stepDone: 'Done',
  runningJobs: (n: number) => (n === 1 ? 'job running' : 'jobs running'),
  newClip: 'New clip',
  campaignSwitcher: {
    loading: 'Loading campaigns…',
    choose: 'Choose a campaign',
    active: (name: string) => `Active campaign: ${name}. Switch campaign`,
    heading: 'Active campaign',
    empty: 'No active campaigns yet. Create one to get started.',
    manage: 'Manage campaigns',
  },
  tags: {
    remove: (tag: string) => `Remove ${tag}`,
    full: (n: number) => `Up to ${n} items`,
  },
}
