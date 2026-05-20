# Production Dockerfile for NestJS Backend
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Generate Prisma client and build NestJS
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

# --- Production runner ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

# Start script running migrations first
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
