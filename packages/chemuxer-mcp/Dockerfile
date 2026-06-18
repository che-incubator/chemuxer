FROM node:22-alpine AS build

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

FROM node:22-alpine

WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/chemuxer-mcp/package.json packages/chemuxer-mcp/package.json
COPY --from=build /app/packages/chemuxer-mcp/dist/ packages/chemuxer-mcp/dist/
RUN npm ci --omit=dev
RUN adduser -D -h /home/mcpuser mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "packages/chemuxer-mcp/dist/index.js"]
