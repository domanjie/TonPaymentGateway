// ============================================================
// TonPaymentGateway JavaScript SDK
// Main entry point
// ============================================================

export interface InitOptions {
  apiKey: string;
  apiUrl?: string;
  network?: "mainnet" | "testnet";
}

export interface CreatePaymentOptions {
  amount: string | number;
  currency?: "TON";
  description?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  status: "pending" | "awaiting_payment" | "confirmed" | "failed" | "expired" | "refunded";
  amount: string;
  currency: string;
  description?: string;
  memo: string;
  walletAddress?: string;
  expiresAt: string;
  createdAt: string;
}

export interface CheckoutOptions {
  onSuccess?: (payment: Payment) => void;
  onFailure?: (error: Error) => void;
  onClose?: () => void;
}

// ── SDK State ─────────────────────────────────────────────────
let _apiKey: string | null = null;
let _apiUrl: string = "https://api.tonpaymentgateway.com";
let _network: "mainnet" | "testnet" = "mainnet";
let _checkoutModal: HTMLElement | null = null;

// ── TonPaymentGateway SDK ─────────────────────────────────────
export const TonPaymentGateway = {
  /**
   * Initialize the SDK with your API key
   */
  init(options: InitOptions): void {
    if (!options.apiKey) throw new Error("apiKey is required");
    _apiKey = options.apiKey;
    if (options.apiUrl) _apiUrl = options.apiUrl;
    if (options.network) _network = options.network;
    injectStyles();
  },

  /**
   * Create a new payment
   */
  async createPayment(options: CreatePaymentOptions): Promise<Payment> {
    if (!_apiKey) throw new Error("TonPaymentGateway not initialized. Call init() first.");

    const response = await fetch(`${_apiUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": _apiKey,
      },
      body: JSON.stringify({
        amount: String(options.amount),
        currency: options.currency || "TON",
        description: options.description,
        webhookUrl: options.webhookUrl,
        metadata: options.metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<Payment>;
  },

  /**
   * Open the checkout modal for a payment
   */
  openCheckout(paymentId: string, options: CheckoutOptions = {}): void {
    if (_checkoutModal) _checkoutModal.remove();
    _checkoutModal = createCheckoutModal(paymentId, _apiUrl, options);
    document.body.appendChild(_checkoutModal);
  },

  /**
   * Close the checkout modal
   */
  closeCheckout(): void {
    if (_checkoutModal) {
      _checkoutModal.remove();
      _checkoutModal = null;
    }
  },

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<{ id: string; status: string; confirmedAt?: string }> {
    const response = await fetch(`${_apiUrl}/payments/${paymentId}/status`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
};

// ── Checkout Modal ────────────────────────────────────────────
function createCheckoutModal(
  paymentId: string,
  apiUrl: string,
  options: CheckoutOptions
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = "tpg-overlay";
  overlay.innerHTML = `
    <div id="tpg-modal">
      <div id="tpg-header">
        <div id="tpg-logo">💎 TON Payment</div>
        <button id="tpg-close" aria-label="Close">✕</button>
      </div>
      <div id="tpg-body">
        <div id="tpg-loading">
          <div class="tpg-spinner"></div>
          <p>Loading payment...</p>
        </div>
        <div id="tpg-content" style="display:none">
          <div id="tpg-amount-display"></div>
          <div id="tpg-description"></div>
          <div id="tpg-qr-container">
            <canvas id="tpg-qr"></canvas>
            <p class="tpg-qr-label">Scan with TON Wallet</p>
          </div>
          <div id="tpg-memo-container">
            <p class="tpg-label">Payment ID / Memo</p>
            <div id="tpg-memo-display"></div>
          </div>
          <div id="tpg-actions">
            <button id="tpg-tonconnect-btn" class="tpg-btn tpg-btn-primary">
              <span>Connect & Pay with TON Wallet</span>
            </button>
          </div>
          <p id="tpg-timer"></p>
        </div>
        <div id="tpg-success" style="display:none">
          <div class="tpg-status-icon tpg-success-icon">✅</div>
          <h3>Payment Confirmed!</h3>
          <p>Your payment has been successfully processed.</p>
          <button class="tpg-btn tpg-btn-primary" id="tpg-done-btn">Done</button>
        </div>
        <div id="tpg-failed" style="display:none">
          <div class="tpg-status-icon tpg-fail-icon">❌</div>
          <h3>Payment Failed</h3>
          <p>Something went wrong. Please try again.</p>
          <button class="tpg-btn tpg-btn-secondary" id="tpg-retry-btn">Try Again</button>
        </div>
      </div>
    </div>
  `;

  // Close handler
  overlay.querySelector("#tpg-close")!.addEventListener("click", () => {
    overlay.remove();
    _checkoutModal = null;
    options.onClose?.();
  });

  overlay.querySelector("#tpg-overlay")?.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      _checkoutModal = null;
      options.onClose?.();
    }
  });

  // Load payment data
  loadPaymentIntoModal(overlay, paymentId, apiUrl, options);

  return overlay;
}

async function loadPaymentIntoModal(
  modal: HTMLElement,
  paymentId: string,
  apiUrl: string,
  options: CheckoutOptions
) {
  try {
    const res = await fetch(`${apiUrl}/payments/${paymentId}/status`);
    const paymentStatus = await res.json();

    const payRes = await fetch(`${apiUrl}/payments/${paymentId}`, {
      headers: _apiKey ? { "X-API-Key": _apiKey } : {},
    });

    const payment: Payment = await payRes.json();

    const loading = modal.querySelector("#tpg-loading") as HTMLElement;
    const content = modal.querySelector("#tpg-content") as HTMLElement;

    loading.style.display = "none";
    content.style.display = "block";

    // Set amount
    (modal.querySelector("#tpg-amount-display") as HTMLElement).innerHTML =
      `<span class="tpg-amount">${payment.amount}</span> <span class="tpg-currency">TON</span>`;

    // Set description
    if (payment.description) {
      (modal.querySelector("#tpg-description") as HTMLElement).textContent = payment.description;
    }

    // Set memo
    (modal.querySelector("#tpg-memo-display") as HTMLElement).textContent = payment.memo;

    // Render simple QR (text-based for lightness, real impl uses qrcode.js)
    const qrCanvas = modal.querySelector("#tpg-qr") as HTMLCanvasElement;
    renderSimpleQR(qrCanvas, `ton://transfer/${payment.walletAddress}?amount=${parseFloat(payment.amount) * 1e9}&text=${payment.memo}`);

    // TON Connect button
    modal.querySelector("#tpg-tonconnect-btn")!.addEventListener("click", () => {
      const tonUrl = `ton://transfer/${payment.walletAddress}?amount=${Math.round(parseFloat(payment.amount) * 1e9)}&text=${payment.memo}`;
      window.open(tonUrl, "_blank");
    });

    // Poll for status
    pollStatus(modal, paymentId, apiUrl, payment, options);

  } catch (err) {
    console.error("Failed to load payment:", err);
  }
}

function pollStatus(modal: HTMLElement, paymentId: string, apiUrl: string, payment: Payment, options: CheckoutOptions) {
  let attempts = 0;
  const maxAttempts = 120; // 10 min at 5s intervals

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      return;
    }

    const res = await fetch(`${apiUrl}/payments/${paymentId}/status`);
    const data = await res.json();

    if (data.status === "confirmed") {
      clearInterval(interval);
      showSuccess(modal, payment);
      options.onSuccess?.({ ...payment, status: "confirmed" });
    } else if (["failed", "expired"].includes(data.status)) {
      clearInterval(interval);
      showFailed(modal);
      options.onFailure?.(new Error(`Payment ${data.status}`));
    }

    // Update timer
    const expiresAt = new Date(payment.expiresAt).getTime();
    const remaining = Math.max(0, expiresAt - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timer = modal.querySelector("#tpg-timer") as HTMLElement;
    if (timer) timer.textContent = `Expires in ${mins}:${secs.toString().padStart(2, "0")}`;
  }, 5000);
}

