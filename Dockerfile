FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist dist/

EXPOSE 7681
CMD ["node", "dist/server/main.js"]
