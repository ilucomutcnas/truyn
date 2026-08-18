FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY adapters ./adapters
COPY core ./core
COPY network ./network
COPY node ./node
COPY runtime ./runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["node", "runtime/service.js"]
