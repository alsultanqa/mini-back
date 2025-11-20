/* MiniBank – Full Demo with Login Screen, Member Theme, Tickers, Modals, Money AI, FX, Family Freeze/Delete, Categories, Cashback, Member Funding, Money AI Coach */
/* All local, IndexedDB-backed, no real bank connectivity */

const $ = (s, r = document) => r.querySelector(s);

const state = {
  authed: false,
  user: { id: null, email: null, credId: null, name: {}, phone: null, pin: null },
  baseCurrency: 'QAR',
  activeCurrency: 'QAR',
  wallets: {},
  globalDisplayCurrency: 'QAR',
  insightsMode: 'overview',
  reportLang: 'both',
  wallet: { balance: 0, hold: 0 },
  iban: null,
  bic: null,
  tx: [],
  family: [],
  activeActor: { type: 'owner', memberId: null, origin: null },
  merchantLastPayload: null,
  goals: [] // 👈 جديد – أهداف Rich Goals
};

  let editingMemberId = null;
  let freezingMemberId = null;
  let currentTxMode = null;

  const idb = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        const req = indexedDB.open('minibank_store', 6);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('wallet')) db.createObjectStore('wallet', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('family')) db.createObjectStore('family', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('insights_history')) db.createObjectStore('insights_history', { keyPath: 'id' });
        };
        req.onsuccess = () => { idb.db = req.result; res(); };
        req.onerror = () => rej(req.error);
      });
    },
    put(store, obj) {
      return new Promise((res, rej) => {
        const tx = idb.db.transaction(store, 'readwrite');
        tx.objectStore(store).put(obj);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
    },
    get(store, id) {
      return new Promise((res, rej) => {
        const tx = idb.db.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    all(store) {
      return new Promise((res, rej) => {
        const tx = idb.db.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    },
    clearAll() {
      return new Promise((res, rej) => {
        const stores = ['profile', 'wallet', 'tx', 'family', 'insights_history'];
        const tx = idb.db.transaction(stores, 'readwrite');
        stores.forEach(s => tx.objectStore(s).clear());
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
    },
    remove(store, id) {
      return new Promise((res, rej) => {
        const tx = idb.db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
    }
  };

  const CurrencyRegistry = {
    QAR: { code: 'QAR', name: 'Qatari Riyal', decimals: 2, region: 'GCC', active: true, symbol: 'ر.ق' },
    SAR: { code: 'SAR', name: 'Saudi Riyal', decimals: 2, region: 'GCC', active: true, symbol: '﷼' },
    AED: { code: 'AED', name: 'UAE Dirham', decimals: 2, region: 'GCC', active: true, symbol: 'د.إ' },
    KWD: { code: 'KWD', name: 'Kuwaiti Dinar', decimals: 3, region: 'GCC', active: true, symbol: 'د.ك' },
    OMR: { code: 'OMR', name: 'Omani Rial', decimals: 3, region: 'GCC', active: true, symbol: 'ر.ع.' },
    BHD: { code: 'BHD', name: 'Bahraini Dinar', decimals: 3, region: 'GCC', active: true, symbol: 'د.ب' },
    USD: { code: 'USD', name: 'US Dollar', decimals: 2, region: 'US', active: true, symbol: '$' },
    EUR: { code: 'EUR', name: 'Euro', decimals: 2, region: 'EU', active: true, symbol: '€' },
    GBP: { code: 'GBP', name: 'British Pound', decimals: 2, region: 'UK', active: true, symbol: '£' },
    JPY: { code: 'JPY', name: 'Japanese Yen', decimals: 0, region: 'Asia', active: true, symbol: '¥' }
  };

  function ensureWalletStructures() {
    if (!state.baseCurrency) state.baseCurrency = 'QAR';
    if (!state.activeCurrency) state.activeCurrency = state.baseCurrency;
    if (!state.wallets || typeof state.wallets !== 'object') {
      state.wallets = {};
    }
    Object.keys(CurrencyRegistry).forEach(code => {
      if (!state.wallets[code]) state.wallets[code] = { balance: 0, hold: 0 };
    });
    if (state.wallet && (state.wallet.balance || state.wallet.hold)) {
      const base = state.baseCurrency || 'QAR';
      const w = state.wallets[base] || (state.wallets[base] = { balance: 0, hold: 0 });
      if (state.wallet.balance && !w.balance) w.balance = state.wallet.balance;
      if (state.wallet.hold && !w.hold) w.hold = state.wallet.hold;
    }
    const base = state.baseCurrency || 'QAR';
    if (state.wallets[base]) {
      state.wallet = state.wallets[base];
    }
  }

  function getActiveCurrency() {
    return state.activeCurrency || state.baseCurrency || 'QAR';
  }

  function getActiveWalletRef() {
    ensureWalletStructures();
    const cur = getActiveCurrency();
    if (!state.wallets[cur]) state.wallets[cur] = { balance: 0, hold: 0 };
    return state.wallets[cur];
  }

  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function startOfWeek(ts) { const d = new Date(ts); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function startOfMonth(ts) { const d = new Date(ts); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function newLimitState(perTx = 0, daily = 0, weekly = 0, monthly = 0) {
    const now = Date.now();
    return {
      perTx, daily, weekly, monthly,
      cToday: 0, cWeek: 0, cMonth: 0,
      startToday: startOfDay(now),
      startWeek: startOfWeek(now),
      startMonth: startOfMonth(now)
    };
  }

  function refreshWindows(m) {
    const now = Date.now();
    const L = m.limits || (m.limits = newLimitState());
    if (now >= (L.startToday || 0) + 86400000) { L.cToday = 0; L.startToday = startOfDay(now); }
    if (now >= (L.startWeek || 0) + 7 * 86400000) { L.cWeek = 0; L.startWeek = startOfWeek(now); }
    const monthEdge = new Date(L.startMonth || 0); monthEdge.setMonth(monthEdge.getMonth() + 1);
    if (now >= monthEdge.getTime()) { L.cMonth = 0; L.startMonth = startOfMonth(now); }
  }

  function checkLimits(m, amt) {
    refreshWindows(m);
    const L = m.limits || {};
    if (L.perTx && amt > L.perTx) { msg('Denied: exceeds per-transaction limit.'); return false; }
    if (L.daily && (L.cToday + amt) > L.daily) { msg('Denied: exceeds daily limit.'); return false; }
    if (L.weekly && (L.cWeek + amt) > L.weekly) { msg('Denied: exceeds weekly limit.'); return false; }
    if (L.monthly && (L.cMonth + amt) > L.monthly) { msg('Denied: exceeds monthly limit.'); return false; }
    return true;
  }

  function bumpCounters(m, amt) {
    refreshWindows(m);
    m.limits.cToday = (m.limits.cToday || 0) + amt;
    m.limits.cWeek = (m.limits.cWeek || 0) + amt;
    m.limits.cMonth = (m.limits.cMonth || 0) + amt;
  }

  function prettyCategory(code) {
    switch (code) {
      case 'food': return 'Food & Groceries / طعام';
      case 'transport': return 'Transport / مواصلات';
      case 'shopping': return 'Shopping / تسوق';
      case 'bills': return 'Bills & Utilities / فواتير';
      case 'education': return 'Education / تعليم';
      case 'health': return 'Health / صحة';
      case 'travel': return 'Travel / سفر';
      case 'entertainment': return 'Entertainment / ترفيه';
      case 'other': return 'Other / أخرى';
      case 'general':
      default: return 'General / عام';
    }
  }

  async function boot() {
    await idb.open();
    if (window.BalanceChainSDK && BalanceChainSDK.init) await BalanceChainSDK.init();
    bind();
    initTickers();
    await restore();
    render();
    renderInsights();
    updateShellVisibility();

    if (typeof logInsightSnapshot === 'function') logInsightSnapshot('boot');

    if (state.authed) {
      $('#onboardCard')?.classList.add('hidden');
      $('#loginCard')?.classList.add('hidden');
      $('#welcomeShell')?.classList.add('hidden');
    }

    const bioHint = $('#bioSupportHint');
    if (bioHint) {
      if ('credentials' in navigator) {
        bioHint.textContent = 'هذا المتصفح يدعم WebAuthn – يمكنك تفعيل أو إعادة ضبط البصمة / Face ID لهذا الحساب.';
      } else {
        bioHint.textContent = 'هذا المتصفح لا يدعم WebAuthn – سيتم الاعتماد فقط على PIN المحلي في هذا الديمو.';
      }
    }
  }

  function bind() {
    $('#btnSignUp')?.addEventListener('click', openOnboardCard);
    $('#btnSignUpBody')?.addEventListener('click', openOnboardCard);

    $('#btnSignIn')?.addEventListener('click', openLoginCard);
    $('#btnSignInBody')?.addEventListener('click', openLoginCard);

    $('#btnBioIn')?.addEventListener('click', signInBio);
    $('#btnLogout')?.addEventListener('click', logout);

    $('#btnBackOwner')?.addEventListener('click', backToOwner);
    $('#btnBackOwnerInline')?.addEventListener('click', backToOwner);

    const onboardForm = $('#onboardForm');
    onboardForm?.addEventListener('submit', submitOnboardForm);
    $('#btnCancelOnboard')?.addEventListener('click', closeOnboardCard);

    const loginForm = $('#loginForm');
    loginForm?.addEventListener('submit', submitLoginForm);
    $('#btnCancelLogin')?.addEventListener('click', closeLoginCard);

    $('#btnTxConfirm')?.addEventListener('click', handleTxConfirm);
    $('#btnTxCancel')?.addEventListener('click', closeTxModal);

    $('#btnDeposit')?.addEventListener('click', () => openTxModal('deposit'));
    $('#btnWithdraw')?.addEventListener('click', () => openTxModal('withdraw'));
    $('#btnPay')?.addEventListener('click', () => openTxModal('pay'));
    $('#btnTransfer')?.addEventListener('click', openTransferModal);

    $('#btnAddMember')?.addEventListener('click', addMember);

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // لو الزر داخل الـ Money AI mode toggle ما نعامله كـ main tab
    if (btn.closest('#insightsModeToggle')) return;

    const t = btn.getAttribute('data-tab');
    if (!t) return; // أمان إضافي – لو ما عنده data-tab لا تفعل شيء

    switchTab(t);
  });
});

    const profileForm = $('#profileForm');
    profileForm?.addEventListener('submit', submitProfileForm);
    $('#btnResetBio')?.addEventListener('click', resetBiometrics);
    $('#btnClearBio')?.addEventListener('click', clearBiometrics);

    $('#btnGenQR')?.addEventListener('click', genMerchantQR);
    $('#btnPayQR')?.addEventListener('click', payMerchantQR);
    $('#btnTapNFC')?.addEventListener('click', tapNFC);

    $('#btnSaveLimits')?.addEventListener('click', saveLimitsFromModal);
    $('#btnCancelLimits')?.addEventListener('click', closeLimitsModal);

    $('#btnFreezeSave')?.addEventListener('click', applyFreezeFromModal);
    $('#btnFreezeUnfreeze')?.addEventListener('click', unfreezeFromModal);
    $('#btnFreezeCancel')?.addEventListener('click', closeFreezeModal);

    $('#btnTransferConfirm')?.addEventListener('click', handleTransferConfirm);
    $('#btnTransferCancel')?.addEventListener('click', closeTransferModal);

    const curSel = $('#currencySelector');
    curSel?.addEventListener('change', (e) => {
      state.activeCurrency = e.target.value;
      render();
      renderInsights();
      renderHistory();
    });

    const insightsBase = $('#insightsBaseCurrency');
    insightsBase?.addEventListener('change', e => {
      state.globalDisplayCurrency = e.target.value || (state.baseCurrency || 'QAR');
      renderInsights();
    });

    const modeToggle = $('#insightsModeToggle');
    if (modeToggle) {
      modeToggle.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); // احتياط لو داخل form
          const mode = btn.getAttribute('data-mode') || 'overview';

          // ثبّت الـ state
          state.insightsMode = mode;

          // حدّث الـ UI للتابات
          modeToggle.querySelectorAll('button').forEach(b => {
            const m = b.getAttribute('data-mode') || 'overview';
            b.classList.toggle('active', m === mode);
          });

          // ارسم الـ Insights مباشرة بالـ mode الجديد
          renderInsights(mode);
        });
      });
    }

    const exportBtn = $('#btnExportReport');
    exportBtn?.addEventListener('click', () => {
      const dlg = $('#reportLangModal');
      if (dlg) dlg.classList.remove('hidden');
    });

    $('#btnReportLangCancel')?.addEventListener('click', () => {
      $('#reportLangModal')?.classList.add('hidden');
    });

    $('#btnReportLangOk')?.addEventListener('click', () => {
      const dlg = $('#reportLangModal');
      const choice = dlg?.querySelector('input[name="reportLang"]:checked');
      state.reportLang = choice ? choice.value : 'both';
      $('#reportLangModal')?.classList.add('hidden');
      generateMoneyAIReport();
    });

    const fxBtn = $('#btnFxConvert');
    fxBtn?.addEventListener('click', convertFx);
  }

  async function restore() {
    const p = await idb.get('profile', 'me');
    if (p) {
      state.user = p.user || state.user;
      state.authed = !!p.authed;
      state.iban = p.iban || null;
      state.bic = p.bic || null;
      state.user.credId = p.credId || state.user.credId || null;
      state.activeActor = p.activeActor || state.activeActor;
      state.goals = p.goals || []; // 👈 تحميل الأهداف
    }
    const w = await idb.get('wallet', 'me');
    if (w) {
      if (w.wallets) {
        state.wallets = w.wallets || {};
        state.baseCurrency = w.baseCurrency || state.baseCurrency || 'QAR';
        state.activeCurrency = w.activeCurrency || state.activeCurrency || state.baseCurrency || 'QAR';
      }
      if (w.wallet) {
        state.wallet = w.wallet;
      }
    }
    ensureWalletStructures();
    if (!state.activeCurrency) state.activeCurrency = state.baseCurrency || 'QAR';
    const txs = await idb.all('tx');
    state.tx = (txs || []).sort((a, b) => b.ts - a.ts);
    const fam = await idb.all('family');
    state.family = fam || [];
    if (state.authed) await ensureIBAN();
  }

function saveProfile() {
  return idb.put('profile', {
    id: 'me',
    authed: state.authed,
    user: state.user,
    iban: state.iban,
    bic: state.bic,
    credId: state.user.credId || null,
    activeActor: state.activeActor,
    goals: state.goals || [] // 👈 حفظ الأهداف
  });
}

  function saveWallet() {
    ensureWalletStructures();
    const payload = {
      id: 'me',
      wallets: state.wallets || {},
      baseCurrency: state.baseCurrency || 'QAR',
      activeCurrency: state.activeCurrency || state.baseCurrency || 'QAR',
      wallet: state.wallet
    };
    return idb.put('wallet', payload);
  }

  function upsertMember(m) { return idb.put('family', m); }

  function pushTx(t) {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const cur = t.currency || getActiveCurrency();
    const tx = { id, currency: cur, ...t };
    state.tx.unshift(tx);
    const p = idb.put('tx', tx);
    if (typeof logInsightSnapshot === 'function') {
      p.then(() => logInsightSnapshot('tx')).catch(() => {});
    }
    return p;
  }

  async function logInsightSnapshot(reason = 'auto') {
    try {
      if (typeof getMoneyAISnapshotForReport !== 'function') return;
      if (!state.authed) return;
      if (!idb.db || !idb.db.objectStoreNames.contains('insights_history')) return;

      const snap = getMoneyAISnapshotForReport();
      if (!snap) return;

      const actor = state.activeActor || { type: 'owner', memberId: null, origin: null };
      const base = state.baseCurrency || 'QAR';
      const display = state.globalDisplayCurrency || base;
      const id = 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      const rec = {
        id,
        ts: Date.now(),
        reason,
        actor,
        baseCurrency: base,
        displayCurrency: display,
        score: Number(snap.score || 0),
        scoreLabel: snap.scoreLabel || null,
        runwayDays: Number(snap.runwayDays || 0),
        net30: Number(snap.net30 || 0),
        totalIncome30: Number(snap.totalIncome30 || 0),
        totalOut30: Number(snap.totalOut30 || 0),
        dailySpend: Number(snap.dailySpend || 0),
        dailySpend7: Number((snap.dailySpend7 !== undefined ? snap.dailySpend7 : 0) || 0),
        behaviorIndices: snap.behaviorIndices || null
      };

      await idb.put('insights_history', rec);
    } catch (e) {
      console.warn('logInsightSnapshot failed', e);
    }
  }

  function fullName(obj) {
    if (!obj?.name) return '';
    return [obj.name.first, obj.name.middle, obj.name.last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function openOnboardCard() {
    $('#onboardCard')?.classList.remove('hidden');
    $('#loginCard')?.classList.add('hidden');
  }
  function closeOnboardCard() {
    $('#onboardCard')?.classList.add('hidden');
  }
  function openLoginCard() {
    $('#loginCard')?.classList.remove('hidden');
    $('#onboardCard')?.classList.add('hidden');
  }
  function closeLoginCard() {
    $('#loginCard')?.classList.add('hidden');
  }

  async function submitOnboardForm(e) {
    e.preventDefault();
    const first = $('#signFirst').value.trim();
    const middle = $('#signMiddle').value.trim();
    const last = $('#signLast').value.trim();
    const email = $('#signEmail').value.trim();
    const phone = $('#signPhone').value.trim();
    const pin = $('#signPin').value.trim();

    if (!first || !last) return msg('First & family names are required.');
    if (!validateEmail(email)) return msg('Invalid email format.');
    if (!validateQatarPhone(phone)) return msg('Invalid Qatari phone.');
    if (!/^\d{4}$/.test(pin)) return msg('PIN must be 4 digits.');

    await createOwnerWithBio({ first, middle, last, email, phone, pin });
    closeOnboardCard();
  }

  async function createOwnerWithBio(userMeta) {
    if (!('credentials' in navigator)) {
      msg('WebAuthn not supported. Using PIN only (local demo).');
      const tempId = 'u_' + crypto.randomUUID();
      state.user = {
        id: tempId,
        email: userMeta.email,
        credId: null,
        name: { first: userMeta.first, middle: userMeta.middle, last: userMeta.last },
        phone: userMeta.phone,
        pin: userMeta.pin
      };
      state.authed = true;
      state.activeActor = { type: 'owner', memberId: null, origin: null };
      await ensureIBAN();
      await saveProfile();
      msg('Welcome ' + userMeta.first);
      render();
      renderInsights();
      updateShellVisibility();
      return;
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const tempId = 'u_' + crypto.randomUUID();
      const pubKey = {
        rp: { name: 'Mini Bank' },
        user: {
          id: new TextEncoder().encode(tempId),
          name: userMeta.email || 'user@example.com',
          displayName: userMeta.first || 'MiniBank User'
        },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'preferred' },
        timeout: 60000
      };
      const cred = await navigator.credentials.create({ publicKey: pubKey });
      if (!cred) return msg('Biometrics canceled.');
      const credId = bufToB64Url(cred.rawId);
      state.user = {
        id: tempId,
        email: userMeta.email,
        credId,
        name: { first: userMeta.first, middle: userMeta.middle, last: userMeta.last },
        phone: userMeta.phone,
        pin: userMeta.pin
      };
      state.authed = true;
      state.activeActor = { type: 'owner', memberId: null, origin: null };
      await ensureIBAN();
      await saveProfile();
      msg('Welcome ' + userMeta.first);
      render();
      renderInsights();
      updateShellVisibility();
    } catch (e) {
      msg('Biometrics setup failed: ' + e.message);
    }
  }

  async function submitLoginForm(e) {
    e.preventDefault();
    if (!state.user?.id) return msg('No owner account on this device. Create first.');
    const email = $('#loginEmail').value.trim();
    const pin = $('#loginPin').value.trim();
    if (!validateEmail(email)) return msg('Invalid email.');
    if (!/^\d{4}$/.test(pin)) return msg('PIN must be 4 digits.');
    if (email !== state.user.email || pin !== state.user.pin) {
      return msg('Wrong email or PIN.');
    }
    state.authed = true;
    state.activeActor = { type: 'owner', memberId: null, origin: null };
    await ensureIBAN();
    await saveProfile();
    closeLoginCard();
    msg('Signed in.');
    render();
    renderInsights();
    updateShellVisibility();
    if (typeof logInsightSnapshot === 'function') logInsightSnapshot('signin_pin');
  }

  async function signInBio() {
    if (!state.user?.credId) return msg('No biometric credential stored. Create owner with biometrics first.');
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: b64UrlToBuf(state.user.credId) }],
          userVerification: 'preferred',
          timeout: 60000
        }
      });
      if (assertion) {
        state.authed = true;
        state.activeActor = { type: 'owner', memberId: null, origin: null };
        await ensureIBAN();
        await saveProfile();
        msg('Signed in with biometrics.');
        render();
        renderInsights();
        updateShellVisibility();
        if (typeof logInsightSnapshot === 'function') logInsightSnapshot('signin');
      }
    } catch (e) {
      msg('Biometric sign-in failed: ' + e.message);
    }
  }

  async function resetBiometrics() {
    if (!state.user?.id) {
      msg('Create account first.');
      return;
    }
    if (!('credentials' in navigator)) {
      state.user.credId = null;
      await saveProfile();
      updateShellVisibility();
      msg('WebAuthn غير مدعوم – تم إزالة بيانات البصمة من هذا الجهاز فقط.');
      return;
    }
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const pubKey = {
        rp: { name: 'Mini Bank' },
        user: {
          id: new TextEncoder().encode(state.user.id),
          name: state.user.email || 'user@example.com',
          displayName: fullName(state.user) || 'MiniBank Owner'
        },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'preferred' },
        timeout: 60000
      };
      const cred = await navigator.credentials.create({ publicKey: pubKey });
      if (!cred) {
        msg('Biometric reset cancelled.');
        return;
      }
      const credId = bufToB64Url(cred.rawId);
      state.user.credId = credId;
      await saveProfile();
      updateShellVisibility();
      msg('Biometric credential updated for this account on this device.');
    } catch (e) {
      msg('Biometric reset failed: ' + e.message);
    }
  }

  async function clearBiometrics() {
    if (!state.user?.id) {
      msg('Create account first.');
      return;
    }
    state.user.credId = null;
    await saveProfile();
    updateShellVisibility();
    msg('Biometric credential removed from this device. You can still sign in with email + PIN.');
  }

