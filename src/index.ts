import { buildServer } from "./http/server.js";
import { buildControllers } from "./composition-root.js";
import { config } from "./config.js";
import { prisma } from "./infrastructure/db/client.js";

const app = await buildServer(buildControllers());
app.addHook("onClose", () => prisma.$disconnect());

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
