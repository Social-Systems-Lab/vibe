# Vibe Cloud

Vibe Cloud is a self-sovereign personal cloud service that enables users to control their digital identity and data. It provides a secure platform for web applications to request access to read/write data to the user's vibe cloud, enabling interoperability between apps.

## Features

- **Self-Sovereign Identity**: RSA keypair-based authentication with DIDs (Decentralized Identifiers)
- **Secure Data Storage**: User data is stored securely and can only be accessed with proper authentication
- **Invite-Based Registration**: Control access to your vibe-cloud instance with invite codes
- **API Access**: Simple REST API for applications to interact with user data
- **Cross-Origin Support**: Built-in CORS support for web applications

## Architecture

Vibe Cloud uses a username@domain model where:

1. The username identifies a specific account on a vibe-cloud instance
2. The domain points to the vibe-cloud server hosting the account
3. RSA keypairs are generated and stored on the server, encrypted with the user's password
4. Authentication uses a challenge-response mechanism with the server signing challenges using the user's private key

## Prerequisites

- [Deno](https://deno.com/) v2.0 or higher
- [CouchDB](https://couchdb.apache.org/) for data storage

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/vibe-cloud.git
   cd vibe-cloud
   ```

2. Set up environment variables (create a `.env` file):
   ```
   PORT=8000
   HOST=0.0.0.0
   DENO_ENV=development
   ```

3. Start the server:
   ```
   deno task start
   ```

## Development

For development with auto-reload:

```
deno task dev
```

Run tests:

```
deno task test
```

## API Endpoints

### Authentication

- `POST /api/auth/challenge`: Request an authentication challenge
- `POST /api/auth/login`: Authenticate with username, password, and challenge
- `POST /api/auth/register`: Create a new account (requires invite code)
- `POST /api/auth/invite`: Generate a new invite code (admin only)

### Data Access

- `POST /api/data/:collection`: Read data from a collection
- `PUT /api/data/:collection`: Write data to a collection
- `DELETE /api/data/:collection/:id`: Delete a document from a collection

## Authentication Flow

```
1. Client requests a challenge from the server
2. Server generates a random challenge and returns it
3. Client submits username, password, and challenge to the server
4. Server verifies credentials and signs the challenge with the user's private key
5. Server returns the signed challenge and a session token
6. Client uses the session token for subsequent API requests
```

## License

MIT
