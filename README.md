# AI Agent Authentication System

A JWT-based authentication and authorization system for AI agents, built with the Mastra framework. This system implements OAuth2-style token exchange with Ed25519 cryptographic signatures and scope-based permissions.

## Features

- **JWT Token Exchange**: OAuth2-style client assertion flow for secure token issuance
- **Ed25519 Signatures**: Cryptographically secure digital signatures using Ed25519 algorithm
- **Scope-Based Authorization**: Fine-grained permissions using scope validation
- **Token Service Integration**: Centralized token issuance with policy enforcement
- **Help Desk Agent**: Example AI agent with ticket management capabilities
- **Replay Protection**: Built-in replay attack prevention with JWT ID tracking
- **Token Caching**: Intelligent token caching with automatic expiration handling

## Prerequisites

- Node.js >= 20.9.0
- pnpm package manager
- Token service running (separate service for token exchange)
- JWKS service running (serves public keys for verification)

## Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

```bash
# OpenAI API Key (for AI agent)
OPENAI_API_KEY=your_openai_api_key

# Token Service Configuration
TOKEN_SERVICE_URL=http://localhost:3001          # Token exchange endpoint
TOKEN_SERVICE_JWKS_URL=http://localhost:8787/.well-known/jwks.json  # Public keys

# Agent Configuration
HELPDESK_AGENT_ID=agent://worf                   # Agent identifier
HELPDESK_PRIVATE_JWK_PATH=secrets/a1-ed25519-2023-10-01-12345678.private.jwk.json
```

### Private Key Setup

The system requires an Ed25519 private key for the agent. Example structure:

```json
{
  "crv": "Ed25519",
  "d": "private_key_material_base64",
  "x": "public_key_material_base64",
  "kty": "OKP",
  "kid": "a1-ed25519-2023-10-01-12345678",
  "alg": "EdDSA",
  "use": "sig",
  "agent_id": "agent://worf"
}
```

## Architecture

### Authentication Flow

```
1. Agent creates client assertion (signed JWT)
2. Agent exchanges assertion for access token at Token Service
3. Token Service validates assertion and checks policy
4. Token Service issues access token with appropriate scopes
5. Agent uses access token to call tools
6. Tools verify token using JWKS public keys
7. Tools validate required scopes for operation
```

### Components

1. **Help Desk Agent** (`src/mastra/agents/helpdesk-agent.ts`)

   - AI-powered agent for ticket management
   - Handles JWT token acquisition and caching
   - Integrates with ticket tools

2. **Ticket Tools** (`src/mastra/tools/tickets-tool.ts`)

   - Get tickets (requires `tickets.read` scope)
   - Create tickets (requires `tickets.write` scope)
   - JWT verification and scope validation

3. **Authentication Module** (`src/auth/`)
   - `signAssertion.ts`: Creates client assertions and handles token exchange
   - `verifyAssertion.ts`: Verifies access tokens and validates scopes

## Running the System

### 1. Start Required Services

```bash
General speaking you will need to use a auth and token providers. I have set up a general purpose auth server for the agent to talk to as shown in the example below.

Auth-jwks-service

# Terminal 1: Start JWKS service (port 8787)
cd auth-jwks-service-v0
PORT=8787 npm run server

# Terminal 2: Start Token service (port 3001)
cd auth-jwks-service-v0
npm run token-service
```

### 2. Configure Token Service Policy

This policy is set in my general purpose auth jwks service. This is just attempting to demostrate that you can authrize an agent to call tools or workflows and you can set a policy to what they are able to do once they get access.

Update the policy in the token service to include your agent:

```typescript
// auth-jwks-service-v0/src/policy.ts
export const POLICY: Record<string, string[]> = {
  "agent://worf": ["tickets.read", "tickets.write"],
  // Add other agents as needed
};
```

### 3. Start the Mastra Application

```bash
# Build and run
pnpm build
pnpm run dev

# The playground will be available at http://localhost:4112
```

## Security Features

### Token Lifecycle Management

- **Smart Caching**: Tokens cached based on actual expiration time
- **Automatic Cleanup**: Expired tokens removed from cache
- **Buffer Time**: Tokens refreshed before expiration

### Replay Protection

- **JWT ID Tracking**: Each token has unique identifier (jti)
- **Per-Agent Tracking**: Same agent can reuse cached tokens
- **Attack Prevention**: Prevents replay attacks from intercepted tokens

### Scope-Based Authorization

- **Fine-Grained Permissions**: Each operation requires specific scopes
- **Policy Enforcement**: Centralized policy in token service
- **Tool-Level Validation**: Each tool validates required scopes

## Usage Example

### Interacting with the Help Desk Agent

1. **Get Tickets**: Agent requests `tickets.read` scope
2. **Create Ticket**: Agent requests `tickets.write` scope
3. **Automatic Token Management**: Tokens cached and reused efficiently

The agent will:

- Automatically acquire access tokens when needed
- Cache tokens to minimize token service requests
- Handle token expiration gracefully
- Validate scopes for each operation

## Testing

### Test Authentication Flow

```bash
# The agent will automatically:
# 1. Create client assertion with private key
# 2. Exchange for access token at token service
# 3. Use access token with ticket tools
# 4. Handle token caching and expiration
```

### Verify Policy Enforcement

1. Try operations with valid scopes → ✅ Success
2. Remove agent from policy → ❌ Token exchange fails
3. Remove scope from policy → ❌ Operation fails

## Key Management

### JWKS Configuration

The JWKS service should include public keys for both:

- Agent keys (for client assertions)
- Token service keys (for access tokens)

Both keys may use the same public key material but with different `kid` values:

- `kid: "a1-ed25519-2023-10-01-12345678"` for agent assertions
- `kid: "agent://worf"` for token service tokens

## Development Tips

### Debugging Authentication Issues

1. **Check Services**: Ensure both token service and JWKS service are running
2. **Verify Policy**: Confirm agent is in token service policy
3. **Check Keys**: Ensure public key in JWKS matches private key
4. **Monitor Logs**: Watch console output for detailed error messages

### Common Issues

| Issue                           | Cause           | Solution                             |
| ------------------------------- | --------------- | ------------------------------------ |
| "no applicable key found"       | Key ID mismatch | Ensure JWKS has correct public key   |
| "signature verification failed" | Key mismatch    | Public key doesn't match private key |
| "Insufficient permissions"      | Missing scope   | Check token service policy           |
| "exp claim failed"              | Token expired   | Check token caching logic            |
| "Replay detected"               | Token reuse     | Normal for cached tokens             |

## Project Structure

```
├── src/
│   ├── auth/                 # Authentication modules
│   │   ├── signAssertion.ts  # JWT creation & token exchange
│   │   └── verifyAssertion.ts # Token verification
│   ├── mastra/
│   │   ├── agents/           # AI agents
│   │   │   └── helpdesk-agent.ts
│   │   ├── tools/            # Agent tools
│   │   │   └── tickets-tool.ts
│   │   └── index.ts          # Mastra configuration
│   └── secrets/              # Private keys (git-ignored)
├── .env                      # Environment configuration
├── package.json
└── README.md
```

## 🤝 Contributing

This is a demonstration system for my personal JWT-based agent authentication. You can connect to that repo or find your own provider for these concepts.

---

Built with [Mastra Framework](https://mastra.dev)
