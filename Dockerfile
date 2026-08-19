# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Runtime config: the entrypoint drop-in rewrites config.js from $API_URL every
# time the container starts, so one image serves every deployment.
COPY docker/config.js.template /etc/vtafarm/config.js.template
COPY docker/40-vtafarm-config.sh /docker-entrypoint.d/40-vtafarm-config.sh
# Not redundant with the file's own mode: nginx's entrypoint silently skips a
# .sh without the exec bit, and the container then starts healthy while serving
# the empty placeholder config. A checkout with core.fileMode=false is enough
# to cause that.
RUN chmod +x /docker-entrypoint.d/40-vtafarm-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
