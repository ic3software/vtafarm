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

COPY docker/config.js.template /etc/vtafarm/config.js.template
COPY docker/40-vtafarm-config.sh /docker-entrypoint.d/40-vtafarm-config.sh
# nginx silently skips a .sh without the exec bit, leaving a healthy container
# serving the empty placeholder.
RUN chmod +x /docker-entrypoint.d/40-vtafarm-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
