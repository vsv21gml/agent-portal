FROM node:24-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
RUN pnpm install --filter @apps/api... --frozen-lockfile=false

COPY apps/api apps/api
WORKDIR /app/apps/api
RUN pnpm build

EXPOSE 4000
CMD ["pnpm", "start"]
