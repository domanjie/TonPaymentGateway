import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { db } from "./db/client.js";
import { redis } from "./lib/redis.js";
import merchantRoutes from "./routes/merchants.js";
import paymentRoutes from "./routes/payments.js";
import webhookRoutes from "./routes/webhooks.js";
import apiKeyRoutes from "./routes/api-keys.js";
import authRoutes from "./routes/auth.js";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "warn" : "info",
  },
});

// ── Plugins ──────────────────────────────────────────────────
await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  redis,
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET || "dev-secret-change-me",
});

// ── Auth decorator ────────────────────────────────────────────
app.decorate("authenticate", async (request, reply) => {
  const apiKey = request.headers["x-api-key"];
  if (apiKey) {
    const result = await db.query(
      `SELECT ak.*, m.id as merchant_id, m.wallet_address
       FROM api_keys ak
       JOIN merchants m ON m.id = ak.merchant_id
       WHERE ak.key = $1 AND ak.is_active = TRUE`,
      [apiKey]
    );
    if (result.rows.length === 0) {
      reply.status(401).send({ error: "Invalid API key" });
      return;
    }
    request.merchant = result.rows[0];
    // Update last_used_at
    await db.query(`UPDATE api_keys SET last_used_at = NOW() WHERE key = $1`, [apiKey]);
    return;
  }
  // Fallback to JWT
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized" });
  }
});

// ── Routes ────────────────────────────────────────────────────
await app.register(authRoutes, { prefix: "/auth" });
await app.register(merchantRoutes, { prefix: "/merchants" });
await app.register(paymentRoutes, { prefix: "/payments" });
await app.register(webhookRoutes, { prefix: "/webhooks" });
await app.register(apiKeyRoutes, { prefix: "/api-keys" });

// Health check
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || "0.0.0.0";

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`🚀 API Server running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
