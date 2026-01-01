FROM node:16.20.2-alpine3.18 AS builder

RUN corepack enable
ENV YARN_IGNORE_ENGINES=1
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY --chown=node:node package.json yarn.lock ./

USER node
ENV NODE_ENV=development
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean
COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./
RUN yarn run build

FROM builder AS install
ENV NODE_ENV=production
WORKDIR /home/node/app
RUN rm -rf ./node_modules && yarn install --frozen-lockfile --prod --non-interactive && yarn cache clean

FROM node:16.20.2-alpine3.18

RUN corepack enable
ENV YARN_IGNORE_ENGINES=1
RUN mkdir -p /home/node/app/cache/assets && chown -R node:node /home/node/app/cache
USER node
ENV NODE_ENV=production
ENV ASSET_CACHE_DIR=/home/node/app/cache/assets
WORKDIR /home/node/app
COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node ice.json ./
COPY --chown=node:node --from=builder /home/node/app/build ./build
COPY --chown=node:node --from=install /home/node/app/node_modules ./node_modules

EXPOSE 9000
CMD ["node", "--es-module-specifier-resolution=node", "./build/index.js"]
