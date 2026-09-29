# YouTube v1 architecture note

InstaFetch will add anonymous public YouTube video and Shorts resolution beside the existing Instagram path. Both platforms use the same high-level flow:

```text
validated public URL
  -> platform extraction adapter
  -> yt-dlp metadata JSON (no download)
  -> platform-aware normalization and policy checks
  -> short-lived server-side resolution store
  -> application preview/download token
  -> bounded materialization and stream
```

Platform adapters own URL parsing, provider error mapping, and metadata policy. The shared yt-dlp process wrapper remains the single command boundary: it uses `spawn` with `shell: false`, fixed arguments, ignored user configuration, bounded output, and a timeout. No cookies, credentials, browser profiles, or user-controlled flags are accepted.

Normalized media items retain provider URLs only in the server-side resolution store. Public responses expose opaque item identifiers and application `/api/preview` and `/api/download` URLs. The existing HMAC token, SSRF checks, file-size limit, temporary cache TTL, and materialization concurrency remain the enforcement boundary for both platforms.

YouTube playlists are deliberately outside v1. A `watch` URL with a selected `v` video is accepted even when tracking parameters include `list`; playlist-only URLs fail with a safe `PLAYLIST_NOT_SUPPORTED` error. Videos longer than 20 minutes, live/DRM/age-restricted/private content, and metadata that cannot prove a playable media stream fail safely.

Instagram remains the regression-critical path. The first YouTube release keeps it unchanged behind its existing route/provider adapter and adds deterministic unit/API/browser coverage for YouTube-specific validation, normalization, errors, and privacy boundaries.
