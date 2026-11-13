# syntax=docker/dockerfile:1.7
# Packetman web app (Next.js standalone) for self-hosting.
#   docker build -t packetman .
#   docker run -p 3000:3000 packetman

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/runtime/package.json packages/runtime/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter web build

FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S packetman && adduser -S packetman -G packetman
COPY --from=build --chown=packetman:packetman /repo/apps/web/.next/standalone ./
COPY --from=build --chown=packetman:packetman /repo/apps/web/.next/static ./apps/web/.next/static
USER packetman
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
