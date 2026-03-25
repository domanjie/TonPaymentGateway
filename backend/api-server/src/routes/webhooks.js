import { db } from "../db/client.js";
import crypto from "crypto";

export default async function webhookRoutes(app) {
  // GET /webhooks
  app.get("/", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const result = await db.query(
      `SELECT id, url, events, is_active, created_at FROM webhooks WHERE merchant_id = $1`,
      [merchantId]
    );
    return reply.send(result.rows);
  });

  // POST /webhooks
  app.post("/", {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          events: { type: "array", items: { type: "string" } },
        },
      },
    },
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const { url, events = ["payment.confirmed", "payment.failed", "payment.refunded"] } = request.body;

    const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

    const result = await db.query(
      `INSERT INTO webhooks (merchant_id, url, secret, events) VALUES ($1, $2, $3, $4) RETURNING *`,
      [merchantId, url, secret, events]
    );

    return reply.status(201).send({ ...result.rows[0], secret });
  });

  // DELETE /webhooks/:id
  app.delete("/:id", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    await db.query(
      `DELETE FROM webhooks WHERE id = $1 AND merchant_id = $2`,
      [request.params.id, merchantId]
    );
    return reply.send({ message: "Webhook deleted" });
  });

  // GET /webhooks/deliveries – delivery history
  app.get("/deliveries", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const result = await db.query(
      `SELECT wd.* FROM webhook_deliveries wd
       JOIN webhooks w ON w.id = wd.webhook_id
       WHERE w.merchant_id = $1
       ORDER BY wd.created_at DESC LIMIT 50`,
      [merchantId]
    );
    return reply.send(result.rows);
  });
}
