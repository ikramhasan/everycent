import { createRouter } from "../../lib/router";
import {
  deleteAccountLogoHandler,
  deleteProfilePictureHandler,
  getAccountLogoHandler,
  getProfilePictureHandler,
  setAccountLogoHandler,
  setProfilePictureHandler,
} from "./handlers";
import {
  deleteAccountLogo,
  deleteProfilePicture,
  getAccountLogo,
  getProfilePicture,
  setAccountLogo,
  setProfilePicture,
} from "./routes";

export const picturesRouter = createRouter()
  .openapi(setProfilePicture, setProfilePictureHandler)
  .openapi(deleteProfilePicture, deleteProfilePictureHandler)
  .openapi(getProfilePicture, getProfilePictureHandler)
  .openapi(setAccountLogo, setAccountLogoHandler)
  .openapi(deleteAccountLogo, deleteAccountLogoHandler)
  .openapi(getAccountLogo, getAccountLogoHandler);
