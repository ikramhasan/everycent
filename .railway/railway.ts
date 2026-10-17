import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

/**
 * everycent on Railway (Infrastructure as Code: `railway config plan` / `apply`; EVERYCENT-105).
 * One service built from the repo's Dockerfile (API + web app on one origin) and Postgres. The
 * image is the same one any host runs; nothing here changes how it behaves.
 */
// biome-ignore lint/suspicious/noTemplateCurlyInString: Railway's reference syntax, not a JS template.
const PUBLIC_URL = "https://${{RAILWAY_PUBLIC_DOMAIN}}";

export default defineRailway(() => {
  const db = postgres("postgres");

  const app = service("everycent", {
    // Deploys every push to main once its CI checks pass. Needs Railway's GitHub app on the repo.
    source: github("ikramhasan/everycent", { branch: "main", checkSuites: true }),
    // Migrations and the job queue's schema, once per deploy, before the new version starts.
    preDeploy: "node dist/migrate.mjs",
    healthcheck: "/v1/health",
    healthcheckTimeout: 60,
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // The service's own generated domain; one origin serves the web app and the API.
      BETTER_AUTH_URL: PUBLIC_URL,
      WEB_ORIGIN: PUBLIC_URL,
      // Railway's edge overwrites X-Real-IP on every request and publishes no proxy ranges, so
      // rate limits read it rather than X-Forwarded-For through TRUSTED_PROXIES.
      CLIENT_IP_HEADER: "x-real-ip",
      // Secrets are set in Railway and kept as they are.
      BETTER_AUTH_SECRET: preserve(),
      RESEND_API_KEY: preserve(),
      FROM_EMAIL: preserve(),
    },
  });

  return project("everycent", { resources: [app, db] });
});
