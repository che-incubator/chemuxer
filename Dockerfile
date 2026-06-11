FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ pkgconf pixman-dev cairo-dev pango-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
# Remove test files to avoid TypeScript compilation errors
RUN rm -rf server/src/__tests__ client/src/__tests__ 2>/dev/null || true
# Bundle server into single file + build client
RUN npm run build:bundle && npm run build:client

FROM node:22-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /app

# Only install node-pty (the sole native dependency that can't be bundled)
RUN npm init -y && npm install node-pty@1.1.0 && apk del python3 make g++

# Copy bundled server and client assets
COPY --from=build /app/dist/server/server.js dist/server/server.js
COPY --from=build /app/dist/client dist/client

ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/dist/client
EXPOSE 7681
CMD ["node", "dist/server/server.js"]
