import type { Messages } from '../id'

export const status: Messages['status'] = {
  job: {
    pending: 'Waiting',
    running: 'Running',
    interrupted: 'Interrupted',
    cancelled: 'Cancelled',
    completed: 'Done',
    failed: 'Failed',
  },
  clip: {
    processing: 'Processing',
    ready: 'Ready',
    rendering: 'Rendering',
    exported: 'Exported',
    failed: 'Failed',
  },
  renderBadge: {
    queued: 'Render queued',
    rendering: 'Rendering',
    completed: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
  },
  render: {
    queued: 'Waiting in the render queue…',
    rendering: 'Burning subtitles into the video…',
    completed: 'Video rendered',
    failed: 'Render failed',
    cancelled: 'Render cancelled',
  },
  steps: {
    discovery: 'Finding the source video on YouTube',
    analysis: 'Analyzing the transcript & picking viral moments',
    processing: 'Cutting clips, cropping to faces & making subtitles',
    waiting: 'Waiting in the queue',
  },
  durations: {
    '30-45': '30 - 45 seconds (Ultra Short)',
    '45-60': '45 - 60 seconds (Shorts/Reels)',
    '60-75': '60 - 75 seconds (Story)',
    '75-90': '75 - 90 seconds (Deep-dive)',
  },
  source: { file: 'File', link: 'Link' },
  thousandSuffix: 'K',
  millionSuffix: 'M',
}
