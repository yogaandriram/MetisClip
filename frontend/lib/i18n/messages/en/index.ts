// English. Each namespace is typed as Messages['<namespace>'], so a missing, extra or differently typed
// key fails the type check.
import type { Messages } from '../id'
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
import { about } from './about'
import { help } from './help'

export const en: Messages = {
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
  about,
  help,
}
