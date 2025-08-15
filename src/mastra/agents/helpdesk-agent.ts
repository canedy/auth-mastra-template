import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ticketsTool, createTicketTool } from "../tools/tickets-tool";
import {
  exchangeForAccessToken,
  makeClientAssertion,
} from "../../auth/signAssertion";

// Token cache to avoid repeated exchanges
const tokenCache = new Map<string, { token: string; expires: number }>();

// Helper function to decode JWT payload without verification
function decodeJWTPayload(token: string) {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload;
  } catch (error) {
    return null;
  }
}

async function getAccessToken(
  targetAudience: string,
  scopes: string[]
): Promise<string> {
  try {
    const privateJwkPath =
      process.env.HELPDESK_PRIVATE_JWK_PATH ||
      "/home/brucec/techplay2/sandbox/auth-template-hackathon-v0/secrets/a1-ed25519-2025-08-15-d0a5e088.private.jwk.json";
    const agentId = process.env.HELPDESK_AGENT_ID || "agent://demo/a1";
    const tokenServiceUrl =
      process.env.TOKEN_SERVICE_URL || "http://localhost:8787";

    console.log(
      `Getting access token for audience: ${targetAudience}, scopes: ${scopes.join(
        ","
      )}`
    );
    console.log(`Using token service: ${tokenServiceUrl}`);
    console.log(`Agent ID: ${agentId}`);

    // Create cache key
    const cacheKey = `${targetAudience}:${scopes.sort().join(",")}`;

    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      // Double-check the actual token hasn't expired
      const payload = decodeJWTPayload(cached.token);
      const tokenExp = payload?.exp * 1000; // Convert to milliseconds

      if (tokenExp && tokenExp > Date.now() + 30 * 1000) {
        // 30 second buffer
        console.log("Using cached token");
        return cached.token;
      } else {
        console.log("Cached token expired, removing from cache");
        tokenCache.delete(cacheKey);
      }
    }

    console.log("Cache miss, requesting new token");

    // Get access token from token service (no fallback for security)
    const accessToken = await exchangeForAccessToken({
      privateJwkPath,
      agentId,
      tokenServiceUrl,
      targetAudience,
      scopes,
    });

    // Cache token based on its actual expiration time
    const payload = decodeJWTPayload(accessToken);
    const tokenExp = payload?.exp * 1000; // Convert to milliseconds
    const cacheUntil = tokenExp
      ? Math.min(tokenExp - 60 * 1000, Date.now() + 4 * 60 * 1000)
      : Date.now() + 4 * 60 * 1000;

    tokenCache.set(cacheKey, {
      token: accessToken,
      expires: cacheUntil, // Cache until 1 minute before token expires, or 4 minutes max
    });

    console.log("Successfully obtained and cached access token");
    return accessToken;
  } catch (error) {
    console.error("Failed to get access token:", error);
    throw error;
  }
}

// Legacy function for backward compatibility
async function getAuthToken(): Promise<string> {
  return getAccessToken("https://tools.local/tickets", [
    "tickets.read",
    "tickets.write",
  ]);
}

export const helpdeskAgent = new Agent({
  name: "Help Desk Agent",
  instructions: `
    You are a friendly and efficient help desk assistant. Your primary responsibilities are:
    
    1. Answer user questions clearly and concisely
    2. Help users look up existing tickets to check status
    3. Create new tickets when users report issues or make requests
    4. Provide helpful guidance on common issues
    
    When handling tickets:
    - Always confirm the details before creating a new ticket
    - Provide the ticket ID to the user after creation
    - When looking up tickets, provide a clear summary of the status
    - Be empathetic and professional when dealing with user issues
    
    Keep your responses helpful, clear, and to the point. Always aim to resolve user queries efficiently.
    
    For ticket operations:
    1. To read tickets: Call getTicketsToken, then use the token with ticketsTool
    2. To create tickets: Call getCreateTicketToken, then use the token with createTicketTool
    3. The system uses scope-based permissions - tokens are issued with only needed permissions
  `,
  model: openai("gpt-4o-mini"),
  tools: {
    ticketsTool,
    createTicketTool,
    getTicketsToken: createTool({
      id: "getTicketsToken",
      description: "Get access token for reading tickets",
      inputSchema: z.object({}),
      outputSchema: z.object({
        authToken: z.string(),
      }),
      execute: async () => {
        const token = await getAccessToken("https://tools.local/tickets", [
          "tickets.read",
        ]);
        return { authToken: token };
      },
    }),
    getCreateTicketToken: createTool({
      id: "getCreateTicketToken",
      description: "Get access token for creating tickets",
      inputSchema: z.object({}),
      outputSchema: z.object({
        authToken: z.string(),
      }),
      execute: async () => {
        const token = await getAccessToken("https://tools.local/tickets", [
          "tickets.write",
        ]);
        return { authToken: token };
      },
    }),
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../helpdesk.db", // Separate database for help desk conversations
    }),
  }),
});
