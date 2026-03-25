import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { merchant, token, apiUrl } = useAuth();
  const [walletAddress, setWalletAddress] = useState(merchant?.wallet_address || "");
  const [name, setName] = useState(merchant?.name || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`${apiUrl}/merchants/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet_address: walletAddress, name }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">⚙️ Settings</div>
        <div className="page-subtitle">Configure your merchant account</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Profile</div>

        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your shop name" />
        </div>

        <div className="form-group">
          <label className="form-label">TON Wallet Address</label>
          <input
            className="form-input"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="EQ... or UQ..."
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Payments will be sent to this address
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving..." : saved ? "✅ Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Account Info</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InfoRow label="Telegram ID" value={String(merchant?.telegram_id || "–")} />
          <InfoRow label="Username" value={`@${merchant?.username || "–"}`} />
          <InfoRow label="Merchant ID" value={merchant?.id?.substring(0, 16) + "..." || "–"} mono />
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginBottom: 10 }}>Network</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["Mainnet", "Testnet"].map((net) => (
            <div
              key={net}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: net === "Mainnet" ? "var(--accent)" : "var(--border)",
                background: net === "Mainnet" ? "var(--accent-glow)" : "transparent",
                color: net === "Mainnet" ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {net}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? "monospace" : "inherit", color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}
