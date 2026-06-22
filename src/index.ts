import { buildServer } from "./http/server.js";
import { config } from "./config.js";

const app = buildServer();

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
