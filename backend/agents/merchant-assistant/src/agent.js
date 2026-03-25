import pg from "pg";
import Redis from "ioredis";
import fetch from "node-fetch";

// ── Merchant Assistant Agent ──────────────────────────────────
// Telegram bot that answers merchant questions using internal API

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

// ── Command handlers ──────────────────────────────────────────
const commands = {
  async start(chatId, merchant) {
    return `👋 Welcome to TonPaymentGateway!\n\nYou can ask me:\n• today's revenue\n• payment status\n• failed payments count\n• recent payments\n\nType /help for all commands.`;
  },

  async revenue(chatId, merchant) {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as today,
              COUNT(*) FILTER (WHERE status = 'confirmed') as count
       FROM payments
       WHERE merchant_id = $1
         AND DATE(created_at) = CURRENT_DATE`,
      [merchant.id]
    );
    const r = result.rows[0];
    return `💰 Today's Revenue\n\n**${r.today} TON** from **${r.count}** confirmed payments`;
  },

  async payments(chatId, merchant) {
    const result = await db.query(
      `SELECT id, amount, status, created_at FROM payments
       WHERE merchant_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [merchant.id]
    );
    if (!result.rows.length) return "📭 No payments found.";
    const list = result.rows.map(p =>
      `• ${p.amount} TON – ${p.status} (${new Date(p.created_at).toLocaleDateString()})`
    ).join("\n");
    return `📋 Recent Payments:\n\n${list}`;
  },

  async failed(chatId, merchant) {
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM payments WHERE merchant_id = $1 AND status = 'failed'`,
      [merchant.id]
    );
    return `❌ Failed payments: **${result.rows[0].cnt}**`;
  },

  async help(chatId, merchant) {
    return `📖 Available Commands:\n\n/start – Welcome\n/revenue – Today's revenue\n/payments – Recent payments\n/failed – Failed payment count\n/help – Show this help`;
  },
};

// ── Parse free-form merchant questions ────────────────────────
function parseIntent(text) {
  const lower = text.toLowerCase();
  if (lower.includes("revenue") || lower.includes("earn")) return "revenue";
  if (lower.includes("failed") || lower.includes("fail")) return "failed";
  if (lower.includes("payment") || lower.includes("recent")) return "payments";
  if (lower.includes("help")) return "help";
  return "unknown";
}

// ── Get or create merchant by Telegram ID ────────────────────
async function getMerchant(telegramId) {
  const result = await db.query(`SELECT * FROM merchants WHERE telegram_id = $1`, [telegramId]);
  return result.rows[0] || null;
}

// ── Send message ──────────────────────────────────────────────
async function sendMessage(chatId, text) {
  if (!BOT_TOKEN) return;
  await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

// ── Process update ────────────────────────────────────────────
async function processUpdate(update) {
  const msg = update.message || update.channel_post;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;
  const text = msg.text.trim();
  const merchant = telegramId ? await getMerchant(telegramId) : null;

  if (!merchant) {
    await sendMessage(chatId, "⚠️ You're not registered. Please open the dashboard first.");
    return;
  }

  // Check for slash commands
  const commandMatch = text.match(/^\/(\w+)/);
  const commandName = commandMatch ? commandMatch[1] : parseIntent(text);
  const handler = commands[commandName];

  if (handler) {
    const response = await handler(chatId, merchant);
    await sendMessage(chatId, response);
  } else {
    await sendMessage(chatId,
      `🤔 I didn't understand that. Try asking:\n• "Show today's revenue"\n• "Recent payments"\n• "How many failed payments?"\n\nOr type /help`
    );
  }
}

// ── Long polling ──────────────────────────────────────────────
async function poll() {
  if (!BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not set – Merchant Assistant Agent in mock mode");
    return;
  }

  while (true) {
    try {
      const res = await fetch(
        `${API_BASE}/getUpdates?offset=${offset}&timeout=30&limit=10`
      );
      const json = await res.json();
      if (!json.ok) {
        await sleep(5000);
        continue;
      }
      for (const update of json.result) {
        offset = update.update_id + 1;
        await processUpdate(update).catch(console.error);
      }
    } catch (err) {
      console.error("Polling error:", err.message);
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("🤖 Merchant Assistant Agent running");
poll();