async function logout() {
  await idb.clearAll();
  state.authed = false;
  state.user = { id: null, email: null, credId: null, name: {}, phone: null, pin: null };
  state.baseCurrency = 'QAR';
  state.activeCurrency = 'QAR';
  state.wallets = {};
  state.wallet = { balance: 0, hold: 0 };
  state.iban = null;
  state.bic = null;
  state.tx = [];
  state.family = [];
  state.activeActor = { type: 'owner', memberId: null, origin: null };
  state.goals = [];               // 👈 مهم
  render();
  renderInsights();
  updateShellVisibility();
  msg('Logged out. State reset.');
}

  function openTxModal(mode) {
    const modal = $('#txModal');
    const titleEl = $('#txModalTitle');
    const subEl = $('#txModalSubtitle');
    const labelEl = $('#txModalLabel');
    const amtInput = $('#txAmount');
    const catGroup = $('#txCategoryGroup');
    const cur = getActiveCurrency();
    currentTxMode = mode;

    if (!modal || !amtInput) return;

    amtInput.value = '';
    const isPay = mode === 'pay';
    if (catGroup) catGroup.classList.toggle('hidden', !isPay);

    if (mode === 'deposit') {
      if (titleEl) titleEl.textContent = 'Deposit funds';
      if (subEl) subEl.textContent = 'Enter the amount you want to deposit into your ' + cur + ' wallet.';
    } else if (mode === 'withdraw') {
      if (titleEl) titleEl.textContent = 'Withdraw funds';
      if (subEl) subEl.textContent = 'Enter the amount you want to withdraw from your ' + cur + ' wallet.';
    } else if (mode === 'pay') {
      if (titleEl) titleEl.textContent = 'Pay (QR / NFC / Merchant)';
      if (subEl) subEl.textContent = 'Enter the amount you want to pay from your ' + cur + ' wallet and choose category.';
    } else {
      if (titleEl) titleEl.textContent = 'Transaction';
      if (subEl) subEl.textContent = '';
    }
    if (labelEl) labelEl.textContent = 'Amount (' + cur + ')';

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { amtInput.focus(); }, 30);
  }

  function closeTxModal() {
    const modal = $('#txModal');
    const amtInput = $('#txAmount');
    currentTxMode = null;
    if (amtInput) amtInput.value = '';
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function handleTxConfirm() {
    const amtInput = $('#txAmount');
    if (!amtInput) return closeTxModal();
    const raw = (amtInput.value || '').replace(',', '.');
    const amt = Number(raw);
    if (!amt || !Number.isFinite(amt) || amt <= 0) {
      msg('Enter a valid amount.');
      return;
    }
    let cat = null;
    if (currentTxMode === 'pay') {
      const catSel = $('#txCategory');
      cat = catSel ? (catSel.value || 'general') : 'general';
    }
    const mode = currentTxMode;
    if (mode === 'deposit') {
      await deposit(amt);
    } else if (mode === 'withdraw') {
      await withdraw(amt);
    } else if (mode === 'pay') {
      await actorPay(amt, cat);
    }
    closeTxModal();
  }

async function deposit(amt) {
  const cur = getActiveCurrency();
  amt = Number(amt);
  if (!amt || amt <= 0) {
    msg('Enter a valid amount.');
    return;
  }
  const wallet = getActiveWalletRef();
  const prev = wallet.balance || 0;
  wallet.balance += amt;
  if (cur === (state.baseCurrency || 'QAR')) {
    state.wallet.balance = wallet.balance;
    state.wallet.hold = wallet.hold || 0;
  }
  await saveWallet();

  // 🔹 توليد Serial Twin مرة واحدة
  let twin = null;
  if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
    twin = await BalanceChainSDK.mirrorToMSL({
      userId: state.user.id,
      direction: 'in',
      amount: amt,
      currency: cur,
      ref: 'deposit'
    });
  }

  await pushTx({
    ts: Date.now(),
    type: 'deposit',
    amount: amt,
    currency: cur,
    status: 'settled',
    actor: 'owner',
    serialId: twin?.serialId || null,
    blockHash: twin?.blockHash || null,
    ref: 'deposit'
  });

  render(true, prev);
  renderInsights();
  renderHistory();
}

