FROM node:20-slim

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the app
COPY . .

# Generate Prisma client for Linux
RUN npx prisma generate

# Build NestJS
RUN npm run build

# Start
CMD ["node", "dist/src/main.js"]
