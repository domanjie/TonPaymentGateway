# TonPaymentGateway Example Store 🎮

This is a complete, working example of a React storefront that integrates the `ton-payment-gateway` JavaScript SDK. It demonstrates how to seamlessly accept TON payments on any website with a beautiful, pre-built checkout modal.

## 🚀 Quick Setup

This example assumes you already have the Backend API Server and Blockchain Listener running (e.g., via `docker-compose up` in the root repository).

### 1. Configure the Environment
Create a `.env` file in this `example/` directory based on the provided `.env.example`:

```bash
# Point to your local OR production Gateway API
VITE_API_URL="http://localhost:3000"

# Provide an active API Key generated from the Merchant Dashboard
VITE_API_KEY="pk_test_xxxxxxxxxxxxxxxxxxxxxxxx"
```

> **Security Note:** In a production application, you should *never* expose your `sk_` (secret) or `pk_` (public) keys directly to the frontend. Instead, you should call your own backend to `POST /payments` and pass only the resulting `payment.id` down to the JS SDK's `openCheckout(id)`. This example does client-side creation purely for demonstration ease.

### 2. Install Dependencies
```bash
npm install
```
*(This automatically links the local `ton-payment-gateway` SDK from the monorepo).*

### 3. Run the Store
```bash
npm run dev
```

Open `http://localhost:5173` in your browser. 
Click **"Buy Now"** on any item to experience the smooth TON checkout flow!

---

## 💻 Integration Code Deep Dive

Integrating the gateway requires only three simple steps. You can review exactly how it's done in [`src/App.tsx`](src/App.tsx).

### Step 1: Initialize the SDK
Initialize it once when your app loads:
```typescript
import { TonPaymentGateway } from "ton-payment-gateway";

TonPaymentGateway.init({
  apiUrl: "http://localhost:3000",
  apiKey: "pk_test_...",
  theme: "dark" // "light" or "dark"
});
```

### Step 2: Create a Payment Intent
*(Ideally executed on your secure backend server!)*
```typescript
const payment = await TonPaymentGateway.createPayment({
  amount: "0.1", 
  currency: "TON",
  description: "Legendary Fire Sword",
  metadata: { userId: "123", itemId: "sword" }
});
```

### Step 3: Open the Modal and Wait!
Pop open the beautifully animated QR code and TON Connect modal. This Promise resolves automatically the moment the Blockchain Listener detects that the user has sent the exact amount to your wallet!

```typescript
try {
  const result = await TonPaymentGateway.openCheckout(payment.id);
  
  if (result.status === "confirmed") {
    alert("Payment successful! Item unlocked.");
  }
} catch (err) {
  console.error("Payment cancelled or failed");
}
```

That's it! The entire complex backend matching and TON RPC parsing is handled completely for you by the Agentic TON Gateway.
