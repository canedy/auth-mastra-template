import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { makeVerifier } from "../../auth/verifyAssertion";

interface Ticket {
  id: string;
  title: string;
  by: string;
  description?: string;
  status?: "open" | "in_progress" | "closed";
  createdAt?: string;
}

const verify = makeVerifier(
  process.env.JWKS_URL ?? "http://localhost:8787/.well-known/jwks.json",
  process.env.TICKETS_AUD ?? "https://tools.local/tickets"
);

// policy check (super simple): allow only specific agents
const ALLOWED_AGENTS = new Set([
  "agent://demo/a1",
  "agent://helpdesk/hd1",
  "agent://worf", // From the private key file
  "a1-ed25519-2023-10-01-12345678",
  process.env.AGENT_ID,
  process.env.HELPDESK_AGENT_ID,
]);

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
      const { agentId: verifiedAgentId } = await verify(
        `Bearer ${context.authToken}`
      );

      if (!ALLOWED_AGENTS.has(verifiedAgentId)) {
        throw new Error("Agent not authorized to access tickets");
      }

      // Use the verified agent ID from the JWT token
      return await getTickets(verifiedAgentId, context.status);
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
      const { agentId: verifiedAgentId } = await verify(
        `Bearer ${context.authToken}`
      );

      if (!ALLOWED_AGENTS.has(verifiedAgentId)) {
        throw new Error("Agent not authorized to create tickets");
      }

      // Use the verified agent ID from the JWT token
      return await createTicket(
        context.title,
        context.description,
        verifiedAgentId
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
