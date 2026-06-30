FROM registry.access.redhat.com/ubi9/nodejs-22 AS build

USER 0
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/chemuxer-mcp/package.json packages/chemuxer-mcp/package.json
RUN npm ci
COPY packages/shared/ packages/shared/
RUN npm run build -w packages/shared
COPY packages/chemuxer-mcp/ packages/chemuxer-mcp/
RUN rm -rf packages/chemuxer-mcp/src/__tests__ 2>/dev/null || true
RUN npm run build -w packages/chemuxer-mcp

FROM registry.access.redhat.com/ubi9/nodejs-22-minimal

WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/chemuxer-mcp/package.json packages/chemuxer-mcp/package.json
COPY --from=build /app/packages/chemuxer-mcp/dist/ packages/chemuxer-mcp/dist/
RUN npm ci --omit=dev

USER 0
RUN useradd -r -m -d /home/mcpuser mcpuser && chown -R mcpuser:mcpuser /app
USER mcpuser

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/chemuxer-mcp/dist/index.js"]
