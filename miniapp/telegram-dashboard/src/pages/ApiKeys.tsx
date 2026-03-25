import { useState } from "react";
import { useApiFetch, useAuth } from "../context/AuthContext";
import { Plus, Eye, EyeOff, Copy, Check } from "lucide-react";

export default function ApiKeys() {
  const { data, loading } = useApiFetch("/api-keys");
  const { token, apiUrl } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [keyType, setKeyType] = useState<"pk_live" | "sk_live" | "pk_test" | "sk_test">("sk_live");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = data || [];

  async function createKey() {
    setCreating(true);
    const res = await fetch(`${apiUrl}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key_type: keyType, name }),
    });
    const data = await res.json();
    setNewKey(data.key);
    setCreating(false);
    setShowForm(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key?")) return;
    await fetch(`${apiUrl}/api-keys/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    window.location.reload();
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="page-title">🔑 API Keys</div>
          <div className="page-subtitle">Authenticate your applications</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> New
        </button>
      </div>

      {newKey && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--success)", background: "rgba(0,214,143,0.05)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)", marginBottom: 8 }}>
            ✅ API Key Created — Copy it now, it won't be shown again!
          </div>
          <div className="code-block">
            {newKey}
            <button className="copy-btn" onClick={() => copy(newKey)}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setNewKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Key Type</label>
            <select
              className="form-input"
              value={keyType}
              onChange={(e) => setKeyType(e.target.value as any)}
              style={{ appearance: "none" }}
            >
              <option value="pk_live">pk_live – Public (Live)</option>
              <option value="sk_live">sk_live – Secret (Live)</option>
              <option value="pk_test">pk_test – Public (Test)</option>
              <option value="sk_test">sk_test – Secret (Test)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Label (optional)</label>
            <input className="form-input" placeholder="e.g. My Shop" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-full" onClick={createKey} disabled={creating}>
            {creating ? "Creating..." : "Generate Key"}
          </button>
        </div>
      )}

      {loading && <div className="loading-overlay"><div className="spinner" /></div>}

      {!loading && keys.length === 0 && !newKey && (
        <div className="empty-state">
          <div className="empty-state-icon">🔑</div>
          <h3>No API keys</h3>
          <p>Create an API key to integrate payments</p>
        </div>
      )}

      {keys.map((k: any) => (
        <div key={k.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className={`badge ${k.key_type.includes("live") ? "badge-confirmed" : "badge-pending"}`}>
                  {k.key_type}
                </span>
                {k.name && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.name}</span>}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent)" }}>
                {k.key_preview}
              </div>
              {k.last_used_at && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Last used: {new Date(k.last_used_at).toLocaleDateString()}
                </div>
              )}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => revokeKey(k.id)}>
              Revoke
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
