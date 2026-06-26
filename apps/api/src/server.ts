import "./config/load-env.js";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

if (process.env.NODE_ENV !== "test") {
  app
    .listen({ host, port })
    .then(() => {
      app.log.info(`SketchCatch API listening on ${host}:${port}`);
    })
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
}

export { app };
