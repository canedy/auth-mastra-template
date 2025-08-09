# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Identity and Authorization system for AI Agents built using the Mastra framework. It demonstrates sophisticated AI agent orchestration with Ed25519 JWT-based authentication, persistent memory, and modular tool integration.

## Commands

### Development
```bash
# Install dependencies (requires Node.js >=20.9.0)
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run production server
pnpm start
```

### Environment Setup
Create a `.env` file with:
```
OPENAI_API_KEY=your_api_key
AGENT_ID=unique_agent_identifier
KID=key_identifier_for_jwt
```

## Architecture

### Core Framework
- **Mastra Framework**: Central orchestration system that manages agents, tools, and workflows
- **Module System**: ES2022 modules with TypeScript for type safety
- **Authentication**: Ed25519 JWT-based system for agent identity verification

### Key Components

1. **Agent System** (`src/agents/`)
   - `weather-agent.ts`: GPT-4o-mini powered assistant with conversation persistence
   - Uses LibSQL for thread-based memory storage
   - Configured with tool access and systematic prompts

2. **Tool Integration** (`src/tools/`)
   - `weather-tool.ts`: Integrates Open-Meteo API for weather data
   - Returns structured weather information with error handling
   - Accessible to agents through Mastra tool registry

3. **Workflow Engine** (`src/workflows/`)
   - `weather-workflow.ts`: Multi-step weather processing pipeline
   - Combines weather data fetching with activity planning
   - Demonstrates agent-tool collaboration patterns

4. **Authentication** (`src/auth.ts`)
   - Generates Ed25519 key pairs for JWT signing
   - Creates signed JWTs for agent authentication
   - Provides secure identity verification for AI agents

5. **Main Application** (`src/index.ts`)
   - Initializes Mastra instance with configuration
   - Registers agents, tools, and workflows
   - Sets up API server for interaction

### Configuration Patterns
- Zod schemas for input validation throughout
- Environment-based configuration for API keys
- Modular registration of components in Mastra instance

## Tech Stack
- **Runtime**: Node.js >=20.9.0 with pnpm
- **Language**: TypeScript with ES2022 features
- **AI**: OpenAI GPT-4o-mini
- **Framework**: Mastra for agent orchestration
- **Storage**: LibSQL/SQLite for persistence
- **Validation**: Zod for schema validation
- **Auth**: Ed25519 JWT implementation

## Key Architectural Decisions

1. **Agent-Tool Separation**: Tools are independent modules that agents can access, promoting reusability
2. **Workflow Abstraction**: Complex multi-step processes are encapsulated in workflows for clarity
3. **JWT Authentication**: Provides cryptographically secure agent identity without external dependencies
4. **Thread-Based Memory**: Each conversation thread maintains context using SQLite persistence
5. **Schema Validation**: All inputs are validated using Zod schemas for type safety and runtime validation