import type { Messages } from '../id'

export const presets: Messages['presets'] = {
  layout: {
    full: { name: 'Full 9:16', description: 'The video cropped to 9:16, following the face.' },
    'full-zoom': { name: 'Full + zoom', description: 'A smooth zoom on every AI keyword.' },
    podcast: { name: 'Podcast blur', description: 'Original ratio, blurred video background, title above.' },
    'podcast-dark': { name: 'Dark podcast', description: 'Original ratio on a black background.' },
    'podcast-boxed': { name: 'Boxed title', description: 'Gradient, rounded video, title in a box.' },
    'blur-clean': { name: 'Blur, no title', description: 'Original ratio over a blur, no extra text.' },
    'card-light': { name: 'Light card', description: 'Post style: account name, text, then the video.' },
    'card-dark': { name: 'Dark card', description: 'Dark post style on a black background.' },
    split: { name: 'Companion video', description: 'The speaker on top, a silent companion video below.' },
    'split-line': { name: 'Companion + line', description: 'A bigger speaker part, a white line in the middle.' },
    duo: { name: 'Two speakers', description: 'Two people in one frame, split into top and bottom.' },
    'duo-line': { name: 'Two speakers + line', description: 'Two panels with a white line in the middle.' },
    auto: { name: 'Automatic per scene', description: 'One person full, two people as two panels, slides in a frame.' },
  },
}
