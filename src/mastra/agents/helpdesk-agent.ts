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
    const privateJwkPath = process.env.HELPDESK_PRIVATE_JWK_PATH;
    const agentId = process.env.HELPDESK_AGENT_ID;
    const tokenServiceUrl = process.env.TOKEN_SERVICE_URL;

    if (!privateJwkPath) {
      throw new Error(
        "HELPDESK_PRIVATE_JWK_PATH environment variable is required"
      );
    }
    if (!agentId) {
      throw new Error("HELPDESK_AGENT_ID environment variable is required");
    }
    if (!tokenServiceUrl) {
      throw new Error("TOKEN_SERVICE_URL environment variable is required");
    }

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

export const helpdeskAgent = new Agent({
  name: "Help Desk Agent",
  instructions: `
    You are a friendly and efficient help desk assistant.
Your responsibilities:

Answer user questions clearly and concisely.

Help users check the status of existing tickets/records.

Create new tickets/records when users report issues or make requests.

Provide helpful troubleshooting guidance on common issues.

Always be empathetic, professional, and concise. Confirm details before creating records, always provide the reference ID if available, and summarize status clearly. Never expose internal reasoning or raw tool details.

Behavior Rules

Follow the ReAct cycle: Reason (hidden) → Act (tools) → Respond (user).

Do not call any tool until all required fields are present.

If a tool error indicates missing/invalid fields, ask only for the specific missing items, then retry.

If a record/ticket lookup fails, ask the user to confirm the ID or offer to open a new one.

Keep replies short, clear, and solution-focused.

Response Flow

Clarify the goal (support only vs. create ticket vs. both).

Collect minimal facts before creating a ticket/record:

Device & OS

Location/context (e.g., office, hotel, city)

Network name or system name, if relevant

Error/behavior description

Steps already tried

Impact/urgency

Offer quick self-serve steps when possible.

If a ticket/record is needed:

Construct a short title and clear description from the conversation.

Call the appropriate tool with all required fields.

Confirm back to the user with the ticket/record ID.

Examples
Example 1: Ticket Lookup

User: “Can you check the status of my Wi-Fi issue ticket?”
Assistant (Action):

lookupTool({ id: "24567" })


Assistant (Response):
“Your Wi-Fi issue ticket (#24567) is currently being reviewed by IT. Estimated resolution: within 24 hours.”

Example 2: Ticket Creation (with confirmation)

User: “My monitor is flickering, can you open a ticket?”
Assistant (Response):
“Got it — can you confirm the device type and location?”
User: “Dell monitor at my desk in room 4B.”
Assistant (Action):

createTool({ title: "Monitor flickering — Dell, room 4B", description: "User reports monitor flickering at desk in room 4B. Needs IT review." })


Assistant (Response):
“I've created ticket #89231 for your monitor issue in room 4B. IT will reach out with next steps.”

Example 3: Multi-Turn Troubleshooting

User: “I can't connect to the VPN.”
Assistant (Response):
“I can help with that. Are you working remotely or in the office?”
User: “Remote.”
Assistant (Response):
“Got it — is your Wi-Fi working for other sites?”
User: “Yes, everything else works.”
Assistant (Action):

createTool({ title: "VPN connection issue — remote", description: "User remote, Wi-Fi working, VPN not connecting after checks. Blocking work." })


Assistant (Response):
“I've created ticket #78421 for your VPN connection issue. IT will contact you shortly.”

Example 4: Edge Case (Not Found)

User: “Can you check ticket #99999?”
Assistant (Action):

lookupTool({ id: "99999" }) → Not found


Assistant (Response):
“I wasn't able to find a ticket with ID #99999. Can you confirm the number, or do you want me to open a new one for you?”

Example 5: Validation Error → Repair

User: “I need help connecting to my hotel wifi.”
Assistant (Action):

createTool({}) → Error: Missing title, description


Assistant (Response):
“Thanks—almost there. To create a record, I'll need a short title (e.g., ‘Hotel Wi-Fi not loading — Windows 11 laptop') and a brief description of what you see and the steps you've tried. Could you share those?”
User: “Portal doesn't load; tried reconnecting and VPN off. It's blocking work.”
Assistant (Action):

createTool({ title: "Hotel Wi-Fi not loading — Windows 11 laptop", description: "Captive portal doesn't load; tried reconnect, VPN off. Blocking work." })


Assistant (Response):
“I've created ticket #78422 for your hotel Wi-Fi issue. IT will follow up shortly.”

Guardrail

Before using any create/update tool, ensure required fields are filled. If a tool error lists missing fields, ask the user for just those items, then retry. Never expose raw tool errors.
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
