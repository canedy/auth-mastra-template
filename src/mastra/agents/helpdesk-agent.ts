import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ticketsTool, createTicketTool } from "../tools/tickets-tool";
import { makeClientAssertion } from "../../auth/signAssertion";

async function getAuthToken(): Promise<string> {
  try {
    const privateJwkPath =
      process.env.HELPDESK_PRIVATE_JWK_PATH ||
      "/home/brucec/techplay2/sandbox/auth-template-hackathon-v0/secrets/a1-ed25519-2023-10-01-12345678.private.jwk.json";
    const audience = process.env.TICKETS_AUD || "https://tools.local/tickets";
    const agentId =
      process.env.HELPDESK_AGENT_ID || "a1-ed25519-2023-10-01-1234567";

    return await makeClientAssertion({
      privateJwkPath,
      audience,
      agentId,
    });
  } catch (error) {
    console.error("Failed to generate auth token:", error);
    throw error;
  }
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
    1. First call getAuthToken to get your authentication token
    2. Use the token with ticketsTool or createTicketTool
    3. The system will automatically handle your identity from the token
  `,
  model: openai("gpt-4o-mini"),
  tools: {
    ticketsTool,
    createTicketTool,
    getAuthToken: createTool({
      id: "getAuthToken",
      description: "Generate JWT authentication token for ticket operations",
      inputSchema: z.object({}),
      outputSchema: z.object({
        authToken: z.string(),
      }),
      execute: async () => {
        const token = await getAuthToken();
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
