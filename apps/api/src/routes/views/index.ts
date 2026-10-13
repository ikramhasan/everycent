import { createRouter } from "../../lib/router";
import {
  createViewHandler,
  deleteViewHandler,
  listViewsHandler,
  reorderViewsHandler,
  updateViewHandler,
} from "./handlers";
import { createView, deleteView, listViews, reorderViews, updateView } from "./routes";

export const viewsRouter = createRouter()
  .openapi(listViews, listViewsHandler)
  .openapi(createView, createViewHandler)
  .openapi(reorderViews, reorderViewsHandler)
  .openapi(updateView, updateViewHandler)
  .openapi(deleteView, deleteViewHandler);
