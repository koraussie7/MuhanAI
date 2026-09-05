import Fastify from "fastify";
import cors from "@fastify/cors";
import { noemaRoutes } from "./noema-routes.js";
import { semanticRoutes } from "./semantic-routes.js";
import { hivebearRoutes } from "./hivebear-routes.js";
import { knowledgeRoutes } from "./knowledge-routes.js";
import { computeRoutes } from "./compute-routes.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(noemaRoutes);
await app.register(semanticRoutes);
await app.register(hivebearRoutes);
await app.register(knowledgeRoutes);
await app.register(computeRoutes);

const start = async () => {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
    console.log("API server listening on http://0.0.0.0:3001");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
