import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Merchant {
  id: string;
  telegram_id: number;
  username: string;
  name: string;
  wallet_address: string;
}

interface AuthCtx {
  token: string | null;
  merchant: Merchant | null;
  login: (initData: string) => Promise<void>;
  loading: boolean;
  apiUrl: string;
}

const AuthContext = createContext<AuthCtx>({
  token: null, merchant: null, login: async () => { }, loading: true, apiUrl: API_URL
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("tpg_token");
    const savedMerchant = localStorage.getItem("tpg_merchant");
    if (saved && savedMerchant) {
      setToken(saved);
      setMerchant(JSON.parse(savedMerchant));
    }
    // Auto-auth from Telegram initData if available
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && !saved) {
      login(tg.initData).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(initData: string) {
    try {
      const res = await fetch(`${API_URL}/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setMerchant(data.merchant);
        localStorage.setItem("tpg_token", data.token);
        localStorage.setItem("tpg_merchant", JSON.stringify(data.merchant));
      }
    } catch (err) {
      console.error("Login error:", err);
    }
  }

  return (
    <AuthContext.Provider value={{ token, merchant, login, loading, apiUrl: API_URL }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

export function useApiFetch(path: string, deps: unknown[] = []) {
  const { token, apiUrl } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path, token, ...deps]);

  return { data, loading, error };
}
