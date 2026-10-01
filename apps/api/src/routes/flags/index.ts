import { createRouter } from "../../lib/router";
import { listFlagsHandler, renameFlagHandler } from "./handlers";
import { listFlags, renameFlag } from "./routes";

export const flagsRouter = createRouter()
  .openapi(listFlags, listFlagsHandler)
  .openapi(renameFlag, renameFlagHandler);
