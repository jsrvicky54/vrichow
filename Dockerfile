FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3000

# Apply any new migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]
