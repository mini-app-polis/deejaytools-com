FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ts-utils/package.json ./packages/ts-utils/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/ts-utils/ ./packages/ts-utils/
COPY apps/api/ ./apps/api/

RUN pnpm --filter ts-utils build
RUN pnpm --filter api build

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]
