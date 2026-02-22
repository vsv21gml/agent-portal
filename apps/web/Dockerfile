FROM node:24-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --filter @apps/web... --frozen-lockfile=false

COPY apps/web apps/web
WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
