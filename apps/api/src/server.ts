import "./config/load-env.js";
import { buildApp } from "./app.js";
import { validateProductionAuthConfig } from "./auth/production-auth-config.js";
import { startApiServer } from "./server-startup.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

if (process.env.NODE_ENV === "production") {
  validateProductionAuthConfig();
}

const app = buildApp();

if (process.env.NODE_ENV !== "test") {
  startApiServer({ app, host, port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };
