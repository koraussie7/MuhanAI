import Fastify from "fastify";
import cors from "@fastify/cors";
import { noemaRoutes } from "./noema-routes.js";
import { semanticRoutes } from "./semantic-routes.js";
import { hivebearRoutes } from "./hivebear-routes.js";
import { knowledgeRoutes } from "./knowledge-routes.js";
import { networkRoutes } from "./network-routes.js";
import { agentsRoutes } from "./agents-routes.js";
import { computeRoutes } from "./compute-routes.js";

const app = Fastify({ logger: true });

// CORS: restrict to known origins in production, allow localhost in development
const allowedOrigins = process.env.NODE_ENV === "production"
  ? (process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://muhanai.com", "https://www.muhanai.com"])
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"), false);
    }
  },
  credentials: true,
});

// API Key authentication middleware for sensitive endpoints
app.addHook("onRequest", async (request, reply) => {
  // Skip auth for health check and public endpoints
  const publicPaths = ["/api/pulse", "/api/network", "/api/agents", "/health"];
  if (publicPaths.includes(request.url)) {
    return;
  }

  // Skip auth in development if explicitly disabled
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_AUTH === "true") {
    return;
  }

  const apiKey = request.headers["x-api-key"];
  const validApiKey = process.env.API_KEY;

  // If API_KEY is set in env, require valid key for non-public routes
  if (validApiKey && apiKey !== validApiKey) {
    reply.code(401).send({ error: "Unauthorized: invalid or missing API key" });
  }
});

await app.register(noemaRoutes);
await app.register(semanticRoutes);
await app.register(hivebearRoutes);
await app.register(knowledgeRoutes);
await app.register(networkRoutes);
await app.register(agentsRoutes);
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
