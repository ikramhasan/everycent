import { createRoute, z } from "@hono/zod-openapi";
import { jsonError } from "../../lib/errors";
import { MAX_PICTURE_BYTES, PICTURE_TYPES } from "../../lib/storage/images";
import { requireAuth } from "../../middleware/require-auth";
import { pictureBodyLimit } from "./handlers";

const PictureBody = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: z.object({
        file: z
          .custom<File>((v) => v instanceof File, { message: "Expected a file" })
          .openapi({ type: "string", format: "binary" }),
      }),
    },
  },
} as const;
const pictureRules =
  `A square image the browser cropped: ${PICTURE_TYPES.join(", ")}, read from its bytes; at most ` +
  `${MAX_PICTURE_BYTES / 1024 / 1024} MB.`;
const VersionQuery = z.object({
  v: z
    .string()
    .max(100)
    .optional()
    .describe("The picture's version (from its URL), so a new one isn't served from a cache"),
});
const pictureErrors = {
  400: jsonError("No file, or an empty one"),
  401: jsonError("Not signed in"),
  413: jsonError("Bigger than the limit (`FILE_TOO_LARGE`)"),
  415: jsonError("Not a PNG, JPEG or WebP image (`UNSUPPORTED_FILE_TYPE`)"),
  503: jsonError("This server has no file storage (`ATTACHMENTS_DISABLED`)"),
} as const;
const served = {
  200: {
    description: "The image",
    content: { "image/*": { schema: z.string().openapi({ format: "binary" }) } },
  },
  302: { description: "Where to fetch the image (a signed link)" },
} as const;

export const PictureSchema = z
  .object({
    url: z.string().describe("Where the image is (an API path with its version)"),
  })
  .openapi("Picture");

export const setProfilePicture = createRoute({
  method: "put",
  path: "/me/picture",
  operationId: "setProfilePicture",
  tags: ["Users"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth, pictureBodyLimit] as const,
  summary: "Set or replace the profile picture",
  description: `Shown as a circle wherever the user is. ${pictureRules}`,
  request: { body: PictureBody },
  responses: {
    200: {
      description: "Set; the user's `image` is its URL",
      content: { "application/json": { schema: PictureSchema } },
    },
    ...pictureErrors,
  },
});

export const deleteProfilePicture = createRoute({
  method: "delete",
  path: "/me/picture",
  operationId: "deleteProfilePicture",
  tags: ["Users"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Remove the profile picture",
  responses: {
    204: { description: "Removed (or there was none)" },
    401: jsonError("Not signed in"),
  },
});

export const getProfilePicture = createRoute({
  method: "get",
  path: "/users/{userId}/picture",
  operationId: "getProfilePicture",
  tags: ["Users"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "A user's profile picture",
  description: "Your own, or that of someone who shares a budget with you.",
  request: {
    params: z.object({
      userId: z.string().openapi({ param: { name: "userId", in: "path" } }),
    }),
    query: VersionQuery,
  },
  responses: {
    ...served,
    401: jsonError("Not signed in"),
    404: jsonError("No picture, or not someone you share a budget with"),
    503: jsonError("This server has no file storage (`ATTACHMENTS_DISABLED`)"),
  },
});

const AccountParams = z.object({
  budgetId: z.string().openapi({ param: { name: "budgetId", in: "path" } }),
  accountId: z.string().openapi({ param: { name: "accountId", in: "path" } }),
});

export const setAccountLogo = createRoute({
  method: "put",
  path: "/budgets/{budgetId}/accounts/{accountId}/logo",
  operationId: "setAccountLogo",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth, pictureBodyLimit] as const,
  summary: "Set or replace an account's logo",
  description: `Shown before the account's name. ${pictureRules}`,
  request: { params: AccountParams, body: PictureBody },
  responses: {
    200: {
      description: "Set; the account's `logo` is its URL",
      content: { "application/json": { schema: PictureSchema } },
    },
    ...pictureErrors,
    403: jsonError("The caller's role can't change accounts"),
    404: jsonError("No such budget or account, or the caller isn't a member"),
  },
});

export const deleteAccountLogo = createRoute({
  method: "delete",
  path: "/budgets/{budgetId}/accounts/{accountId}/logo",
  operationId: "deleteAccountLogo",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "Remove an account's logo",
  request: { params: AccountParams },
  responses: {
    204: { description: "Removed (or there was none)" },
    401: jsonError("Not signed in"),
    403: jsonError("The caller's role can't change accounts"),
    404: jsonError("No such budget or account, or the caller isn't a member"),
  },
});

export const getAccountLogo = createRoute({
  method: "get",
  path: "/budgets/{budgetId}/accounts/{accountId}/logo",
  operationId: "getAccountLogo",
  tags: ["Accounts"],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  summary: "An account's logo",
  request: { params: AccountParams, query: VersionQuery },
  responses: {
    ...served,
    401: jsonError("Not signed in"),
    404: jsonError("No logo, no such account, or the caller isn't a member"),
    503: jsonError("This server has no file storage (`ATTACHMENTS_DISABLED`)"),
  },
});
