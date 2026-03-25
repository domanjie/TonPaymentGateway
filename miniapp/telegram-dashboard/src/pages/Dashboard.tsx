import { useApiFetch, useAuth } from "../context/AuthContext";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AlertCircle } from "lucide-react";

export default function Dashboard() {
  const { merchant } = useAuth();
  const { data: analytics, loading } = useApiFetch("/merchants/me/analytics");

  if (loading) {
    return <div className="loading-overlay"><div className="spinner" /></div>;
  }

  const counts = analytics?.paymentCounts || {};
  const totalRevenue = analytics?.totalRevenue || 0;
  const dailyStats = analytics?.dailyStats || [];

  // Prepare chart data
  const chartData = dailyStats.map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    revenue: parseFloat(d.revenue),
    count: parseInt(d.count),
  }));

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title">
          👋 {merchant?.name || "Merchant"}'s Dashboard
        </div>
        <div className="page-subtitle">
          @{merchant?.username || "unknown"} · TON Payment Gateway
        </div>
      </div>

      {/* Revenue Hero */}
      <div className="hero-card">
        <div className="hero-label">Total Revenue</div>
        <div>
          <span className="hero-amount">{totalRevenue.toFixed(2)}</span>
          <span className="hero-unit">TON</span>
        </div>
        <div className="hero-sub">All-time confirmed payments</div>
      </div>

      {/* Stats Grid */}
      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-label">Confirmed</div>
          <div className="stat-value success">{counts.confirmed || 0}</div>
          <div className="stat-sub">payments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value warning">{counts.awaiting_payment || 0}</div>
          <div className="stat-sub">awaiting</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value danger">{counts.failed || 0}</div>
          <div className="stat-sub">payments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Refunded</div>
          <div className="stat-value accent">{counts.refunded || 0}</div>
          <div className="stat-sub">payments</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-header">
            <div className="section-title">📈 Revenue (30d)</div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0095ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0095ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#161a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v: any) => [`${v} TON`, "Revenue"]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#0095ff" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Wallet status */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 12 }}>🔑 Wallet</div>
        {merchant?.wallet_address ? (
          <div className="code-block">
            {merchant.wallet_address}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--warning)" }}>
            <AlertCircle size={16} />
            <span style={{ fontSize: 13 }}>No wallet connected. Go to Settings.</span>
          </div>
        )}
      </div>
    </div>
  );
}
