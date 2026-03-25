import pg from "pg";
import Redis from "ioredis";
import fetch from "node-fetch";

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const TON_RPC = process.env.TON_RPC_URL || "https://toncenter.com/api/v2";
const TON_API_KEY = process.env.TON_API_KEY || "";
const POLL_INTERVAL = parseInt(process.env.BLOCKCHAIN_POLL_INTERVAL || "10000");

console.log("🔗 TON Blockchain Listener starting...");

// ── Fetch transactions from TON Center ───────────────────────
async function getTransactions(address, lastLt = null) {
  const params = new URLSearchParams({
    address,
    limit: "20",
    archival: "false",
  });
  if (lastLt) params.append("from_lt", lastLt);

  const url = `${TON_RPC}/getTransactions?${params}`;
  const headers = TON_API_KEY ? { "X-API-Key": TON_API_KEY } : {};

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`TON RPC error: ${res.status} ${res.statusText}`);
    return [];
  }

  const json = await res.json();
  return json.ok ? json.result : [];
}

// ── Extract memo from transaction ─────────────────────────────
function extractMemo(tx) {
  try {
    const body = tx?.in_msg?.msg_data;
    if (!body || body["@type"] !== "msg.dataText") return null;
    const text = Buffer.from(body.text, "base64").toString("utf-8").trim();
    return text;
  } catch {
    return null;
  }
}

// ── Process a single transaction ──────────────────────────────
async function processTransaction(tx, merchantId, walletAddress) {
  const memo = extractMemo(tx);
  if (!memo || !memo.startsWith("PAY-")) return;

  const amountNano = BigInt(tx.in_msg?.value || "0");
  const amountTon = Number(amountNano) / 1e9;

  console.log(`📬 Tx detected: memo=${memo}, amount=${amountTon} TON`);

  // Find matching payment
  const result = await db.query(
    `SELECT * FROM payments WHERE memo = $1 AND status = 'awaiting_payment'`,
    [memo]
  );

  if (!result.rows.length) {
    console.log(`  No matching payment for memo=${memo}`);
    return;
  }

  const payment = result.rows[0];
  const expectedAmount = parseFloat(payment.amount);
  const tolerance = 0.001; // 0.001 TON tolerance

  if (Math.abs(amountTon - expectedAmount) > tolerance) {
    console.warn(`  Amount mismatch: expected=${expectedAmount}, got=${amountTon}`);
    await db.query(
      `UPDATE payments SET status = 'failed', failed_at = NOW() WHERE id = $1`,
      [payment.id]
    );
    await queueWebhook(payment.id, "payment.failed");
    return;
  }

  // Confirm payment
  await db.query(
    `UPDATE payments SET status = 'confirmed', confirmed_at = NOW(), tx_hash = $2 WHERE id = $1`,
    [payment.id, tx.transaction_id?.hash || null]
  );

  // Update Redis cache
  await redis.set(
    `payment:${payment.id}`,
    JSON.stringify({ ...payment, status: "confirmed", confirmed_at: new Date().toISOString() }),
    "EX",
    3600
  );

  console.log(`✅ Payment ${payment.id} confirmed!`);
  await queueWebhook(payment.id, "payment.confirmed");
}

// ── Queue webhook via Redis Stream ───────────────────────────
async function queueWebhook(paymentId, event) {
  await redis.xadd(
    "webhook:queue",
    "*",
    "event", event,
    "paymentId", paymentId,
    "timestamp", Date.now().toString()
  );
}

// ── Get active merchant wallets to watch ─────────────────────
async function getActiveWallets() {
  const result = await db.query(
    `SELECT DISTINCT id, wallet_address FROM merchants WHERE wallet_address IS NOT NULL AND is_active = TRUE`
  );
  return result.rows;
}

// ── Main polling loop ─────────────────────────────────────────
async function pollOnce() {
  const wallets = await getActiveWallets();

  for (const merchant of wallets) {
    const cacheKey = `listener:lt:${merchant.wallet_address}`;
    const lastLt = await redis.get(cacheKey);

    try {
      const txs = await getTransactions(merchant.wallet_address, lastLt);

      if (txs.length === 0) continue;

      // Process newest-first and track highest LT
      let maxLt = lastLt || "0";
      for (const tx of txs) {
        const currentLt = tx.transaction_id?.lt || "0";
        if (BigInt(currentLt) > BigInt(maxLt)) maxLt = currentLt;
        await processTransaction(tx, merchant.id, merchant.wallet_address);
      }

      await redis.set(cacheKey, maxLt, "EX", 86400);
    } catch (err) {
      console.error(`Error processing wallet ${merchant.wallet_address}:`, err.message);
    }
  }
}

// ── Also expire old pending payments ─────────────────────────
async function expireOldPayments() {
  const result = await db.query(
    `UPDATE payments SET status = 'expired', failed_at = NOW()
     WHERE status = 'awaiting_payment' AND expires_at < NOW()
     RETURNING id`
  );

  for (const row of result.rows) {
    await queueWebhook(row.id, "payment.expired");
    console.log(`⏰ Payment ${row.id} expired`);
  }
}

// ── Start ─────────────────────────────────────────────────────
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await pollOnce();
    await expireOldPayments();
  } catch (err) {
    console.error("Listener error:", err);
  } finally {
    running = false;
  }
}, POLL_INTERVAL);

console.log(`⏳ Polling every ${POLL_INTERVAL}ms`);
