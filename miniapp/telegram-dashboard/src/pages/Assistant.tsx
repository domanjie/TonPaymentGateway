import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Send, Bot } from "lucide-react";

interface Message {
  role: "user" | "bot";
  text: string;
}

const SUGGESTIONS = [
  "Show today's revenue",
  "How many failed payments?",
  "Recent payments",
  "What's my total volume?",
];

export default function Assistant() {
  const { token, apiUrl } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "👋 Hi! I'm your merchant assistant. Ask me about:\n• Today's revenue\n• Payment history\n• Failed payments\n• Analytics",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text = input) {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", text };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await queryAgent(text, token!, apiUrl);
      setMessages((p) => [...p, { role: "bot", text: response }]);
    } catch {
      setMessages((p) => [...p, { role: "bot", text: "Sorry, I couldn't connect to the API. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, background: "var(--accent-glow)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot size={20} color="var(--accent)" />
          </div>
          <div>
            <div className="page-title" style={{ fontSize: 20 }}>AI Assistant</div>
            <div className="page-subtitle">Powered by TonPaymentGateway agents</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
        <div className="ai-chat-container">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              <div className={`chat-avatar ${msg.role === "bot" ? "bot-avatar" : "user-avatar"}`}>
                {msg.role === "bot" ? "🤖" : "👤"}
              </div>
              <div className="chat-bubble">
                {msg.text.split("\n").map((line, j) => (
                  <span key={j}>{line}<br /></span>
                ))}
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg bot">
              <div className="chat-avatar bot-avatar">🤖</div>
              <div className="chat-bubble">
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, background: "var(--accent)", borderRadius: "50%", display: "inline-block", animation: `pulse 1s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 4 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              style={{
                padding: "6px 12px", borderRadius: 16,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap"
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-row">
        <input
          className="form-input"
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Query the merchant analytics API and generate response ───
async function queryAgent(text: string, token: string, apiUrl: string): Promise<string> {
  const lower = text.toLowerCase();

  if (lower.includes("revenue") || lower.includes("earn") || lower.includes("total")) {
    const res = await fetch(`${apiUrl}/merchants/me/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const counts = data.paymentCounts || {};
    return `💰 Here's your revenue summary:\n\n• Total confirmed: **${data.totalRevenue?.toFixed(2)} TON**\n• Confirmed payments: ${counts.confirmed || 0}\n• Pending: ${counts.awaiting_payment || 0}\n• Failed: ${counts.failed || 0}\n• Refunded: ${counts.refunded || 0}`;
  }

  if (lower.includes("failed") || lower.includes("fail")) {
    const res = await fetch(`${apiUrl}/payments?status=failed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return `❌ You have **${data.pagination?.total || 0}** failed payments.\n\nCheck the Payments tab to review them.`;
  }

  if (lower.includes("payment") || lower.includes("recent")) {
    const res = await fetch(`${apiUrl}/payments?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const list = data.data?.slice(0, 5);
    if (!list?.length) return "No payments found yet.";
    const lines = list.map((p: any) =>
      `• ${p.amount} TON – ${p.status} (${new Date(p.created_at).toLocaleDateString()})`
    );
    return `📋 Recent payments:\n\n${lines.join("\n")}`;
  }

  if (lower.includes("refund")) {
    return `To refund a payment, go to the **Payments** tab, find the confirmed payment, and tap **Refund**.\n\nOnly confirmed payments can be refunded.`;
  }

  if (lower.includes("webhook")) {
    const res = await fetch(`${apiUrl}/webhooks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return `🔔 You have **${data.length}** active webhook(s).\n\nGo to the Webhooks tab to manage them.`;
  }

  return `🤔 I understand you're asking about: "${text}"\n\nTry asking:\n• "Show today's revenue"\n• "Recent payments"\n• "How many failed payments?"\n• "Webhook status"`;
}
