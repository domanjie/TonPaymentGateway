import pg from "pg";
import Redis from "ioredis";
import fetch from "node-fetch";
import crypto from "crypto";

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const MAX_RETRIES = parseInt(process.env.WEBHOOK_MAX_RETRIES || "5");
const BASE_DELAY = parseInt(process.env.WEBHOOK_RETRY_BASE_DELAY || "1000");
const CONSUMER_GROUP = "webhook-workers";
const CONSUMER_NAME = `worker-${process.pid}`;
const STREAM_KEY = "webhook:queue";

console.log("🔔 Webhook Worker starting...");

// ── Ensure consumer group exists ──────────────────────────────
async function ensureConsumerGroup() {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "0", "MKSTREAM");
    console.log("Consumer group created");
  } catch (err) {
    if (!err.message.includes("BUSYGROUP")) throw err;
  }
}

// ── Build and sign webhook payload ───────────────────────────
function buildPayload(event, payment) {
  return {
    event,
    payment_id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    memo: payment.memo,
    metadata: payment.metadata,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

function computeSignature(payload, secret) {
  const body = JSON.stringify(payload);
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ── Deliver webhook ───────────────────────────────────────────
async function deliver(webhookUrl, secret, payload) {
  const body = JSON.stringify(payload);
  const signature = computeSignature(payload, secret);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ton-Signature": signature,
      "X-Ton-Event": payload.event,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });

  return { ok: res.ok, status: res.status, text: await res.text().catch(() => "") };
}

// ── Process a single queue message ───────────────────────────
async function processMessage(fields) {
  const data = {};
  for (let i = 0; i < fields.length; i += 2) {
    data[fields[i]] = fields[i + 1];
  }

  const { event, paymentId } = data;
  if (!paymentId || !event) return;

  // Fetch payment details
  const payResult = await db.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
  if (!payResult.rows.length) return;
  const payment = payResult.rows[0];

  // Fetch active webhooks for this merchant
  const wbResult = await db.query(
    `SELECT * FROM webhooks WHERE merchant_id = $1 AND is_active = TRUE AND $2 = ANY(events)`,
    [payment.merchant_id, event]
  );

  for (const webhook of wbResult.rows) {
    const payload = buildPayload(event, payment);

    // Create delivery record
    const deliveryResult = await db.query(
      `INSERT INTO webhook_deliveries (webhook_id, payment_id, event, payload, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [webhook.id, paymentId, event, JSON.stringify(payload)]
    );
    const deliveryId = deliveryResult.rows[0].id;

    let attempt = 0;
    let delivered = false;

    while (attempt < MAX_RETRIES && !delivered) {
      attempt++;
      const delay = attempt === 1 ? 0 : BASE_DELAY * Math.pow(2, attempt - 2);
      if (delay > 0) await sleep(delay);

      try {
        const result = await deliver(webhook.url, webhook.secret, payload);
        await db.query(
          `UPDATE webhook_deliveries SET attempt_count = $2, last_status_code = $3, last_response = $4,
             status = $5, delivered_at = CASE WHEN $5 = 'delivered' THEN NOW() ELSE NULL END
           WHERE id = $1`,
          [deliveryId, attempt, result.status, result.text.substring(0, 500),
           result.ok ? "delivered" : "failed"]
        );
        if (result.ok) {
          delivered = true;
          console.log(`✅ Webhook delivered: event=${event} to ${webhook.url}`);
        } else {
          console.warn(`⚠️  Webhook failed (${result.status}), attempt ${attempt}`);
        }
      } catch (err) {
        console.error(`Webhook delivery error attempt ${attempt}:`, err.message);
        await db.query(
          `UPDATE webhook_deliveries SET attempt_count = $2, last_response = $3, status = 'failed' WHERE id = $1`,
          [deliveryId, attempt, err.message]
        );
      }
    }

    if (!delivered) {
      console.error(`❌ Webhook permanently failed after ${MAX_RETRIES} attempts: ${webhook.url}`);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main worker loop ──────────────────────────────────────────
async function run() {
  await ensureConsumerGroup();

  while (true) {
    try {
      const results = await redis.xreadgroup(
        "GROUP", CONSUMER_GROUP, CONSUMER_NAME,
        "COUNT", "10",
        "BLOCK", "2000",
        "STREAMS", STREAM_KEY,
        ">"
      );

      if (!results) continue;

      for (const [, messages] of results) {
        for (const [msgId, fields] of messages) {
          await processMessage(fields);
          await redis.xack(STREAM_KEY, CONSUMER_GROUP, msgId);
        }
      }
    } catch (err) {
      console.error("Worker loop error:", err.message);
      await sleep(2000);
    }
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
