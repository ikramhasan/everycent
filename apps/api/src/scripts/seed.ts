import { parseEnv } from "../env";
import { DEMO_USER, seedDemoUser } from "../lib/demo-user";
import { loadRootEnv } from "../load-env";

loadRootEnv();
const created = await seedDemoUser(parseEnv());
console.log(
  created.user
    ? `Created demo user ${DEMO_USER.email} / ${DEMO_USER.password}`
    : `Demo user already exists: ${DEMO_USER.email}`,
);
if (created.budget) console.log("Added the sample budget");
