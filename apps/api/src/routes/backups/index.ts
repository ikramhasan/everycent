import { createRouter } from "../../lib/router";
import { exportBackupHandler, importBackupHandler } from "./handlers";
import { exportBackup, importBackup } from "./routes";

export const backupsRouter = createRouter()
  .openapi(exportBackup, exportBackupHandler)
  .openapi(importBackup, importBackupHandler);
