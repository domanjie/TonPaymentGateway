import { db } from "../db/client.js";
import crypto from "crypto";

export default async function apiKeyRoutes(app) {
  // GET /api-keys
  app.get("/", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const result = await db.query(
      `SELECT id, key_type, name, permissions, last_used_at, is_active, created_at,
              LEFT(key, 12) || '...' as key_preview
       FROM api_keys WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId]
    );
    return reply.send(result.rows);
  });

  // POST /api-keys
  app.post("/", {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["key_type"],
        properties: {
          key_type: { type: "string", enum: ["pk_live", "sk_live", "pk_test", "sk_test"] },
          name: { type: "string" },
          permissions: { type: "array", items: { type: "string" } },
        },
      },
    },
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const { key_type, name, permissions = ["payments:read", "payments:write"] } = request.body;

    const rawKey = crypto.randomBytes(24).toString("base64url");
    const key = `${key_type}_${rawKey}`;

    const result = await db.query(
      `INSERT INTO api_keys (merchant_id, key, key_type, name, permissions)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [merchantId, key, key_type, name, JSON.stringify(permissions)]
    );

    // Return full key once only
    return reply.status(201).send({
      ...result.rows[0],
      key, // full key shown only at creation
    });
  });

  // DELETE /api-keys/:id
  app.delete("/:id", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    await db.query(
      `UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND merchant_id = $2`,
      [request.params.id, merchantId]
    );
    return reply.send({ message: "API key revoked" });
  });
}
