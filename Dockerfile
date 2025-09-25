# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies including python, make, g++, and postgresql-dev
RUN apk add --no-cache python3 make g++ postgresql-dev

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src
COPY migrations ./migrations

# Build the application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production image
FROM node:18-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache postgresql-client

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/ormconfig*.js ./

# Create necessary directories
RUN mkdir -p /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

# Default command to run the application
CMD ["node", "dist/index.js"]

# Stage 3: Development image (optional)
FROM node:18-alpine AS development

WORKDIR /app

# Install development dependencies
RUN apk add --no-cache python3 make g++ postgresql-dev

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies including devDependencies
RUN npm install

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Command to run the application in development mode
CMD ["npm", "run", "dev"]
