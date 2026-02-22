FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json

RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace @apps/api

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "start"]
