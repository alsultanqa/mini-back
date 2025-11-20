/* BalanceChain Serial Twin SDK – Local Mock Demo
   Version: 1.4 – Serial-level Twin Engine */

window.BalanceChainSDK = {
  _ready: false,
  _lastIndex: 0,

  async init() {
    const saved = localStorage.getItem("bc_lastIndex");
    this._lastIndex = saved ? Number(saved) : 0;
    this._ready = true;
  },

  // 🔹 توليد Block Hash تجريبي
  _genHash() {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return "bch_" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  // 🔹 توليد Serial ID منظم
  _genSerial(currency = "QAR") {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    this._lastIndex += 1;
    localStorage.setItem("bc_lastIndex", this._lastIndex);

    return `${currency}-SCL-${y}${m}${d}-${String(this._lastIndex).padStart(6, "0")}`;
  },

  async ensureIBAN(userId) {
    return {
      iban: "QA84 0000 0000 0000 " + userId.slice(-4),
      bic: "QNBAQAQA"
    };
  },

  // 🔹 Mirror function – يعطي Serial Twin كامل
  async mirrorToMSL({ userId, direction, amount, currency, ref }) {
    if (!this._ready) await this.init();

    const serialId = this._genSerial(currency);
    const blockHash = this._genHash();

    return {
      success: true,
      serialId,
      blockHash,
      direction,
      amount,
      currency,
      ref,
      timestamp: Date.now(),
    };
  }
};
