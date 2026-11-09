/** @type {import('next').NextConfig} */
// Static export: the UI is served by Electron from app://metisclip/ (packaged) or by
// `next dev` on http://localhost:3000 (development). See docs/desktop-contract.md §5.
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

module.exports = nextConfig
