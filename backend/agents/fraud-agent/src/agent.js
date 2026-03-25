import pg from "pg";
import Redis from "ioredis";

// ── Fraud Detection Agent ─────────────────────────────────────
// Analyzes suspicious patterns: repeated micro-transactions, address reuse, velocity

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const FRAUD_THRESHOLD = parseInt(process.env.AGENT_FRAUD_THRESHOLD || "10");
const MICRO_TX_AMOUNT = 0.01; // TON
const CHECK_INTERVAL = 5 * 60_000; // 5 min

async function detectFraud() {
  console.log("🕵️  Fraud Detection Agent scanning...");

  // 1. Detect high-frequency payments from same wallet
  const velocityResult = await db.query(
    `SELECT wallet_address, COUNT(*) as cnt
     FROM payments
     WHERE created_at > NOW() - INTERVAL '1 hour'
       AND status IN ('confirmed', 'awaiting_payment')
     GROUP BY wallet_address
     HAVING COUNT(*) > $1`,
    [FRAUD_THRESHOLD]
  );

  for (const row of velocityResult.rows) {
    await flagFraud(null, row.wallet_address, "high_velocity", row.cnt / FRAUD_THRESHOLD * 100);
    console.warn(`🚨 High velocity: wallet ${row.wallet_address} made ${row.cnt} payments in 1h`);
  }

  // 2. Detect micro-transaction spam
  const microResult = await db.query(
    `SELECT wallet_address, COUNT(*) as cnt
     FROM payments
     WHERE amount < $1 AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY wallet_address
     HAVING COUNT(*) > 5`,
    [MICRO_TX_AMOUNT]
  );

  for (const row of microResult.rows) {
    await flagFraud(null, row.wallet_address, "micro_tx_spam", 75);
    console.warn(`🚨 Micro-tx spam: wallet ${row.wallet_address}`);
  }

  // 3. Detect sudden refund rate spike per merchant
  const refundResult = await db.query(
    `SELECT merchant_id,
       SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunds,
       COUNT(*) as total
     FROM payments
     WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY merchant_id
     HAVING COUNT(*) > 0 AND
       CAST(SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) > 0.3`
  );

  for (const row of refundResult.rows) {
    const rate = (row.refunds / row.total * 100).toFixed(1);
    console.warn(`🚨 High refund rate (${rate}%) for merchant ${row.merchant_id}`);
    await redis.xadd("agent:notifications", "*",
      "type", "high_refund_rate",
      "merchantId", row.merchant_id,
      "rate", rate
    );
  }
}

async function flagFraud(paymentId, walletAddress, reason, score) {
  const existing = await db.query(
    `SELECT id FROM fraud_flags WHERE wallet_address = $1 AND reason = $2
     AND created_at > NOW() - INTERVAL '1 hour'`,
    [walletAddress, reason]
  );
  if (existing.rows.length) return;

  await db.query(
    `INSERT INTO fraud_flags (payment_id, wallet_address, reason, score)
     VALUES ($1, $2, $3, $4)`,
    [paymentId, walletAddress, reason, score]
  );
}

setInterval(async () => {
  try {
    await detectFraud();
  } catch (err) {
    console.error("Fraud agent error:", err.message);
  }
}, CHECK_INTERVAL);

detectFraud();
console.log("🤖 Fraud Detection Agent running");
