import { useState } from "react";
import { useApiFetch, useAuth } from "../context/AuthContext";
import { Plus, Trash2 } from "lucide-react";

export default function Webhooks() {
  const { data, loading } = useApiFetch("/webhooks");
  const { token, apiUrl } = useAuth();
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const webhooks = data || [];

  async function addWebhook() {
    if (!url) return;
    setAdding(true);
    await fetch(`${apiUrl}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
    setAdding(false);
    setUrl("");
    setShowForm(false);
    window.location.reload();
  }

  async function deleteWebhook(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`${apiUrl}/webhooks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    window.location.reload();
  }

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="page-title">🔔 Webhooks</div>
          <div className="page-subtitle">Real-time payment notifications</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> Add
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Endpoint URL</label>
            <input
              className="form-input"
              type="url"
              placeholder="https://yoursite.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-full" onClick={addWebhook} disabled={adding}>
            {adding ? "Adding..." : "Add Webhook"}
          </button>
        </div>
      )}

      {loading && <div className="loading-overlay"><div className="spinner" /></div>}

      {!loading && webhooks.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <h3>No webhooks yet</h3>
          <p>Add a webhook to receive payment notifications</p>
        </div>
      )}

      {webhooks.map((w: any) => (
        <div key={w.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, wordBreak: "break-all" }}>
                {w.url}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {w.events?.map((e: string) => (
                  <span key={e} className="badge badge-confirmed" style={{ fontSize: 10 }}>{e}</span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                Created {new Date(w.created_at).toLocaleDateString()}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => deleteWebhook(w.id)} style={{ marginLeft: 10 }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
