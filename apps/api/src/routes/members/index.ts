import { createRouter } from "../../lib/router";
import {
  acceptInvitationHandler,
  cancelInvitationHandler,
  changeMemberRoleHandler,
  createInvitationHandler,
  createInvitationLinkHandler,
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
  changeMemberRole,
  createInvitation,
  createInvitationLink,
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
  .openapi(createInvitationLink, createInvitationLinkHandler)
  .openapi(cancelInvitation, cancelInvitationHandler)
  .openapi(viewInvitation, viewInvitationHandler)
  .openapi(acceptInvitation, acceptInvitationHandler)
  .openapi(removeMember, removeMemberHandler)
  .openapi(changeMemberRole, changeMemberRoleHandler)
  .openapi(leaveBudget, leaveBudgetHandler)
  .openapi(transferOwnership, transferOwnershipHandler);
