FROM node:24-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --filter @apps/admin-web... --frozen-lockfile=false

COPY apps/admin-web apps/admin-web
WORKDIR /app/apps/admin-web
RUN pnpm build

EXPOSE 3100
CMD ["pnpm", "start"]
