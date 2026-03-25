import { db } from "../db/client.js";
import { redis } from "../lib/redis.js";
import crypto from "crypto";

const PAYMENT_EXPIRY_SECONDS = 3600; // 1 hour

export default async function paymentRoutes(app) {
  // ── POST /payments ─────────────────────────────────────────
  app.post("/", {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["amount", "currency"],
        properties: {
          amount: { type: "string" },
          currency: { type: "string", enum: ["TON"] },
          description: { type: "string" },
          webhookUrl: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const { amount, currency = "TON", description, webhookUrl, metadata = {} } = request.body;

    // Generate unique memo for blockchain matching
    const memo = `PAY-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

    // Get merchant wallet
    const merchant = await db.query(`SELECT * FROM merchants WHERE id = $1`, [merchantId]);
    if (!merchant.rows.length) {
      return reply.status(404).send({ error: "Merchant not found" });
    }

    const walletAddress = merchant.rows[0].wallet_address;
    if (!walletAddress) {
      return reply.status(400).send({ error: "Merchant has not configured a TON wallet address yet. Please configure it in the dashboard settings." });
    }

    const result = await db.query(
      `INSERT INTO payments
         (merchant_id, amount, currency, description, memo, wallet_address, webhook_url, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'awaiting_payment')
       RETURNING *`,
      [merchantId, parseFloat(amount), currency, description, memo, walletAddress, webhookUrl, JSON.stringify(metadata)]
    );

    const payment = result.rows[0];

    // Cache payment in Redis for fast polling
    await redis.set(
      `payment:${payment.id}`,
      JSON.stringify(payment),
      "EX",
      PAYMENT_EXPIRY_SECONDS
    );

    return reply.status(201).send({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description,
      memo: payment.memo,
      walletAddress: payment.wallet_address,
      expiresAt: payment.expires_at,
      createdAt: payment.created_at,
    });
  });

  // ── GET /payments ──────────────────────────────────────────
  app.get("/", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;
    const { page = 1, limit = 20, status } = request.query;
    const offset = (page - 1) * limit;

    let queryText = `SELECT * FROM payments WHERE merchant_id = $1`;
    const params = [merchantId];

    if (status) {
      queryText += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(queryText, params);
    const countResult = await db.query(
      `SELECT COUNT(*) FROM payments WHERE merchant_id = $1`,
      [merchantId]
    );

    return reply.send({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  });

  // ── GET /payments/:id ──────────────────────────────────────
  app.get("/:id", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;

    // Check Redis cache first
    const cached = await redis.get(`payment:${id}`);
    if (cached) {
      const payment = JSON.parse(cached);
      if (payment.merchant_id === merchantId) {
        return reply.send(payment);
      }
    }

    const result = await db.query(
      `SELECT * FROM payments WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!result.rows.length) {
      return reply.status(404).send({ error: "Payment not found" });
    }

    return reply.send(result.rows[0]);
  });

  // ── POST /payments/:id/refund ──────────────────────────────
  app.post("/:id/refund", {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const merchantId = request.merchant?.merchant_id || request.user?.merchantId;

    const result = await db.query(
      `SELECT * FROM payments WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId]
    );

    if (!result.rows.length) {
      return reply.status(404).send({ error: "Payment not found" });
    }

    const payment = result.rows[0];
    if (payment.status !== "confirmed") {
      return reply.status(400).send({ error: "Only confirmed payments can be refunded" });
    }

    const updated = await db.query(
      `UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    // Queue refund webhook
    await redis.xadd("webhook:queue", "*",
      "event", "payment.refunded",
      "paymentId", id,
      "merchantId", merchantId
    );

    return reply.send({ message: "Refund initiated", payment: updated.rows[0] });
  });

  // ── GET /payments/:id/status (public polling endpoint) ────
  app.get("/:id/status", async (request, reply) => {
    const { id } = request.params;

    const cached = await redis.get(`payment:${id}`);
    if (cached) {
      const p = JSON.parse(cached);
      return reply.send({ id: p.id, status: p.status, confirmedAt: p.confirmed_at });
    }

    const result = await db.query(
      `SELECT id, status, confirmed_at FROM payments WHERE id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return reply.status(404).send({ error: "Payment not found" });
    }

    return reply.send(result.rows[0]);
  });
}
