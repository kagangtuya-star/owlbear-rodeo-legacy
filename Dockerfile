# 本镜像用于本地开发环境，运行 React 前端开发服务器

FROM node:16.20.2-alpine3.18 AS deps

RUN corepack enable
ENV YARN_IGNORE_ENGINES=1
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node package.json yarn.lock ./

USER node
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

FROM node:16.20.2-alpine3.18

RUN corepack enable
ENV YARN_IGNORE_ENGINES=1
USER node
ENV NODE_ENV=development
WORKDIR /home/node/app

COPY --chown=node:node package.json yarn.lock tsconfig.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
COPY --chown=node:node --from=deps /home/node/app/node_modules ./node_modules

EXPOSE 3000
CMD ["yarn", "start"]
