import type { Messages } from '../id'

export const captions: Messages['captions'] = {
  quick: {
    top: 'Top',
    middle: 'Middle',
    bottom: 'Bottom',
  },
  quickLabel: 'Quick position',
  quickHint: "All three are in the area that TikTok, IG Reels and YT Shorts don't cover with their own UI.",
  quickGroup: 'Quick caption position',
  vertical: 'Vertical position',
  verticalHint: 'Distance from the bottom of the caption to the bottom of the video.',
  horizontal: 'Horizontal position',
  horizontalHint: (pct: number) => `${pct}% = center of the video.`,
  safeTitle: 'Safe on every platform',
  safeBody: "The caption isn't covered by the title, description or buttons of TikTok, IG Reels and YT Shorts.",
  listJoin: (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`),
  coveredTitle: (platforms: string) => `May be covered by the ${platforms} UI`,
  coveredBody: "Part of the caption is in the area of those apps' title, description or buttons.",
  moveToSafe: 'Move to the safe area',
}
