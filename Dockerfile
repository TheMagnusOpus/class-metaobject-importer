FROM node:20-alpine

# Required for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy dependency manifests first
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the app
RUN npm run build

# App listens on port 3000
EXPOSE 3000

# Run setup (migrations) then start server
CMD ["npm", "run", "docker-start"]
