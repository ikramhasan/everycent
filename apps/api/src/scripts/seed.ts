import { parseEnv } from "../env";
import { DEMO_USER, seedDemoUser } from "../lib/demo-user";
import { loadRootEnv } from "../load-env";

loadRootEnv();
const result = await seedDemoUser(parseEnv());
console.log(
  result === "created"
    ? `Created demo user ${DEMO_USER.email} / ${DEMO_USER.password}`
    : `Demo user already exists: ${DEMO_USER.email}`,
);
