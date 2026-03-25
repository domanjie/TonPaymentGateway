import pg from "pg";

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await db.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== "production") {
    console.debug("query", { text: text.substring(0, 80), duration, rows: res.rowCount });
  }
  return res;
}
