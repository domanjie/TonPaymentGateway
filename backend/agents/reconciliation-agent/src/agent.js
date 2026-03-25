import pg from "pg";
import Redis from "ioredis";

// ── Reconciliation Agent ──────────────────────────────────────
// Matches merchant DB payments vs confirmed blockchain payments

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const INTERVAL = parseInt(process.env.AGENT_RECONCILIATION_INTERVAL || "3600000"); // 1hr

async function reconcile() {
  console.log("🔄 Reconciliation Agent running...");

  // Find payments confirmed in blockchain listener but not in analytics
  const confirmedNoTxHash = await db.query(
    `SELECT id, merchant_id, amount, confirmed_at FROM payments
     WHERE status = 'confirmed' AND tx_hash IS NULL`
  );

  if (confirmedNoTxHash.rows.length > 0) {
    console.warn(`⚠️  ${confirmedNoTxHash.rows.length} confirmed payments missing tx_hash`);
    await redis.xadd("agent:notifications", "*",
      "type", "reconciliation_warning",
      "count", confirmedNoTxHash.rows.length.toString(),
      "reason", "confirmed_without_tx_hash"
    );
  }

  // Find payments that should have expired but haven't been updated
  const shouldExpire = await db.query(
    `SELECT COUNT(*) as cnt FROM payments
     WHERE status = 'awaiting_payment' AND expires_at < NOW()`
  );
  const staleCount = parseInt(shouldExpire.rows[0].cnt);

  if (staleCount > 0) {
    console.warn(`⚠️  ${staleCount} payments should be expired. Triggering cleanup.`);
    const result = await db.query(
      `UPDATE payments SET status = 'expired', failed_at = NOW()
       WHERE status = 'awaiting_payment' AND expires_at < NOW()
       RETURNING id`
    );
    console.log(`✅ Expired ${result.rows.length} stale payments`);
  }

  // Daily reconciliation summary
  const summary = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status = 'expired') as expired,
       COUNT(*) FILTER (WHERE status = 'refunded') as refunded,
       COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) as total_volume
     FROM payments
     WHERE created_at > NOW() - INTERVAL '24 hours'`
  );

  const s = summary.rows[0];
  console.log("📋 24h Summary:", JSON.stringify(s, null, 2));

  await redis.set("reconciliation:last_run", new Date().toISOString());
  await redis.set("reconciliation:24h_summary", JSON.stringify(s), "EX", 90000);
}

setInterval(async () => {
  try {
    await reconcile();
  } catch (err) {
    console.error("Reconciliation error:", err.message);
  }
}, INTERVAL);

reconcile();
console.log("🤖 Reconciliation Agent running");
