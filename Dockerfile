# Multi-stage build for tiny production image
FROM node:20-alpine AS build

# set workdir
WORKDIR /usr/src/app

# install pnpm
RUN npm install -g pnpm

# copy manifests first for cached installs
COPY package*.json pnpm-lock.yaml ./

# install all deps (including dev for build)
RUN pnpm install --frozen-lockfile

# copy app sources
COPY . .

# build the TypeScript
RUN pnpm run build

# Production stage
FROM node:20-alpine AS production

# set workdir
WORKDIR /usr/src/app

# install pnpm
RUN npm install -g pnpm

# copy manifests
COPY package*.json pnpm-lock.yaml ./

# install only production deps
RUN pnpm install --prod --frozen-lockfile

# copy built app from build stage
COPY --from=build /usr/src/app/dist ./
COPY --from=build /usr/src/app/public ./public

# use non-root user from the official image
USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# run the server file
CMD ["node", "server.js"]