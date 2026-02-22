FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json

RUN npm ci

COPY apps/admin-web apps/admin-web
RUN npm run build --workspace @apps/admin-web

WORKDIR /app/apps/admin-web
EXPOSE 3100
CMD ["npm", "run", "start"]
