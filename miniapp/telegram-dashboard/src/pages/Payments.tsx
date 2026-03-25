import { useState } from "react";
import { useApiFetch, useAuth } from "../context/AuthContext";
import { RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "badge-confirmed",
  awaiting_payment: "badge-awaiting_payment",
  pending: "badge-pending",
  failed: "badge-failed",
  expired: "badge-expired",
  refunded: "badge-refunded",
};

export default function Payments() {
  const [filter, setFilter] = useState("all");
  const { data, loading, error } = useApiFetch(
    `/payments${filter !== "all" ? `?status=${filter}` : ""}`,
    [filter]
  );
  const { token, apiUrl } = useAuth();
  const [refunding, setRefunding] = useState<string | null>(null);

  const payments = data?.data || [];

  async function refund(id: string) {
    if (!confirm("Refund this payment?")) return;
    setRefunding(id);
    await fetch(`${apiUrl}/payments/${id}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setRefunding(null);
    window.location.reload();
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">💳 Payments</div>
        <div className="page-subtitle">All your incoming payments</div>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {["all", "confirmed", "awaiting_payment", "failed", "refunded"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid",
              borderColor: filter === s ? "var(--accent)" : "var(--border)",
              background: filter === s ? "var(--accent-glow)" : "transparent",
              color: filter === s ? "var(--accent)" : "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {s === "awaiting_payment" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="loading-overlay"><div className="spinner" /></div>}
      {error && <div style={{ color: "var(--danger)", textAlign: "center", padding: 20 }}>{error}</div>}

      {!loading && payments.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No payments found</h3>
          <p>Payments will appear here once created</p>
        </div>
      )}

      {payments.map((p: any) => (
        <div key={p.id} className="payment-item">
          <div className="payment-left">
            <div className="payment-id">{p.memo}</div>
            <div className="payment-date">{new Date(p.created_at).toLocaleString()}</div>
            {p.description && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.description}</div>
            )}
          </div>
          <div className="payment-right" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div>
              <span className="payment-amount">{p.amount}</span>{" "}
              <span className="payment-currency">TON</span>
            </div>
            <span className={`badge ${STATUS_COLORS[p.status] || ""}`}>
              {p.status.replace("_", " ")}
            </span>
            {p.status === "confirmed" && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => refund(p.id)}
                disabled={refunding === p.id}
              >
                {refunding === p.id ? <RefreshCw size={12} className="spin" /> : "Refund"}
              </button>
            )}
          </div>
        </div>
      ))}

      {data?.pagination && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
          Showing {payments.length} of {data.pagination.total} payments
        </div>
      )}
    </div>
  );
}
