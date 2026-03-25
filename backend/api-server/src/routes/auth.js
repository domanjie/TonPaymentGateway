import { db } from "../db/client.js";
import crypto from "crypto";

/**
 * Telegram Mini App authentication via initData
 */
export default async function authRoutes(app) {
  // POST /auth/telegram - verify Telegram initData and return JWT
  app.post("/telegram", {
    schema: {
      body: {
        type: "object",
        required: ["initData"],
        properties: {
          initData: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { initData } = request.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return reply.status(500).send({ error: "Telegram bot token not configured" });
    }

    // Verify Telegram initData
    const isValid = verifyTelegramInitData(initData, botToken);
    if (!isValid) {
      return reply.status(401).send({ error: "Invalid Telegram initData" });
    }

    // Parse user data
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) {
      return reply.status(400).send({ error: "No user data in initData" });
    }

    const user = JSON.parse(userJson);
    const telegramId = user.id;

    // Upsert merchant
    const merchant = await db.query(
      `INSERT INTO merchants (telegram_id, username, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
         SET username = EXCLUDED.username,
             name = EXCLUDED.name,
             updated_at = NOW()
       RETURNING *`,
      [telegramId, user.username || null, user.first_name || null]
    );

    const merchantData = merchant.rows[0];

    const token = app.jwt.sign(
      { merchantId: merchantData.id, telegramId: merchantData.telegram_id },
      { expiresIn: "7d" }
    );

    return reply.send({
      token,
      merchant: merchantData,
    });
  });
}

function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");

    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(sortedParams).digest("hex");

    return computedHash === hash;
  } catch {
    return false;
  }
}
