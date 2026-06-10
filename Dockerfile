FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ pkgconf pixman-dev cairo-dev pango-dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++
COPY --from=build /app/dist dist/

ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/dist/client
EXPOSE 7681
CMD ["node", "dist/server/server/src/main.js"]
