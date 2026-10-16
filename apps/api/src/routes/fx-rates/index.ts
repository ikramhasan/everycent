import { createRouter } from "../../lib/router";
import {
  deleteFxRateOverrideHandler,
  getFxRateHandler,
  listFxRateOverridesHandler,
  putFxRateOverrideHandler,
} from "./handlers";
import { deleteFxRateOverride, getFxRate, listFxRateOverrides, putFxRateOverride } from "./routes";

export const fxRatesRouter = createRouter()
  .openapi(getFxRate, getFxRateHandler)
  .openapi(listFxRateOverrides, listFxRateOverridesHandler)
  .openapi(putFxRateOverride, putFxRateOverrideHandler)
  .openapi(deleteFxRateOverride, deleteFxRateOverrideHandler);
