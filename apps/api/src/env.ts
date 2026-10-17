import { z } from "zod";

/** An empty value in .env means "unset". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    /** Resend API key. Without it, development logs emails to the console instead of sending. */
    RESEND_API_KEY: optional(z.string().startsWith("re_", "must be a Resend API key (re_…)")),
    /**
     * Sender: an address (`hello@example.com`), a display form (`everycent <hello@example.com>`),
     * or just a verified sending domain (`mail.example.com`, sent as `no-reply@` that domain).
     */
    FROM_EMAIL: optional(z.string().min(3)),
    /**
     * Comma-separated CIDRs of the reverse proxies in front of the API. Rate limits key on the
     * client IP from `x-forwarded-for`; with this set, the chain is trusted only through these hops.
     */
    TRUSTED_PROXIES: optional(z.string()),
    /**
     * `all` (default): the API process also runs background jobs. `api`: it only queues them, and
     * a separate `node dist/worker.mjs` process runs them.
     */
    JOBS_MODE: z.enum(["all", "api"]).default("all"),
    /**
     * The built web app (`apps/web/dist`) for the API to serve on the same origin; the Docker
     * image sets it. Unset, the API serves only the API (development runs Vite).
     */
    WEB_DIST_DIR: optional(z.string().min(1)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["RESEND_API_KEY", "FROM_EMAIL"] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "required in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