async function withdraw(amt) {
  const cur = getActiveCurrency();
  amt = Number(amt);
  if (!amt || amt <= 0) {
    msg('Enter a valid amount.');
    return;
  }
  const wallet = getActiveWalletRef();
  if (amt > wallet.balance) return msg('Insufficient balance');
  const prev = wallet.balance || 0;
  wallet.balance -= amt;
  if (cur === (state.baseCurrency || 'QAR')) {
    state.wallet.balance = wallet.balance;
    state.wallet.hold = wallet.hold || 0;
  }
  await saveWallet();

  // 🔹 توليد Serial Twin
  let twin = null;
  if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
    twin = await BalanceChainSDK.mirrorToMSL({
      userId: state.user.id,
      direction: 'out',
      amount: amt,
      currency: cur,
      ref: 'withdraw'
    });
  }

  await pushTx({
    ts: Date.now(),
    type: 'withdraw',
    amount: amt,
    currency: cur,
    status: 'settled',
    actor: 'owner',
    serialId: twin?.serialId || null,
    blockHash: twin?.blockHash || null,
    ref: 'withdraw'
  });
  render(true, prev);
  renderInsights();
  renderHistory();
}

  async function addMember() {
    if (!state.authed) return msg('Sign in first.');
    if (state.activeActor.type !== 'owner') return msg('Only main wallet owner can add family members.');

    const first = $('#famFirst').value.trim();
    const middle = $('#famMiddle').value.trim();
    const last = $('#famLast').value.trim();
    const phone = $('#famPhone').value.trim();
    const mode = $('#famMode').value;
    const allowanceVal = Number($('#famAllowance').value || '0');
    const perTx = Number($('#famPerTx').value || '0');
    const daily = Number($('#famDaily').value || '0');
    const weekly = Number($('#famWeekly').value || '0');
    const monthly = Number($('#famMonthly').value || '0');

    if (!first || !last) return msg('Member first & family names are required.');
    if (phone && !/^((\+974)|974)?\d{8}$/.test(phone.replace(/\s+/g, ''))) return msg('Invalid Qatari phone.');

    const id = 'm_' + crypto.randomUUID();
    const member = {
      id,
      name: { first, middle, last },
      phone: phone || null,
      mode: (mode === 'full' ? 'full' : 'allowance'),
      allowance: (mode === 'full' ? 0 : Math.max(0, allowanceVal)),
      limits: newLimitState(perTx, daily, weekly, monthly),
      credId: null,
      frozen: false,
      frozenUntil: null,
      freezeHistory: []
    };
    state.family.push(member);
    await upsertMember(member);
    clearAddForm();
    renderFamily();
    msg('Added member: ' + fullName(member));
  }

  function clearAddForm() {
    ['famFirst', 'famMiddle', 'famLast', 'famPhone', 'famAllowance', 'famPerTx', 'famDaily', 'famWeekly', 'famMonthly']
      .forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
    const mode = $('#famMode'); if (mode) mode.value = 'allowance';
  }

  function memberFreezeStatus(m) {
    if (!m || !m.frozen) return { active: false, text: null };
    if (m.frozenUntil && Date.now() > m.frozenUntil) {
      m.frozen = false;
      m.frozenUntil = null;
      upsertMember(m);
      return { active: false, text: null };
    }
    let text;
    if (m.frozenUntil) {
      const d = new Date(m.frozenUntil);
      text = d.toLocaleString();
    } else {
      text = 'حتى إشعار آخر';
    }
    return { active: true, text };
  }

  async function actorPay(forcedAmount, category) {
    const amt = Number(forcedAmount);
    if (!amt || !Number.isFinite(amt) || amt <= 0) {
      msg('Enter a valid amount.');
      return;
    }
    const actor = state.activeActor;
    if (actor.type === 'owner') {
      return ownerPay(amt, category);
    }
    return memberPay(amt, category);
  }

