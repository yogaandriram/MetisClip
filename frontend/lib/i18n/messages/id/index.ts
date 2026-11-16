// Bahasa Indonesia, the source dictionary: its shape is the `Messages` type every language must match.
//
// Conventions:
// - One namespace per screen or area; shared words in `common`, statuses in `status`.
// - Plain strings for fixed text; functions for text with values (`deleted: (n: number) => …`), so each
//   language handles its own word order and plurals.
// - No markup in strings. For text with a link or bold part, split it into pieces.
import { common } from './common'
import { status } from './status'
import { shell } from './shell'
import { ui } from './ui'
import { setup } from './setup'
import { settings } from './settings'
import { system } from './system'
import { dashboard } from './dashboard'
import { discover } from './discover'
import { jobs } from './jobs'
import { clips } from './clips'
import { editor } from './editor'
import { captions } from './captions'
import { brand } from './brand'
import { presets } from './presets'
import { campaign } from './campaign'
import { brief } from './brief'

export const id = {
  common,
  status,
  shell,
  ui,
  setup,
  settings,
  system,
  dashboard,
  discover,
  jobs,
  clips,
  editor,
  captions,
  brand,
  presets,
  campaign,
  brief,
}

export type Messages = typeof id