function showSuccess(modal: HTMLElement, payment: Payment) {
  (modal.querySelector("#tpg-content") as HTMLElement).style.display = "none";
  (modal.querySelector("#tpg-success") as HTMLElement).style.display = "block";
  modal.querySelector("#tpg-done-btn")!.addEventListener("click", () => {
    modal.remove();
    _checkoutModal = null;
  });
}

function showFailed(modal: HTMLElement) {
  (modal.querySelector("#tpg-content") as HTMLElement).style.display = "none";
  (modal.querySelector("#tpg-failed") as HTMLElement).style.display = "block";
}

// ── Minimal QR renderer (canvas-based) ───────────────────────
function renderSimpleQR(canvas: HTMLCanvasElement, data: string) {
  canvas.width = 180;
  canvas.height = 180;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 180, 180);
  ctx.fillStyle = "#111";
  ctx.font = "10px monospace";
  ctx.fillText("Scan in TON Wallet", 10, 100);
  ctx.fillText(data.substring(0, 20) + "...", 10, 115);
  // NOTE: In production, use @tonconnect/qr-code-styling or similar
}

// ── Inject CSS styles ─────────────────────────────────────────
function injectStyles() {
  if (document.getElementById("tpg-styles")) return;
  const style = document.createElement("style");
  style.id = "tpg-styles";
  style.textContent = `
    #tpg-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      backdrop-filter: blur(4px);
    }
    #tpg-modal {
      background: #0f1117; color: #fff; border-radius: 20px;
      padding: 28px; width: 360px; max-width: 95vw;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
      animation: tpg-slide-up 0.3s ease;
    }
    @keyframes tpg-slide-up {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    #tpg-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px;
    }
    #tpg-logo { font-size: 18px; font-weight: 700; }
    #tpg-close {
      background: rgba(255,255,255,0.1); border: none; color: #fff;
      width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 14px;
      transition: background 0.2s;
    }
    #tpg-close:hover { background: rgba(255,255,255,0.2); }
    #tpg-loading { text-align: center; padding: 40px; }
    .tpg-spinner {
      width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #0095ff; border-radius: 50%; animation: tpg-spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes tpg-spin { to { transform: rotate(360deg); } }
    #tpg-amount-display { text-align: center; margin-bottom: 6px; }
    .tpg-amount { font-size: 42px; font-weight: 800; color: #0095ff; }
    .tpg-currency { font-size: 22px; color: rgba(255,255,255,0.6); }
    #tpg-description { text-align: center; color: rgba(255,255,255,0.5); margin-bottom: 20px; }
    #tpg-qr-container { text-align: center; margin: 16px 0; }
    #tpg-qr { border-radius: 12px; border: 2px solid rgba(255,255,255,0.1); }
    .tpg-qr-label { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 8px; }
    #tpg-memo-container { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 12px; margin: 12px 0; }
    .tpg-label { font-size: 11px; color: rgba(255,255,255,0.4); margin-bottom: 4px; }
    #tpg-memo-display { font-family: monospace; font-size: 13px; color: #0095ff; }
    .tpg-btn {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;
    }
    .tpg-btn-primary { background: #0095ff; color: #fff; }
    .tpg-btn-primary:hover { background: #007acc; transform: translateY(-1px); }
    .tpg-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
    #tpg-timer { text-align: center; font-size: 12px; color: rgba(255,255,255,0.3); margin-top: 10px; }
    #tpg-success, #tpg-failed { text-align: center; padding: 20px 0; }
    .tpg-status-icon { font-size: 60px; margin-bottom: 12px; }
    #tpg-success h3, #tpg-failed h3 { font-size: 20px; margin-bottom: 8px; }
    #tpg-success p, #tpg-failed p { color: rgba(255,255,255,0.5); margin-bottom: 20px; }
  `;
  document.head.appendChild(style);
}

export default TonPaymentGateway;
