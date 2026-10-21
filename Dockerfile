FROM node:20-alpine
WORKDIR /app

# pehle sirf package files copy karte hain, taaki dependencies ka layer cache ho
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# root user se nahi chalate (security)
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/health || exit 1

# pehle migrations, phir server
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]