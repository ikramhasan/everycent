import { createRouter } from "../../lib/router";
import {
  createCategoryGroupHandler,
  createCategoryHandler,
  deleteCategoryGroupHandler,
  deleteCategoryHandler,
  deleteCategoryTargetHandler,
  listCategoriesHandler,
  moveCategoryGroupHandler,
  moveCategoryHandler,
  setCategoryTargetHandler,
  updateCategoryGroupHandler,
  updateCategoryHandler,
} from "./handlers";
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  deleteCategoryTarget,
  listCategories,
  moveCategory,
  moveCategoryGroup,
  setCategoryTarget,
  updateCategory,
  updateCategoryGroup,
} from "./routes";

export const categoriesRouter = createRouter()
  .openapi(listCategories, listCategoriesHandler)
  .openapi(createCategoryGroup, createCategoryGroupHandler)
  .openapi(updateCategoryGroup, updateCategoryGroupHandler)
  .openapi(deleteCategoryGroup, deleteCategoryGroupHandler)
  .openapi(moveCategoryGroup, moveCategoryGroupHandler)
  .openapi(createCategory, createCategoryHandler)
  .openapi(updateCategory, updateCategoryHandler)
  .openapi(deleteCategory, deleteCategoryHandler)
  .openapi(moveCategory, moveCategoryHandler)
  .openapi(setCategoryTarget, setCategoryTargetHandler)
  .openapi(deleteCategoryTarget, deleteCategoryTargetHandler);
