import { createRouter } from "../../lib/router";
import {
  createCategoryGroupHandler,
  createCategoryHandler,
  deleteCategoryGroupHandler,
  deleteCategoryHandler,
  listCategoriesHandler,
  moveCategoryGroupHandler,
  moveCategoryHandler,
  updateCategoryGroupHandler,
  updateCategoryHandler,
} from "./handlers";
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  listCategories,
  moveCategory,
  moveCategoryGroup,
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
  .openapi(moveCategory, moveCategoryHandler);
