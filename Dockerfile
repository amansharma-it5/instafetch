ARG NODE_VERSION=26
ARG YTDLP_VERSION=2026.8.19
ARG GALLERY_DL_VERSION=1.32.14
ARG BGUTIL_VERSION=2.0.0
ARG YTDLP_EJS_VERSION=0.8.0

FROM node:${NODE_VERSION}-bookworm-slim AS provider-build
ARG BGUTIL_VERSION
WORKDIR /opt/bgutil

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl python3 make g++ pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/* \
  && curl --fail --silent --show-error --location "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/${BGUTIL_VERSION}.tar.gz" --output /tmp/bgutil.tar.gz \
  && tar --extract --gzip --file /tmp/bgutil.tar.gz --strip-components=1 --directory /opt/bgutil \
  && rm /tmp/bgutil.tar.gz

WORKDIR /opt/bgutil/server
RUN npm ci --no-audit --no-fund \
  && npx tsc \
  && npm prune --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS app-build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps apps
COPY packages packages

RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS provider-runtime
WORKDIR /opt/bgutil/server
COPY --from=provider-build /opt/bgutil/server/package.json /opt/bgutil/server/package-lock.json ./
COPY --from=provider-build /opt/bgutil/server/node_modules ./node_modules
COPY --from=provider-build /opt/bgutil/server/build ./build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG YTDLP_VERSION
ARG GALLERY_DL_VERSION
ARG BGUTIL_VERSION
ARG YTDLP_EJS_VERSION

ENV NODE_ENV=production \
  BGUTIL_SERVER_PATH=/opt/bgutil/server/build/main.js
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg python3 python3-pip libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && python3 -m pip install --no-cache-dir --break-system-packages \
    "yt-dlp==${YTDLP_VERSION}" \
    "yt-dlp-ejs==${YTDLP_EJS_VERSION}" \
    "gallery-dl==${GALLERY_DL_VERSION}" \
    "bgutil-ytdlp-pot-provider==${BGUTIL_VERSION}" \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /root/.cache

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=app-build /app/apps/api/dist ./apps/api/dist
COPY --from=app-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=provider-runtime /opt/bgutil/server /opt/bgutil/server

RUN chown -R node:node /app /opt/bgutil
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/api/dist/server.js"]
