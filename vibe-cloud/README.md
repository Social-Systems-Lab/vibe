# Vibe Cloud

Vibe Cloud is a self-hostable P2P communication service that provides signaling and TURN server functionality for the Vibe platform. It enables direct peer-to-peer connections between Vibe users across different network environments.

## Features

- **WebSocket-based Signaling Server**: Facilitates connection establishment, peer registration, and discovery
- **TURN Server**: Enables NAT traversal for challenging network environments
- **Time-limited Credential Generation**: Secure, temporary access to TURN services
- **Client SDK**: Easy integration with Vibe applications
- **Docker Support**: Simple deployment and hosting options

## Architecture

Vibe Cloud consists of two main components:

1. **Signaling Server**: Helps peers discover each other and exchange necessary connection information
2. **TURN Server**: Provides relay services when direct peer-to-peer connections are not possible

### TURN Server with Coturn

For production use, Vibe Cloud uses Coturn - a robust, high-performance TURN/STUN server. Key features:

- Runs as a separate Docker container for better scalability
- Uses the TURN REST API credential mechanism (RFC 7635)
- Supports both UDP and TCP transport
- Optional TLS support for secure communication
- Configured to handle a large number of simultaneous connections

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker and Docker Compose (for containerized deployment)

### Local Development

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`

4. Start the development server:

```bash
npm run dev
```

### Docker Deployment

1. Create a `.env` file with your configuration (optional):

```bash
# Basic configuration
PORT=5000
NODE_ENV=production
LOG_LEVEL=info

# TURN server configuration
TURN_AUTH_SECRET=your-strong-secret-key-here
```

2. Build and start using Docker Compose:

```bash
docker-compose up -d
```

3. Access the server at `http://localhost:5000`

This will start both the Vibe Cloud signaling server and the Coturn TURN server as separate containers, properly configured to work together.

## Client SDK Usage

The Vibe Cloud Client SDK allows easy integration with Vibe applications:

```typescript
import { VibeCloudClient, WebRTCPeer } from 'vibe-cloud/client';

// Create a client instance
const client = new VibeCloudClient({
  serverUrl: 'https://your-vibe-cloud-server.com',
  userId: 'user-123',
  deviceId: 'device-456'
});

// Connect to the signaling server
await client.connect();

// Join a room
const { roomId, peerId, peers, turnCredentials } = await client.joinRoom();

// Connect to peers
peers.forEach(peer => {
  // Create a WebRTC connection
  const connection = new WebRTCPeer(
    peer.peerId,
    client.getWebRTCConfig(),
    true // initiate connection
  );
  
  // Set up event handlers
  connection.onData(data => {
    console.log('Received data:', data);
  });
  
  connection.onSignal((signal, type) => {
    client.signal(peer.peerId, signal, type);
  });
  
  // Start connection
  connection.connect();
});

// Handle signals from the signaling server
client.onSignal(data => {
  // Find the connection for this peer
  const connection = /* get connection for data.peerId */;
  if (connection) {
    connection.handleSignal(data.signal, data.type);
  }
});
```

## Configuration

The server can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | HTTP server port | 5000 |
| HOST | HTTP server host | 0.0.0.0 |
| TURN_PORT | TURN server port | 3478 |
| TURN_REALM | TURN server realm | vibe.local |
| TURN_AUTH_SECRET | Secret key for TURN credentials | (required) |
| NODE_ENV | Environment (development/production) | development |
| LOG_LEVEL | Logging level | info |

## API Endpoints

- `GET /` - Service information
- `GET /health` - Health check endpoint
- `POST /api/turn/credentials` - Generate TURN credentials
- `GET /api/stats` - Server statistics (protected in production)

## Future Enhancements

- Enhanced authentication and authorization
- Support for peer-to-peer sync while offline
- Metrics and monitoring
- Rate limiting and abuse prevention
- Account-based configuration

## License

MIT