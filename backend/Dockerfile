FROM node:20-slim

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies (not ci, avoids EBUSY)
RUN npm install --legacy-peer-deps

# Copy the rest
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN npm run build

# Start
CMD ["npm", "run", "start"]
