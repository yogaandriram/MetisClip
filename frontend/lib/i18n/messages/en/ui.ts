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
  workspaceSwitcher: {
    loading: 'Loading workspaces…',
    choose: 'Choose a workspace',
    active: (name: string) => `Active workspace: ${name}. Switch workspace`,
    heading: 'Workspace',
    empty: 'No workspaces yet. Create one to get started.',
    manage: 'Manage workspaces',
  },
  tags: {
    remove: (tag: string) => `Remove ${tag}`,
    full: (n: number) => `Up to ${n} items`,
  },
}
