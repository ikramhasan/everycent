import { createRouter } from "../../lib/router";
import {
  acceptInvitationHandler,
  cancelInvitationHandler,
  createInvitationHandler,
  leaveBudgetHandler,
  listMembersHandler,
  removeMemberHandler,
  resendInvitationHandler,
  transferOwnershipHandler,
  viewInvitationHandler,
} from "./handlers";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  leaveBudget,
  listMembers,
  removeMember,
  resendInvitation,
  transferOwnership,
  viewInvitation,
} from "./routes";

export const membersRouter = createRouter()
  .openapi(listMembers, listMembersHandler)
  .openapi(createInvitation, createInvitationHandler)
  .openapi(resendInvitation, resendInvitationHandler)
  .openapi(cancelInvitation, cancelInvitationHandler)
  .openapi(viewInvitation, viewInvitationHandler)
  .openapi(acceptInvitation, acceptInvitationHandler)
  .openapi(removeMember, removeMemberHandler)
  .openapi(leaveBudget, leaveBudgetHandler)
  .openapi(transferOwnership, transferOwnershipHandler);
