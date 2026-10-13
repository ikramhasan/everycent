import { createRouter } from "../../lib/router";
import {
  acceptInvitationHandler,
  cancelInvitationHandler,
  createInvitationHandler,
  listMembersHandler,
  resendInvitationHandler,
  viewInvitationHandler,
} from "./handlers";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  listMembers,
  resendInvitation,
  viewInvitation,
} from "./routes";

export const membersRouter = createRouter()
  .openapi(listMembers, listMembersHandler)
  .openapi(createInvitation, createInvitationHandler)
  .openapi(resendInvitation, resendInvitationHandler)
  .openapi(cancelInvitation, cancelInvitationHandler)
  .openapi(viewInvitation, viewInvitationHandler)
  .openapi(acceptInvitation, acceptInvitationHandler);
