FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ pkgconf pixman-dev cairo-dev pango-dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/chemuxer/package.json packages/chemuxer/package.json
COPY packages/chemuxer-mcp/package.json packages/chemuxer-mcp/package.json
RUN npm ci
COPY packages/shared/ packages/shared/
RUN npm run build -w packages/shared
COPY packages/chemuxer/tsconfig.json packages/chemuxer/tsconfig.json
COPY packages/chemuxer/server/ packages/chemuxer/server/
COPY packages/chemuxer/client/ packages/chemuxer/client/
# Remove test files to avoid TypeScript compilation errors
RUN rm -rf packages/chemuxer/server/src/__tests__ packages/chemuxer/client/src/__tests__ 2>/dev/null || true
WORKDIR /app/packages/chemuxer
# Bundle server into single file + build client
RUN npm run build:bundle && npm run build:client

FROM node:22-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /app

# Only install node-pty (the sole native dependency that can't be bundled).
# node-pty ships prebuilds for darwin/windows but not linux — it compiles from
# source into build/Release/pty.node. The resolver also checks
# prebuilds/linux-<arch>/ and fails if absent. Create the expected directory
# with a symlink so both resolution paths work.
RUN npm init -y && npm install node-pty@1.1.0 && apk del python3 make g++ \
    && ARCH=$(uname -m | sed 's/x86_64/x64/' | sed 's/aarch64/arm64/') \
    && mkdir -p node_modules/node-pty/prebuilds/linux-${ARCH} \
    && ln -s ../../build/Release/pty.node node_modules/node-pty/prebuilds/linux-${ARCH}/pty.node

# Create non-root user and transfer ownership
RUN adduser -D -h /home/chemuxer chemuxer && chown -R chemuxer:chemuxer /app

# Copy bundled server and client assets
COPY --from=build --chown=chemuxer:chemuxer /app/packages/chemuxer/dist/server/server.js dist/server/server.js
COPY --from=build --chown=chemuxer:chemuxer /app/packages/chemuxer/dist/client dist/client

USER chemuxer
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/dist/client
EXPOSE 7681
ENV NODE_ENV=production
CMD ["node", "dist/server/server.js"]
