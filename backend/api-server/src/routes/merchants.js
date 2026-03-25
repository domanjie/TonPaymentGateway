import { db } from "../db/client.js";
import crypto from "crypto";

export default async function merchantRoutes(app) {
  // GET /merchants/me – current merchant profile
  app.get("/me", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const result = await db.query(`SELECT * FROM merchants WHERE id = $1`, [merchantId]);
    if (!result.rows.length) {
      return reply.status(404).send({ error: "Merchant not found" });
    }
    return reply.send(result.rows[0]);
  });

  // PATCH /merchants/me – update wallet address etc.
  app.patch("/me", {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: "object",
        properties: {
          wallet_address: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const { wallet_address, name } = request.body;

    const result = await db.query(
      `UPDATE merchants SET
        wallet_address = COALESCE($2, wallet_address),
        name = COALESCE($3, name),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [merchantId, wallet_address, name]
    );

    return reply.send(result.rows[0]);
  });

  // GET /merchants/me/analytics – revenue stats
  app.get("/me/analytics", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;

    const [totalRevenue, paymentCounts, recentPayments] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM payments WHERE merchant_id = $1 AND status = 'confirmed'`,
        [merchantId]
      ),
      db.query(
        `SELECT status, COUNT(*) as count
         FROM payments WHERE merchant_id = $1
         GROUP BY status`,
        [merchantId]
      ),
      db.query(
        `SELECT DATE_TRUNC('day', created_at) as date, 
                COUNT(*) as count,
                COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) as revenue
         FROM payments WHERE merchant_id = $1
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY 1 ORDER BY 1`,
        [merchantId]
      ),
    ]);

    const counts = {};
    for (const row of paymentCounts.rows) counts[row.status] = parseInt(row.count);

    return reply.send({
      totalRevenue: parseFloat(totalRevenue.rows[0].total),
      paymentCounts: counts,
      dailyStats: recentPayments.rows,
    });
  });
}
