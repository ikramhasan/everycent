import { createRouter } from "../../lib/router";
import {
  getAgentApprovalHandler,
  listConnectedAgentsHandler,
  revokeConnectedAgentHandler,
} from "./handlers";
import { getAgentApproval, listConnectedAgents, revokeConnectedAgent } from "./routes";

export const agentsRouter = createRouter()
  .openapi(listConnectedAgents, listConnectedAgentsHandler)
  .openapi(revokeConnectedAgent, revokeConnectedAgentHandler)
  .openapi(getAgentApproval, getAgentApprovalHandler);
