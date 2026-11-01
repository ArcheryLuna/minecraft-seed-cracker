# syntax=docker/dockerfile:1
#
# Seed Cracker as a container. Multi-stage: install dependencies, build the
# Next.js standalone server, then copy only what it needs into a slim image.
#
#   docker build -t seed-cracker .
#   docker run --rm -p 3000:3000 seed-cracker      # http://localhost:3000
#
# The app does all seed cracking in the visitor's browser, so the container
# only serves pages and static files.

ARG NODE_VERSION=24

# ---------------------------------------------------------------- base
# Debian slim (glibc) rather than Alpine: the Tailwind and CSS build tools ship
# native binaries, and glibc matches the lockfile most developers generate.
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------- dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server, plus the static files it serves itself
# (Next.js leaves public/ and .next/static out of the standalone folder).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# The official Node image includes an unprivileged "node" user.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
