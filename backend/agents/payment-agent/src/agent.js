import pg from "pg";
import Redis from "ioredis";

// ── Payment Monitoring Agent ──────────────────────────────────
// Monitors payment states, detects anomalies, flags stale payments

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const INTERVAL = 60_000; // 1 min

async function monitorPayments() {
  console.log("📡 Payment Monitoring Agent scanning...");

  // 1. Detect payments stuck in awaiting_payment for too long (but not expired)
  const staleResult = await db.query(
    `SELECT id, merchant_id, amount, created_at FROM payments
     WHERE status = 'awaiting_payment'
       AND created_at < NOW() - INTERVAL '30 minutes'
       AND expires_at > NOW()`
  );

  for (const p of staleResult.rows) {
    const alertKey = `agent:alert:stale:${p.id}`;
    const alreadyAlerted = await redis.get(alertKey);
    if (!alreadyAlerted) {
      console.warn(`⚠️  Stale payment: ${p.id} (${p.amount} TON, created ${p.created_at})`);
      // Queue merchant notification via Telegram (placeholder)
      await redis.xadd("agent:notifications", "*",
        "type", "stale_payment",
        "paymentId", p.id,
        "merchantId", p.merchant_id,
        "amount", p.amount.toString()
      );
      await redis.set(alertKey, "1", "EX", 3600);
    }
  }

  // 2. Count payments confirmed in last 24h (metrics)
  const confirmed = await db.query(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
     FROM payments WHERE status = 'confirmed' AND confirmed_at > NOW() - INTERVAL '24 hours'`
  );
  const row = confirmed.rows[0];
  console.log(`📊 Last 24h: ${row.cnt} confirmed payments, ${row.total} TON volume`);

  // 3. Store metrics in Redis
  await redis.set("metrics:24h:confirmed_count", row.cnt);
  await redis.set("metrics:24h:confirmed_volume", row.total);
}

setInterval(async () => {
  try {
    await monitorPayments();
  } catch (err) {
    console.error("Payment monitoring error:", err.message);
  }
}, INTERVAL);

monitorPayments();
console.log("🤖 Payment Monitoring Agent running");
