# InstaFetch

InstaFetch is a public Instagram media downloader under active development. It is designed for publicly accessible posts only and never collects Instagram credentials, browser cookies, or private-account access.

## Phase 1 status

Phase 1 establishes the React/Vite and Express/TypeScript foundations and shared Instagram URL validation. Downloader routes and the complete interface are intentionally out of scope for this phase.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- yt-dlp, ffmpeg, and ffprobe on PATH for live extraction checks

## Development

```text
npm install
npm run lint
npm run test
npm run build
```

Run the development applications separately:

```text
npm run dev:web
npm run dev:api
```

Copy `.env.example` to `.env` for local settings. Do not put credentials or API keys in the repository.
