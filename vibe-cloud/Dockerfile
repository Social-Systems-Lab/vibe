FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose ports - HTTP server, TURN/STUN
EXPOSE 5000
EXPOSE 3478/tcp
EXPOSE 3478/udp

# Run the server
CMD ["npm", "start"]