async function memberPay(amt, category) {
  const m = state.family.find(x => x.id === state.activeActor.memberId);
  if (!m) return msg('Member not found.');

  const freeze = memberFreezeStatus(m);
  if (freeze.active) {
    msg('هذا الحساب مجمّد حالياً ولا يمكن إجراء عمليات. ' + (freeze.text ? 'حتى: ' + freeze.text : ''));
    return;
  }

  const baseCur = state.baseCurrency || 'QAR';
  ensureWalletStructures();
  const wallets = state.wallets || {};
  const baseWallet = wallets[baseCur] || (wallets[baseCur] = { balance: 0, hold: 0 });

  if (amt > baseWallet.balance) return msg('Insufficient main balance.');
  if (!checkLimits(m, amt)) return;
  if (m.mode === 'allowance' && amt > (m.allowance || 0)) return msg('Exceeds member allowance.');

  const prev = baseWallet.balance || 0;
  baseWallet.balance -= amt;
  state.wallet.balance = baseWallet.balance;
  state.wallet.hold = baseWallet.hold || 0;

  await saveWallet();
  if (m.mode === 'allowance') {
    m.allowance = Math.max(0, (m.allowance || 0) - amt);
  }
  bumpCounters(m, amt);
  await upsertMember(m);

  // 🔹 توليد Serial Twin
  let twin = null;
  if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
    twin = await BalanceChainSDK.mirrorToMSL({
      userId: state.user.id,
      direction: 'out',
      amount: amt,
      currency: baseCur,
      ref: 'member:' + m.id
    });
  }

  await pushTx({
    ts: Date.now(),
    type: 'member_purchase',
    amount: amt,
    currency: baseCur,
    status: 'settled',
    actor: m.id,
    actorName: fullName(m),
    category: category || 'general',
    serialId: twin?.serialId || null,
    blockHash: twin?.blockHash || null,
    ref: 'member:' + m.id
  });
  render(true, prev);
  renderInsights();
}
async function ownerPay(amt, category) {
  const cur = getActiveCurrency();
  ensureWalletStructures();
  const wallet = getActiveWalletRef();
  if (amt > (wallet.balance || 0)) return msg('Insufficient balance');

  const prev = wallet.balance || 0;
  wallet.balance -= amt;
  if (cur === (state.baseCurrency || 'QAR')) {
    state.wallet.balance = wallet.balance;
    state.wallet.hold = wallet.hold || 0;
  }

  await saveWallet();

  // أولاً نسجّل العملية كـ pending
  await pushTx({
    ts: Date.now(),
    type: 'merchant',
    amount: amt,
    currency: cur,
    status: 'pending',
    actor: 'owner',
    category: category || 'general'
  });
  render(true, prev);
  renderInsights();

  // بعد فترة قصيرة – تسوية + إصدار Serial Twin
  setTimeout(async () => {
    let twin = null;
    if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
      twin = await BalanceChainSDK.mirrorToMSL({
        userId: state.user.id,
        direction: 'out',
        amount: amt,
        currency: cur,
        ref: 'merchant'
      });
    }

    const first = state.tx.find(
      t =>
        t.status === 'pending' &&
        t.type === 'merchant' &&
        t.amount === amt &&
        t.currency === cur
    );
    if (first) {
      first.status = 'settled';
      first.serialId = twin?.serialId || null;
      first.blockHash = twin?.blockHash || null;
      first.ref = 'merchant';
      await idb.put('tx', first);
    }

    render();
    renderInsights();
  }, 800);
}

  async function ensureIBAN() {
    if (!state.user?.id) return;
    if (window.BalanceChainSDK && BalanceChainSDK.ensureIBAN) {
      const { iban, bic } = await BalanceChainSDK.ensureIBAN(state.user.id);
      state.iban = iban;
      state.bic = bic;
    } else {
      state.iban = 'QA00 0000 0000 0000 0000 0000';
      state.bic = 'QNBAQAQA';
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(btn => {
      const t = btn.getAttribute('data-tab');
      btn.classList.toggle('active', t === name);
    });
    document.querySelectorAll('.tab-panel').forEach(sec => {
      sec.classList.add('hidden');
      sec.classList.remove('fade-tab');
    });
    const panel = $('#tab-' + name);
    if (panel) {
      panel.classList.remove('hidden');
      panel.classList.add('fade-tab');
    }
  }

  function enableButtons(on) {
    const d = $('#btnDeposit'); if (d) d.disabled = !on;
    const w = $('#btnWithdraw'); if (w) w.disabled = !on;
    const p = $('#btnPay'); if (p) p.disabled = !on;
    const t = $('#btnTransfer'); if (t) t.disabled = !on;
  }

  function msg(t) { const el = $('#msg'); if (el) el.textContent = t || ''; }

  function render(pulseBalance = false, previousBalance = 0) {
    const actor = state.activeActor;
    const isMember = actor.type === 'member';
    const member = isMember ? state.family.find(f => f.id === actor.memberId) : null;
    const nameOwner = fullName(state.user);
    const name = isMember ? fullName(member) : nameOwner;
    const suffix = isMember ? ' (Member)' : '';
    const statusEl = $('#status');
     if (statusEl) {
      statusEl.textContent = state.authed
     ? `Signed in • ${name || 'Owner'}${suffix}`
     : 'Signed out';
    }

    document.body.classList.toggle('member-mode', isMember);
    document.body.classList.toggle('owner-mode', !isMember);

    const ownerChip = $('#ownerNameChip');
    if (ownerChip) ownerChip.textContent = 'Owner: ' + (nameOwner || '—');

    const ibanEl = $('#iban'); if (ibanEl) ibanEl.textContent = state.iban || '—';
    const bicEl = $('#bic'); if (bicEl) bicEl.textContent = state.bic || '—';

    ensureWalletStructures();
    let activeCur = getActiveCurrency();
    const wallets = state.wallets || {};
    let activeWallet = wallets[activeCur] || { balance: 0, hold: 0 };

    if (isMember && member) {
      state.activeCurrency = state.baseCurrency || 'QAR';
      activeCur = state.activeCurrency;
      activeWallet = wallets[activeCur] || { balance: 0, hold: 0 };
    }

    let displayBalance = activeWallet.balance || 0;
    if (isMember && member) {
      displayBalance = member.mode === 'allowance'
        ? (member.allowance || 0)
        : (activeWallet.balance || 0);
    }

    const balEl = $('#balance');
    if (balEl) {
      balEl.textContent = displayBalance.toFixed(2);
      if (pulseBalance && previousBalance !== displayBalance) {
        balEl.classList.add('balance-pulse');
        setTimeout(() => balEl.classList.remove('balance-pulse'), 250);
      }
    }

    const curSel = $('#currencySelector');
    if (curSel) {
      curSel.value = activeCur;
      curSel.disabled = isMember;
    }

    const holdEl = $('#hold');
    if (holdEl) holdEl.textContent = 'On hold: ' + (activeWallet.hold || 0).toFixed(2) + ' ' + activeCur;

    const backHeader = $('#btnBackOwner');
    const backInline = $('#btnBackOwnerInline');
    const memberBannerText = $('#memberBannerText');
    const transferBtn = $('#btnTransfer');

    const familyTab = document.querySelector('.tab[data-tab="family"]');
    if (familyTab) {
      familyTab.classList.toggle('hidden', isMember);
    }

    if (isMember) {
      const freeze = memberFreezeStatus(member);
      $('#memberBanner')?.classList.remove('hidden');
      $('#memberLimits')?.classList.remove('hidden');
      const L = member?.limits || {};
      const limitsBody = $('#memberLimitsBody');
      if (limitsBody) {
        limitsBody.innerHTML = `
        <div class="fam-row">
          <span class="chip">PerTx: <b>${L.perTx || 0}</b></span>
          <span class="chip">Daily: <b>${L.daily || 0}</b> used ${L.cToday || 0}</span>
          <span class="chip">Weekly: <b>${L.weekly || 0}</b> used ${L.cWeek || 0}</span>
          <span class="chip">Monthly: <b>${L.monthly || 0}</b> used ${L.cMonth || 0}</span>
        </div>`;
      }

      if (memberBannerText) {
        memberBannerText.textContent =
          `Spending as ${name} – mode: ${member.mode}` +
          (freeze.active ? ' – FROZEN' : '');
      }

      enableButtons(true);
      const btnPay = $('#btnPay');
      if (btnPay) btnPay.disabled = freeze.active;
      if (transferBtn) transferBtn.disabled = true;
      backHeader?.classList.remove('hidden');
      backInline?.classList.remove('hidden');

      const activeTab = document.querySelector('.tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') === 'family') {
        switchTab('dashboard');
      }
    } else {
      $('#memberBanner')?.classList.add('hidden');
      $('#memberLimits')?.classList.add('hidden');
      enableButtons(state.authed);
      if (transferBtn) transferBtn.disabled = !state.authed;
      backHeader?.classList.add('hidden');
      backInline?.classList.add('hidden');
    }

    const familyFormCard = $('#familyFormCard');
    if (familyFormCard) {
      familyFormCard.classList.toggle('hidden', isMember || !state.authed);
    }

        // تحديث Rush Alerts أعلى الداشبورد
    try {
      const snap = getMoneyAISnapshotForReport();
      if (snap) renderRushAlertsBar(snap);
    } catch (e) {
      console.warn('rush alerts error', e);
    }

    hydrateProfileForm();
    updateShellVisibility();

    renderFamily();
    renderHistory();
    hydrateProfileForm();
    updateShellVisibility();
  }

  function backToOwner() {
    state.activeActor = { type: 'owner', memberId: null, origin: null };
    saveProfile();
    render();
    renderInsights();
    if (typeof logInsightSnapshot === 'function') logInsightSnapshot('back_owner');
  }

