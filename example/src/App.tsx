import { useEffect, useState } from "react";
import { ShoppingCart, Sword, Shield, Zap, CheckCircle2 } from "lucide-react";
import { TonPaymentGateway } from "ton-payment-gateway";
import "./App.css";

// 🚀 Initialize the Gateway SDK
// In production, ensure this points to your deployed API
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const API_KEY = import.meta.env.VITE_API_KEY || "YOUR_API_KEY_HERE";

interface Product {
  id: string;
  name: string;
  priceTon: string;
  icon: any;
  desc: string;
  color: string;
}

const PRODUCTS: Product[] = [
  { id: "item_sword", name: "Legendary Fire Sword", priceTon: "0.1", icon: Sword, desc: "+100 Attack Damage", color: "#ff4d4d" },
  { id: "item_shield", name: "Aegis Shield", priceTon: "0.25", icon: Shield, desc: "+500 Defense", color: "#4d79ff" },
  { id: "item_spell", name: "Scroll of Lightning", priceTon: "0.05", icon: Zap, desc: "Insta-cast AoE", color: "#ffff4d" },
];

function App() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Initialize the TonPaymentGateway SDK on mount
    TonPaymentGateway.init({
      apiUrl: API_URL,
      apiKey: API_KEY, // Note: In a real app, you should create payments on your backend to keep keys secret! This is for client-side demonstration.
      // theme: "dark" - The SDK uses a built-in dark theme by default
    });
  }, []);

  const handleBuy = async (product: Product) => {
    try {
      setLoadingId(product.id);
      setError(null);

      // 2. Create the payment intent
      const payment = await TonPaymentGateway.createPayment({
        amount: product.priceTon,
        description: `Purchase: ${product.name}`,
        metadata: { productId: product.id }
      });

      // 3. Open the checkout modal and wait for confirmation via callbacks
      TonPaymentGateway.openCheckout(payment.id, {
        onSuccess: () => {
          setPurchased(p => [...p, product.id]);
          setLoadingId(null);
        },
        onFailure: (err) => {
          setError(err.message || "Failed to process payment");
          setLoadingId(null);
        },
        onClose: () => {
          setLoadingId(null);
        }
      });

    } catch (err: any) {
      console.error("Payment initialization failed:", err);
      setError(err.message || "Failed to initialize payment");
      setLoadingId(null);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🎮</div>
          <h1>TonMerchant Example Store</h1>
        </div>
        <div className="cart">
          <ShoppingCart size={20} />
          <span className="cart-badge">{purchased.length}</span>
        </div>
      </header>

      <main className="main-content">
        <div className="hero">
          <h2>Upgrade Your Arsenal with TON</h2>
          <p>This is a sample storefront demonstrating the TonPaymentGateway JS SDK integration. Click buy to test the seamless crypto checkout flow!</p>
          
          {error && <div className="error-banner">⚠️ {error}</div>}
        </div>

        <div className="product-grid">
          {PRODUCTS.map(product => {
            const Icon = product.icon;
            const isOwned = purchased.includes(product.id);
            const isPending = loadingId === product.id;

            return (
              <div key={product.id} className={`product-card ${isOwned ? "owned" : ""}`}>
                <div className="product-icon-wrapper" style={{ background: `${product.color}20` }}>
                  <Icon size={40} color={product.color} />
                </div>
                <h3>{product.name}</h3>
                <p className="product-desc">{product.desc}</p>
                
                <div className="product-footer">
                  <div className="price">
                    <img src="https://ton.org/download/ton_symbol.svg" alt="TON" className="ton-logo" />
                    <span>{product.priceTon}</span>
                  </div>
                  
                  <button 
                    className={`buy-btn ${isOwned ? "success" : ""}`}
                    onClick={() => handleBuy(product)}
                    disabled={isOwned || loadingId !== null}
                  >
                    {isOwned ? (
                      <><CheckCircle2 size={16} /> Owned</>
                    ) : isPending ? (
                      <span className="loader"></span>
                    ) : (
                      "Buy Now"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* The SDK automatically injects its modal into the DOM when openCheckout is called */}
    </div>
  );
}

export default App;
