FROM registry.access.redhat.com/ubi9/nodejs-22 AS build

USER 0
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
RUN rm -rf packages/chemuxer/server/src/__tests__ packages/chemuxer/client/src/__tests__ 2>/dev/null || true
WORKDIR /app/packages/chemuxer
RUN npm run build:bundle && npm run build:client

# Build node-pty in the build stage where build tools are available
WORKDIR /pty
RUN npm init -y && npm install node-pty@1.1.0

FROM registry.access.redhat.com/ubi9/nodejs-22-minimal

WORKDIR /app

# Copy pre-built node-pty from build stage (no build tools needed at runtime)
COPY --from=build /pty/node_modules/node-pty node_modules/node-pty

USER 0
RUN microdnf install -y shadow-utils && \
    useradd -r -m -d /home/chemuxer chemuxer && \
    chown -R chemuxer:chemuxer /app && \
    microdnf remove -y shadow-utils && microdnf clean all

COPY --from=build --chown=chemuxer:chemuxer /app/packages/chemuxer/dist/server/server.js dist/server/server.js
COPY --from=build --chown=chemuxer:chemuxer /app/packages/chemuxer/dist/client dist/client

USER chemuxer
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/dist/client
EXPOSE 7681
ENV NODE_ENV=production
CMD ["node", "dist/server/server.js"]
