# Render provider runtime checklist

The API image contains the API, yt-dlp, FFmpeg, ffprobe, the pinned Bgutil
server, and the matching yt-dlp plugin. The image's default command is:

```text
node apps/api/dist/server.js
```

The API supervises Bgutil inside the same container. Bgutil must bind only to
`127.0.0.1:4416`; that port is internal and must not be published by Render.
The provider's `/ping` response is used as the readiness signal. The upstream
Bgutil documentation describes the same Node server command, default port, and
loopback behavior: <https://github.com/Brainicism/bgutil-ytdlp-pot-provider>.

## Render settings to verify

For the existing `instafetch-api` Web Service, verify these values in the
Render Dashboard:

| Setting | Required value |
| --- | --- |
| Runtime | Docker |
| Branch | `main` |
| Dockerfile path | `./Dockerfile` |
| Docker context | `.` |
| Docker Command override | empty; use the Dockerfile `CMD` |
| Build Command override | empty |
| Public service port | Render-provided `PORT` |
| `NODE_ENV` | `production` |
| `WEB_ORIGIN` | `https://instafetch.pages.dev` |
| `DOWNLOAD_TOKEN_SECRET` | configured secure secret; never commit it |

`POT_PROVIDER_ENTRYPOINT`, `POT_PROVIDER_NODE_PATH`, and
`POT_PROVIDER_PORT` are normally unnecessary. If they exist as Dashboard
overrides, they must match the image defaults:

```text
POT_PROVIDER_ENTRYPOINT=/opt/bgutil/server/build/main.js
POT_PROVIDER_PORT=4416
```

The Node executable should remain the container's `process.execPath` rather
than a user-provided command string.

Render uses the Dockerfile `CMD` unless a Docker Command override is set. The
Blueprint also leaves that override unset. See the current Render Docker
deployment guidance: <https://render.com/docs/docker>.

## Safe verification

After deploying the latest `main` commit, check:

```text
GET /health/live  -> 200
GET /health/ready -> 200
```

The readiness body should report `instagram: true`, `youtube: true`,
`ffmpeg: true`, `ffprobe: true`, and `potProvider: true`. The API emits only
sanitized provider lifecycle events to stderr, including launch, process exit,
ping timeout, restart, and readiness categories. It never emits provider URLs,
PO tokens, media URLs, cookies, credentials, or raw extractor output.

If the CI Docker gate reports a ready provider but Render remains
`potProvider: false`, inspect the effective Render Docker Command, image
commit, and startup logs before changing application code.
