FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=128
COPY package.json index.js ./
USER node
CMD ["node", "index.js"]
