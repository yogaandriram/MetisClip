// Remotion CLI config (studio + `npm run bundle`). The render worker (render.ts) only consumes the
// prebuilt bundle in build/, so everything that affects the bundle must live here.
import path from 'node:path';
// @ts-ignore - typed by @remotion/cli
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Dedicated (empty) public dir: keeps legacy render-engine/public/tmp_videos out of the bundle.
Config.setPublicDir('./static');

// The presets are imported from ../frontend/lib/presets, whose `react` import would otherwise resolve
// to frontend/node_modules/react. Force ONE React copy (this package's) for everything in the bundle.
// The CLI only picks up remotion.config.ts from the current directory, so cwd is this package's root
// (__dirname here points into @remotion/cli, not at this file).
const here = process.cwd();
const nm = (p: string) => path.join(here, 'node_modules', p);

Config.overrideWebpackConfig((current: any) => ({
  ...current,
  resolve: {
    ...current.resolve,
    alias: {
      ...(current.resolve?.alias || {}),
      react: nm('react'),
      'react-dom': nm('react-dom'),
    },
  },
}));
