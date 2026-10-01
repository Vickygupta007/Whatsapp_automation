# Multi-stage production build for WhatsApp Optical ERP Automation
# Stage 1: Build frontend and backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm ci

# Copy full source
COPY . .

# Generate Prisma client
WORKDIR /app/backend
RUN npx prisma generate

# Build frontend and backend
WORKDIR /app
RUN npm run build:frontend
RUN npm run build:backend

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy root package.json for workspace runner
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy Prisma schema and generated client from builder
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=builder /app/backend/node_modules/@prisma ./backend/node_modules/@prisma
COPY --from=builder /app/backend/prisma ./backend/prisma

# Copy built backend code and built frontend static assets
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/config ./backend/config
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose server port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start production server
CMD ["node", "backend/dist/server.js"]