function renderHistory() {
  const list = $('#historyList'); 
  if (!list) return;

  list.innerHTML = '';
  const actor = state.activeActor;
  const isMember = actor.type === 'member';
  const activeCur = getActiveCurrency();

  let txs = isMember ? state.tx.filter(t => t.actor === actor.memberId) : state.tx;
  txs = txs.filter(t => (t.currency || state.baseCurrency || 'QAR') === activeCur);

  txs.slice(0, 120).forEach(t => {
    const d = document.createElement('div');
    d.className = 'tx-item';

    const actorBadge = t.actor && t.actor !== 'owner'
      ? `<span class="chip">by: ${t.actorName || t.actor}</span>`
      : '';

    const stClass =
      t.status === 'settled' ? 'ok' :
      (t.status === 'pending' ? 'pending' : 'err');

    const cur = t.currency || activeCur;
    const cat = t.category ? ` • ${prettyCategory(t.category)}` : '';

    d.innerHTML = `
      <div class="tx-head">
        <span class="tx-type">
          ${t.type.toUpperCase()} • ${Number(t.amount).toFixed(2)} ${cur}${cat}
        </span>
        <span style="display:flex;gap:6px;align-items:center;">
          ${actorBadge}
          <span class="badge ${stClass}">${t.status}</span>
        </span>
      </div>
      <div class="muted">${new Date(t.ts).toLocaleString()}</div>
      ${t.serialId ? `<div class="muted mono" style="font-size:11px;margin-top:3px;">Serial: ${t.serialId}</div>` : ''}
    `;

    // حدث الضغط لازم يكون داخل الـ forEach
    d.addEventListener('click', () => {
      openTxSerialExplorer(t);
    });

    list.appendChild(d);
  });
}

  function renderFamily() {
    const isMember = state.activeActor.type === 'member';
    const list = $('#familyList'); if (!list) return;

    if (isMember) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = '';
    state.family.forEach(m => {
      const L = m.limits || {};
      const freeze = memberFreezeStatus(m);
      const card = document.createElement('div');
      card.className = 'fam-card';
      card.setAttribute('data-row', m.id);

      let freezeTimelineHtml = '';
      if (m.freezeHistory && m.freezeHistory.length) {
        const rows = m.freezeHistory
          .slice()
          .sort((a, b) => (a.from || a.at || 0) - (b.from || b.at || 0))
          .map(ev => {
            if (ev.kind === 'freeze') {
              const from = new Date(ev.from).toLocaleString();
              const until = ev.until ? new Date(ev.until).toLocaleString() : 'حتى إشعار آخر';
              return `<div>Freeze: ${from} → ${until}</div>`;
            } else {
              const at = new Date(ev.at).toLocaleString();
              return `<div>Unfreeze: ${at}</div>`;
            }
          }).join('');
        freezeTimelineHtml = `
          <div class="fam-row" style="margin-top:6px;flex-direction:column;align-items:flex-start;">
            <span class="muted" style="font-size:11px;">Freeze timeline</span>
            <div class="mono" style="font-size:11px;max-height:90px;overflow:auto;">${rows}</div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="fam-row" style="margin-bottom:6px;">
          <span class="chip">${fullName(m)}</span>
          ${m.phone ? `<span class="chip">${m.phone}</span>` : ''}
          <span class="chip">Mode: ${m.mode}</span>
          <span class="chip">Allowance: ${(m.allowance || 0).toFixed(2)} QAR</span>
          ${freeze.active ? `<span class="chip" style="border-color:#fb7185;color:#fecaca;">Frozen${freeze.text ? ' – ' + freeze.text : ''}</span>` : ''}
        </div>
        <div class="fam-row" style="margin-bottom:6px;">
          <span class="chip">PerTx: ${L.perTx || 0}</span>
          <span class="chip">Daily: ${L.daily || 0} (used ${L.cToday || 0})</span>
          <span class="chip">Weekly: ${L.weekly || 0} (used ${L.cWeek || 0})</span>
          <span class="chip">Monthly: ${L.monthly || 0} (used ${L.cMonth || 0})</span>
        </div>
        <div class="fam-row" style="margin-top:6px;">
          <button class="btn secondary" data-act="memberPay" data-id="${m.id}" ${freeze.active ? 'disabled' : ''}>Pay as ${m.name.first}</button>
          <button class="btn secondary" data-act="freeze" data-id="${m.id}">
            ${freeze.active ? 'Unfreeze' : 'Freeze'}
          </button>
          <button class="btn secondary" data-act="delete" data-id="${m.id}" style="border-color:#fb7185;color:#fecaca;">
            Delete
          </button>
          <button class="btn secondary" data-act="limits" data-id="${m.id}">Update Limits</button>
        </div>
        ${freezeTimelineHtml}
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('button').forEach(b => {
      const id = b.getAttribute('data-id');
      const act = b.getAttribute('data-act');
      if (act === 'memberPay') b.onclick = () => {
        state.activeActor = { type: 'member', memberId: id, origin: 'ownerUI' };
        saveProfile();
        render();
        renderInsights();
        if (typeof logInsightSnapshot === 'function') logInsightSnapshot('switch_member');
      };
      if (act === 'limits') b.onclick = () => openLimitsModal(id);
      if (act === 'freeze') b.onclick = () => openFreezeModal(id);
      if (act === 'delete') b.onclick = () => deleteMember(id);
    });
  }

  function openFreezeModal(memberId) {
    const m = state.family.find(x => x.id === memberId);
    if (!m) return;
    freezingMemberId = memberId;
    const status = memberFreezeStatus(m);

    const titleEl = document.getElementById('freezeMemberName');
    const statusEl = document.getElementById('freezeCurrentStatus');
    const durGroup = document.getElementById('freezeDurationGroup');
    const saveBtn = document.getElementById('btnFreezeSave');
    const unfreezeBtn = document.getElementById('btnFreezeUnfreeze');

    if (titleEl) titleEl.textContent = fullName(m) || m.id;
    if (statusEl) {
      if (status.active) {
        statusEl.textContent = 'الحساب حالياً: مجمّد ' + (status.text ? ('حتى ' + status.text) : '(دائم)');
      } else {
        statusEl.textContent = 'الحساب حالياً: نشط (غير مجمّد)';
      }
    }

    if (status.active) {
      if (durGroup) durGroup.classList.add('hidden');
      if (saveBtn) saveBtn.classList.add('hidden');
      if (unfreezeBtn) unfreezeBtn.classList.remove('hidden');
    } else {
      if (durGroup) durGroup.classList.remove('hidden');
      if (saveBtn) saveBtn.classList.remove('hidden');
      if (unfreezeBtn) unfreezeBtn.classList.add('hidden');
      const sel = document.getElementById('freezeDuration');
      if (sel) sel.value = '1';
    }

    const modal = document.getElementById('freezeModal');
    if (modal) modal.classList.remove('hidden');
  }

  async function applyFreezeFromModal() {
    if (!freezingMemberId) return closeFreezeModal();
    const m = state.family.find(x => x.id === freezingMemberId);
    if (!m) return closeFreezeModal();
    const sel = document.getElementById('freezeDuration');
    if (!sel) return closeFreezeModal();
    const v = sel.value;
    let days = null;
    if (v === '1') days = 1;
    else if (v === '2') days = 2;
    else if (v === '7') days = 7;
    else if (v === '14') days = 14;
    else if (v === 'permanent') days = null;

    const from = Date.now();
    const until = days ? from + days * 86400000 : null;

    m.frozen = true;
    m.frozenUntil = until;
    if (!m.freezeHistory) m.freezeHistory = [];
    m.freezeHistory.push({ kind: 'freeze', from, until });

    await upsertMember(m);
    msg('تم تجميد حساب: ' + fullName(m));
    closeFreezeModal();
    renderFamily();
    if (state.activeActor.type === 'member' && state.activeActor.memberId === m.id) {
      render();
    }
  }

  async function unfreezeFromModal() {
    if (!freezingMemberId) return closeFreezeModal();
    const m = state.family.find(x => x.id === freezingMemberId);
    if (!m) return closeFreezeModal();
    m.frozen = false;
    m.frozenUntil = null;
    if (!m.freezeHistory) m.freezeHistory = [];
    m.freezeHistory.push({ kind: 'unfreeze', at: Date.now() });
    await upsertMember(m);
    msg('تم فك تجميد حساب: ' + fullName(m));
    closeFreezeModal();
    renderFamily();
    if (state.activeActor.type === 'member' && state.activeActor.memberId === m.id) {
      render();
    }
  }

function openTxSerialExplorer(tx) {
  const modal = document.getElementById('serialExplorerModal');
  const body = document.getElementById('serialExplorerBody');
  if (!modal || !body) return;

  const cur = tx.currency || state.baseCurrency || 'QAR';
  const amount = Number(tx.amount || 0).toFixed(2);
  const when = tx.ts ? new Date(tx.ts).toLocaleString() : '—';
  const actor = tx.actor && tx.actor !== 'owner'
    ? (tx.actorName || tx.actor)
    : 'Owner';

  // تقدير اتجاه الحركة
  const type = (tx.type || '').toLowerCase();
  let direction = 'neutral';
  if (['deposit', 'fx_in'].includes(type)) direction = 'in';
  if (['withdraw', 'merchant', 'member_purchase', 'fx_out'].includes(type)) direction = 'out';

  let dirLabel = 'Neutral';
  let dirColor = '#64748b';
  if (direction === 'in') { dirLabel = 'Inflow'; dirColor = '#22c55e'; }
  if (direction === 'out') { dirLabel = 'Outflow'; dirColor = '#f97373'; }

  const status = tx.status || 'settled';
  let stClass = 'ok';
  if (status === 'pending') stClass = 'pending';
  if (status === 'failed' || status === 'rejected') stClass = 'err';

  const catLabel = tx.category ? prettyCategory(tx.category) : 'General / عام';

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div>
        <div class="muted" style="font-size:11px;">Serial Twin Detail</div>
        <div style="font-weight:600;font-size:14px;">${type.toUpperCase()} • ${catLabel}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <span class="badge ${stClass}">${status}</span>
        <span class="chip" style="border-color:${dirColor};color:${dirColor};">${dirLabel}</span>
      </div>
    </div>

    <div style="margin-bottom:10px;padding:8px;border-radius:10px;background:#020617;">
      <div class="muted" style="font-size:11px;">Amount</div>
      <div style="font-size:20px;font-weight:700;">
        ${amount} ${cur}
      </div>
      <div class="muted" style="font-size:11px;margin-top:2px;">
        ${when}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12px;margin-bottom:10px;">
      <div>
        <div class="muted" style="font-size:11px;">Actor</div>
        <div>${actor}</div>
      </div>
      <div>
        <div class="muted" style="font-size:11px;">Ref</div>
        <div>${tx.ref || '—'}</div>
      </div>
      <div>
        <div class="muted" style="font-size:11px;">Currency</div>
        <div>${cur}</div>
      </div>
      <div>
        <div class="muted" style="font-size:11px;">Tx ID (local)</div>
        <div class="mono" style="font-size:11px;word-break:break-all;">${tx.id || '—'}</div>
      </div>
    </div>

    <div style="margin-bottom:8px;">
      <div class="muted" style="font-size:11px;margin-bottom:4px;">Serial ID</div>
      <div class="mono" style="font-size:12px;padding:6px 8px;border-radius:8px;background:#020617;word-break:break-all;">
        ${tx.serialId || '—'}
      </div>
    </div>

    <div style="margin-bottom:12px;">
      <div class="muted" style="font-size:11px;margin-bottom:4px;">Block Hash</div>
      <div class="mono" style="font-size:12px;padding:6px 8px;border-radius:8px;background:#020617;word-break:break-all;">
        ${tx.blockHash || '—'}
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      <button class="btn secondary" type="button" data-act="copy-serial" ${tx.serialId ? '' : 'disabled'}>
        Copy Serial ID
      </button>
      <button class="btn secondary" type="button" data-act="ask-ai">
        Ask Money AI about this
      </button>
      <button class="btn" type="button" data-act="close-serial-modal">
        Close
      </button>
    </div>
  `;

  modal.classList.remove('hidden');

  // 🧩 ربط الأزرار
  const copyBtn = body.querySelector('[data-act="copy-serial"]');
  if (copyBtn && tx.serialId) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(tx.serialId);
        msg('Serial ID copied.');
      } catch {
        msg('Could not copy, copy manually.');
      }
    });
  }

  const askBtn = body.querySelector('[data-act="ask-ai"]');
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      // فتح تبويب Money AI Chat مع سؤال جاهز عن هذه العملية
      state.insightsMode = 'chat';
      renderInsights('chat');
      const chatInput = document.querySelector('#chatInput');
      if (chatInput) {
        chatInput.value =
          `Money AI، فسّر لي هذه العملية:\n` +
          `النوع: ${type.toUpperCase()}، المبلغ: ${amount} ${cur}، ` +
          `التصنيف: ${catLabel}، الاتجاه: ${dirLabel}، التاريخ: ${when}.\n` +
          `هل هذا السلوك صحي؟ وما النصيحة لتحويله من Rush إلى Rich؟`;
        chatInput.focus();
      }
      modal.classList.add('hidden');
    });
  }

  const closeBtn = body.querySelector('[data-act="close-serial-modal"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
}
  

  function closeFreezeModal() {
    freezingMemberId = null;
    const modal = document.getElementById('freezeModal');
    if (modal) modal.classList.add('hidden');
  }

  async function deleteMember(id) {
    const idx = state.family.findIndex(f => f.id === id);
    if (idx === -1) return;
    const m = state.family[idx];
    const ok = confirm('هل أنت متأكد من حذف العضو نهائياً؟\n' + fullName(m));
    if (!ok) return;
    state.family.splice(idx, 1);
    await idb.remove('family', id);
    if (state.activeActor.type === 'member' && state.activeActor.memberId === id) {
      state.activeActor = { type: 'owner', memberId: null, origin: null };
      await saveProfile();
    }
    msg('تم حذف العضو: ' + fullName(m));
    render();
  }

  function openLimitsModal(memberId) {
    const m = state.family.find(x => x.id === memberId);
    if (!m) return;
    editingMemberId = memberId;
    const L = m.limits || newLimitState();
    $('#limitPerTx').value = L.perTx || 0;
    $('#limitDaily').value = L.daily || 0;
    $('#limitWeekly').value = L.weekly || 0;
    $('#limitMonthly').value = L.monthly || 0;
    $('#limitsModal')?.classList.remove('hidden');
  }

  async function saveLimitsFromModal() {
    if (!editingMemberId) return closeLimitsModal();
    const m = state.family.find(x => x.id === editingMemberId);
    if (!m) return closeLimitsModal();
    const perTx = Number($('#limitPerTx').value || '0');
    const daily = Number($('#limitDaily').value || '0');
    const weekly = Number($('#limitWeekly').value || '0');
    const monthly = Number($('#limitMonthly').value || '0');
    if (!m.limits) m.limits = newLimitState();
    m.limits.perTx = perTx;
    m.limits.daily = daily;
    m.limits.weekly = weekly;
    m.limits.monthly = monthly;
    await upsertMember(m);
    msg('Updated limits for ' + fullName(m));
    closeLimitsModal();
    renderFamily();
    if (state.activeActor.type === 'member' && state.activeActor.memberId === m.id) {
      render();
    }
  }

  function closeLimitsModal() {
    editingMemberId = null;
    $('#limitsModal')?.classList.add('hidden');
  }

  function hydrateProfileForm() {
    if (!state.user) return;
    const u = state.user; const n = u.name || {};
    const f = $('#profFirst'); if (f) f.value = n.first || '';
    const m = $('#profMiddle'); if (m) m.value = n.middle || '';
    const l = $('#profLast'); if (l) l.value = n.last || '';
    const e = $('#profEmail'); if (e) e.value = u.email || '';
    const p = $('#profPhone'); if (p) p.value = u.phone || '';
    const pin = $('#profPin'); if (pin) pin.value = u.pin || '';
  }

  async function submitProfileForm(e) {
    e.preventDefault();
    if (!state.user?.id) return msg('Create account first.');
    const first = $('#profFirst').value.trim();
    const middle = $('#profMiddle').value.trim();
    const last = $('#profLast').value.trim();
    const email = $('#profEmail').value.trim();
    const phone = $('#profPhone').value.trim();
    const pin = $('#profPin').value.trim();

    if (!first || !last) return msg('First & family names are required.');
    if (!validateEmail(email)) return msg('Invalid email format.');
    if (!validateQatarPhone(phone)) return msg('Invalid Qatari phone.');
    if (pin && !/^\d{4}$/.test(pin)) return msg('PIN must be 4 digits.');

    state.user.name = { first, middle, last };
    state.user.email = email;
    state.user.phone = phone;
    state.user.pin = pin || null;
    await saveProfile();
    render();
    msg('Profile updated.');
  }

  function toBaseQar(amount, currency) {
    const base = state.baseCurrency || 'QAR';
    const amt = Number(amount || 0);
    if (!amt) return 0;
    const ccy = currency || base;
    if (ccy === base && base === 'QAR') return amt;
    if (base !== 'QAR') return amt;

    try {
      if (!toBaseQar._fxIndex && typeof fxData !== 'undefined') {
        const idx = {};
        fxData.forEach(d => { idx[d.ccy] = d.rate; });
        toBaseQar._fxIndex = idx;
      }
      const rate = toBaseQar._fxIndex ? toBaseQar._fxIndex[ccy] : null;
      if (!rate || rate <= 0) return amt;
      return amt * rate;
    } catch {
      return amt;
    }
  }

  function toDisplayAmount(amountQar) {
    const base = state.baseCurrency || 'QAR';
    const display = state.globalDisplayCurrency || base;
    const amt = Number(amountQar || 0);
    if (!amt) return 0;
    if (display === 'QAR' || display === base) return amt;
    if (base !== 'QAR') return amt;

    try {
      if (!toDisplayAmount._fxIndex && typeof fxData !== 'undefined') {
        const idx = {};
        fxData.forEach(d => { idx[d.ccy] = d.rate; });
        toDisplayAmount._fxIndex = idx;
      }
      const rate = toDisplayAmount._fxIndex ? toDisplayAmount._fxIndex[display] : null;
      if (!rate || rate <= 0) return amt;
      return amt / rate;
    } catch {
      return amt;
    }
  }
