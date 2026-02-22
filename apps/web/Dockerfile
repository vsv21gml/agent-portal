FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json

RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace @apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
