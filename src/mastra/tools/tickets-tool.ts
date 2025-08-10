import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { makeAccessTokenVerifier, makeVerifier } from "../../auth/verifyAssertion";

interface Ticket {
  id: string;
  title: string;
  by: string;
  description?: string;
  status?: "open" | "in_progress" | "closed";
  createdAt?: string;
}

// Use token service JWKS for access token verification
const verifyAccessToken = makeAccessTokenVerifier(
  process.env.TOKEN_SERVICE_JWKS_URL ?? "http://localhost:8787/.well-known/jwks.json",
  process.env.TICKETS_AUD ?? "https://tools.local/tickets"
);

// Fallback verifier for direct JWTs (when token service is unavailable)
const verifyDirectJWT = makeVerifier(
  process.env.JWKS_URL ?? "http://localhost:8787/.well-known/jwks.json",
  process.env.TICKETS_AUD ?? "https://tools.local/tickets"
);

// Helper function to verify token - ONLY accepts access tokens from token service
async function verifyToken(authHeader: string, requiredScope: string) {
  try {
    // Only accept access tokens from token service
    const result = await verifyAccessToken(authHeader);
    
    // Check if token has required scope
    if (!result.scopes.includes(requiredScope)) {
      throw new Error(`Insufficient permissions: ${requiredScope} scope required`);
    }
    
    return { agentId: result.agentId, scopes: result.scopes };
  } catch (error: any) {
    // No fallback - proper security requires the token service to be running
    if (error.message.includes('Invalid issuer')) {
      throw new Error('Token service required - direct JWT not accepted for security');
    }
    
    throw error; // Re-throw the original error
  }
}

// Helper function to check if scopes include required permission
function hasRequiredScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

export const ticketsTool = createTool({
  id: "get-tickets",
  description: "Get tickets for the authenticated agent",
  inputSchema: z.object({
    authToken: z.string().describe("JWT authorization token"),
    status: z
      .enum(["all", "open", "in_progress", "closed"])
      .optional()
      .default("all")
      .describe("Filter tickets by status"),
  }),
  outputSchema: z.object({
    tickets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        by: z.string(),
        description: z.string().optional(),
        status: z.enum(["open", "in_progress", "closed"]).optional(),
        createdAt: z.string().optional(),
      })
    ),
    count: z.number(),
  }),
  execute: async ({ context }) => {
    try {
      const { agentId } = await verifyToken(`Bearer ${context.authToken}`, "tickets.read");
      
      // Use the verified agent ID from the token
      return await getTickets(agentId, context.status);
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  },
});

const getTickets = async (agentId: string, statusFilter: string = "all") => {
  // Stub business logic - replace with actual database/API calls
  const allTickets: Ticket[] = [
    {
      id: "T-1",
      title: "Hello",
      by: agentId,
      description: "Initial ticket",
      status: "open",
      createdAt: new Date().toISOString(),
    },
    {
      id: "T-2",
      title: "Bug Report",
      by: agentId,
      description: "System issue reported",
      status: "in_progress",
      createdAt: new Date().toISOString(),
    },
    {
      id: "T-3",
      title: "Feature Request",
      by: agentId,
      description: "New feature suggestion",
      status: "closed",
      createdAt: new Date().toISOString(),
    },
  ];

  // Filter tickets based on status
  let filteredTickets = allTickets;
  if (statusFilter !== "all") {
    filteredTickets = allTickets.filter(
      (ticket) => ticket.status === statusFilter
    );
  }

  return {
    tickets: filteredTickets,
    count: filteredTickets.length,
  };
};

export const createTicketTool = createTool({
  id: "create-ticket",
  description: "Create a new ticket",
  inputSchema: z.object({
    authToken: z.string().describe("JWT authorization token"),
    title: z.string().describe("Ticket title"),
    description: z.string().optional().describe("Ticket description"),
  }),
  outputSchema: z.object({
    ticket: z.object({
      id: z.string(),
      title: z.string(),
      by: z.string(),
      description: z.string().optional(),
      status: z.enum(["open", "in_progress", "closed"]),
      createdAt: z.string(),
    }),
    success: z.boolean(),
  }),
  execute: async ({ context }) => {
    try {
      const { agentId } = await verifyToken(`Bearer ${context.authToken}`, "tickets.write");
      
      // Use the verified agent ID from the token
      return await createTicket(
        context.title,
        context.description,
        agentId
      );
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  },
});

const createTicket = async (
  title: string,
  description: string | undefined,
  agentId: string
) => {
  // Stub business logic - replace with actual database/API calls
  const newTicket = {
    id: `T-${Date.now()}`,
    title,
    description,
    by: agentId,
    status: "open" as const,
    createdAt: new Date().toISOString(),
  };

  // In a real implementation, save to database here

  return {
    ticket: newTicket,
    success: true,
  };
};
