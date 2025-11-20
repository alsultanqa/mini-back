/* MiniBank – Money AI & extended features (split from original minibank.js) */

// ===========================
// Money AI – Financial Behavior Engine (FBE)
// ===========================
function computeBehaviorEngine(params) {
  const {
    baseCur,
    txsAll,
    last30,
    last7,
    totalIncome30Base,
    totalOut30Base,
    totalOut7Base,
    net30,
    dailySpend,
    dailySpend7,
    runwayDays,
    currentBalanceBase,
    categoriesDisplay
  } = params;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v || 0));

  const sumBase = (arr) =>
    arr.reduce(
      (acc, t) => acc + toBaseQar(t.amount || 0, t.currency || baseCur),
      0
    );

  const lowerType = (t) => String(t.type || '').toLowerCase();

  // ---------- A) Cashflow Quality Index (CQI) ----------
  const incomeAll = txsAll.filter((t) => lowerType(t) === 'deposit');
  const outAll = txsAll.filter((t) =>
    ['withdraw', 'merchant', 'member_purchase', 'fx_out', 'member_fund'].includes(
      lowerType(t)
    )
  );

  const incomeVolBase = totalIncome30Base || sumBase(incomeAll);
  const outVolBase = totalOut30Base || sumBase(outAll);

  let cqi = 50;
  if (incomeVolBase <= 0 && outVolBase > 0) {
    cqi = 20;
  } else if (incomeVolBase <= 0 && outVolBase <= 0) {
    cqi = 50;
  } else {
    const ratio = incomeVolBase / (outVolBase || 1);
    if (ratio >= 1.4) cqi = 90;
    else if (ratio >= 1.2) cqi = 80;
    else if (ratio >= 1.0) cqi = 65;
    else if (ratio >= 0.7) cqi = 45;
    else cqi = 25;
  }
  cqi = clamp(cqi, 0, 100);

  // ---------- B) Consumption Pattern Stability (CPS) ----------
  const spendTx30 = last30.filter((t) =>
    ['withdraw', 'merchant', 'member_purchase', 'fx_out', 'member_fund'].includes(
      lowerType(t)
    )
  );
  const daysMap = new Map();
  spendTx30.forEach((t) => {
    const d = startOfDay(t.ts || Date.now());
    const prev = daysMap.get(d) || 0;
    daysMap.set(d, prev + toBaseQar(t.amount || 0, t.currency || baseCur));
  });

  let cps = 50;
  if (daysMap.size === 0) {
    cps = 60;
  } else {
    const vals = Array.from(daysMap.values());
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    if (mean <= 0) {
      cps = 60;
    } else {
      const variance =
        vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length;
      const std = Math.sqrt(variance);
      const cv = std / mean; // coefficient of variation

      if (cv > 1.2) cps = 30;          // صرف متقلب جداً
      else if (cv > 0.7) cps = 50;     // تذبذب متوسط
      else if (cv > 0.3) cps = 75;     // مستقر نسبياً
      else cps = 90;                   // ثابت جداً
    }
  }
  cps = clamp(cps, 0, 100);

  // ---------- C) Burn Velocity (BV) ----------
  let bv = 50;
  if (currentBalanceBase <= 0 && outVolBase > 0) {
    bv = 20;
  } else if (outVolBase <= 0) {
    bv = 70;
  } else {
    const burnRatio = outVolBase / (currentBalanceBase + 1);
    if (burnRatio > 1.5) bv = 20;          // يحرق أكثر من رصيده تقريباً
    else if (burnRatio > 1.0) bv = 35;
    else if (burnRatio > 0.5) bv = 60;
    else if (burnRatio > 0.2) bv = 80;
    else bv = 92;                          // حرق بطيء جداً
  }
  bv = clamp(bv, 0, 100);

  // ---------- D) Spending Maturity Score (SMS) ----------
  const catTotalsBase = {};
  spendTx30.forEach((t) => {
    const cat = t.category || 'general';
    catTotalsBase[cat] =
      (catTotalsBase[cat] || 0) +
      toBaseQar(t.amount || 0, t.currency || baseCur);
  });
  const totalSpendBase = Object.values(catTotalsBase).reduce(
    (a, v) => a + v,
    0
  );

  let sms = 50;
  if (totalSpendBase <= 0) {
    sms = 60;
  } else {
    const essentialCats = ['food', 'transport', 'bills', 'health', 'education'];
    const comfortCats = ['shopping', 'travel', 'entertainment'];
    let essential = 0,
      comfort = 0,
      waste = 0;

    Object.entries(catTotalsBase).forEach(([code, v]) => {
      if (essentialCats.includes(code)) essential += v;
      else if (comfortCats.includes(code)) comfort += v;
      else waste += v;
    });

    const eShare = essential / totalSpendBase;
    const wShare = waste / totalSpendBase;

    if (eShare >= 0.6 && wShare <= 0.1) sms = 90;       // ناضج جداً
    else if (eShare >= 0.5 && wShare <= 0.2) sms = 75;  // جيد
    else if (eShare >= 0.4 && wShare <= 0.3) sms = 60;  // متوسط
    else sms = 40;                                      // صرف موجه للكماليات/الهدر
  }
  sms = clamp(sms, 0, 100);

  // ---------- E) Savings Discipline Index (SDI) ----------
  let sdi = 50;
  if (net30 <= 0) {
    sdi = 30;
  } else {
    const goals = Array.isArray(state.goals) ? state.goals : [];
    const totalSavedGoals = goals.reduce(
      (a, g) => a + Number(g.savedAmount || 0),
      0
    );
    const netDisplay = net30; // net30 already in display currency

    if (!goals.length) {
      sdi = netDisplay > 0 ? 60 : 45;
    } else {
      const targetSaved = netDisplay > 0 ? netDisplay * 0.5 : 0;
      if (totalSavedGoals >= targetSaved && targetSaved > 0) sdi = 88;
      else if (totalSavedGoals > 0) sdi = 72;
      else sdi = 58;
    }
  }
  sdi = clamp(sdi, 0, 100);

  // ---------- F) Financial Shock Resistance (FSR) ----------
  let fsr = 50;
  if (runwayDays == null || runwayDays <= 0) {
    fsr = 30;
  } else if (runwayDays < 15) {
    fsr = 30;
  } else if (runwayDays < 30) {
    fsr = 45;
  } else if (runwayDays < 60) {
    fsr = 60;
  } else if (runwayDays < 120) {
    fsr = 80;
  } else {
    fsr = 95;
  }
  fsr = clamp(fsr, 0, 100);

  // ---------- Overall Behavior Score ----------
  let behaviorScore =
    cqi * 0.22 +
    cps * 0.16 +
    bv * 0.18 +
    sms * 0.16 +
    sdi * 0.14 +
    fsr * 0.14;

  behaviorScore = clamp(behaviorScore, 0, 100);

  // ---------- Behavior Style + Week Type ----------
  let behaviorStyle = 'Drifter';
  if (behaviorScore < 35) behaviorStyle = 'Rusher';
  else if (behaviorScore < 55) behaviorStyle = 'Drifter';
  else if (behaviorScore < 75) behaviorStyle = 'Planner';
  else behaviorStyle = 'Builder';

  let weekType = 'normal';
  let weekSummary = 'أسبوع طبيعي بدون نمط متطرف في الصرف أو الدخل.';

  const refSpendPerDay30 = totalOut30Base > 0 ? totalOut30Base / 30 : 0;
  const refSpendPerDay7 = totalOut7Base > 0 ? totalOut7Base / 7 : 0;
  const spendFactor =
    refSpendPerDay30 > 0 ? refSpendPerDay7 / refSpendPerDay30 : 1;

  if (totalOut30Base <= 0 && totalOut7Base > 0) {
    weekType = 'reentry';
    weekSummary = 'هذا الأسبوع هو أول أسبوع صرف حقيقي بعد فترة هدوء طويلة – راقب نمطك من البداية.';
  } else if (spendFactor > 1.4 && net30 < 0) {
    weekType = 'overspending';
    weekSummary =
      'أسبوع صرف أعلى من المعتاد مع صافي تدفق سلبي – يفضّل تهدئة المصاريف فوراً والتركيز على الضروريات.';
  } else if (spendFactor < 0.6 && net30 >= 0) {
    weekType = 'light';
    weekSummary =
      'أسبوع صرف خفيف وصافي تدفق إيجابي – فرصة ممتازة لزيادة الادخار أو دفع جزء من الديون.';
  } else if (net30 > 0 && dailySpend7 < dailySpend) {
    weekType = 'improving';
    weekSummary =
      'هذا الأسبوع أفضل من المتوسط – صرف أقل وصافي أعلى، استمر على نفس النمط.';
  }

  // ---------- Score narrative + reasons ----------
  const reasons = [];

  if (cqi < 40)
    reasons.push('جودة التدفق المالي ضعيفة – حجم الصرف أعلى من حجم الدخل خلال الفترة الأخيرة.');
  else if (cqi > 75)
    reasons.push('التدفق المالي صحي – الدخل يغطي الصرف مع وجود هامش أمان.');

  if (cps < 45)
    reasons.push('الصرف اليومي متقلب جداً بين أيام عالية وأيام شبه صفرية – يفضّل تنعيم النمط.');
  else if (cps > 75)
    reasons.push('نمط الصرف مستقر نسبياً، وهذا يساعد Money AI على توقع وضعك بدقة.');

  if (bv < 40)
    reasons.push('سرعة حرق الرصيد مرتفعة مقارنة بحجمه – أي صدمة بسيطة قد تؤثر مباشرة على الأمان المالي.');
  else if (bv > 75)
    reasons.push('سرعة الحرق منخفضة – الرصيد ينخفض ببطء مع هذا النمط من الصرف.');

  if (sms < 50)
    reasons.push('نسبة ملحوظة من الصرف موجهة للكماليات/الهدر مقارنة بالأساسيات.');
  else if (sms > 75)
    reasons.push('معظم الصرف موجه للأساسيات مع تحكم جيد في الكماليات.');

  if (sdi < 45)
    reasons.push('الادخار غير منتظم أو شبه غائب رغم وجود بعض الدخل.');
  else if (sdi > 75)
    reasons.push('هناك انضباط واضح في الادخار وبناء الأهداف المالية.');

  if (fsr < 45)
    reasons.push('قدرة ضعيفة على امتصاص الصدمات (runway قصير).');
  else if (fsr > 75)
    reasons.push('مستوى جيد من مقاومة الصدمات بفضل runway مريح.');

  if (!reasons.length) {
    reasons.push('لا توجد بيانات كافية بعد، أو النمط متوازن بدون نقاط قوية أو ضعيفة واضحة.');
  }

  let behaviorLabel = 'Transition Zone';
  let behaviorNarrative =
    'سلوك هذه المحفظة في منطقة انتقالية بين "Rush" و "Rich".';

  if (behaviorScore < 30) {
    behaviorLabel = 'Rush Zone';
    behaviorNarrative =
      'البيانات تشير إلى نمط "Rush" واضح – حرق رصيد سريع، ادخار ضعيف، وحساسية عالية لأي صدمة مالية.';
  } else if (behaviorScore < 60) {
    behaviorLabel = 'Transition Zone';
    behaviorNarrative =
      'سلوك في المنطقة الرمادية – ليس كارثياً لكنه غير كافٍ لبناء ثروة أو أمان حقيقي.';
  } else if (behaviorScore < 85) {
    behaviorLabel = 'Stable Builder';
    behaviorNarrative =
      'سلوك مستقر يميل إلى بناء ثروة مع تحكم جيد في الصرف ونوع من الانضباط في الادخار.';
  } else {
    behaviorLabel = 'Rich Mindset';
    behaviorNarrative =
      'محفظة تعمل بعقلية "Rich" – تدفق مالي صحي، ادخار واضح، وقدرة عالية على تحمل الصدمات.';
  }

  return {
    behaviorScore: Math.round(behaviorScore),
    behaviorLabel,
    behaviorNarrative,
    behaviorStyle,
    weekType,
    weekSummary,
    scoreReasons: reasons,
    indices: {
      cqi,
      cps,
      bv,
      sms,
      sdi,
      fsr
    }
  };
}


  // ===========================
  // Money AI Snapshot (Owner vs Member aware)
  // ===========================
  function getMoneyAISnapshotForReport() {
    if (!state.authed) return null;

    const actor = state.activeActor || { type: 'owner', memberId: null };
    const isMember = actor.type === 'member';
    const member = isMember ? state.family.find(m => m.id === actor.memberId) : null;

    const now = Date.now();
    const day30Ago = now - 30 * 86400000;
    const day7Ago = now - 7 * 86400000;
    const baseCur = state.baseCurrency || 'QAR';
    const displayCur = state.globalDisplayCurrency || baseCur;

    const txsRaw = isMember
      ? state.tx.filter(t => t.actor === actor.memberId)
      : state.tx;

    const txs = txsRaw.filter(t => t.status === 'settled');
    const last30 = txs.filter(t => t.ts >= day30Ago);
    const last7 = txs.filter(t => t.ts >= day7Ago);

    const sumBase = arr => arr.reduce((a, t) => a + toBaseQar(t.amount, t.currency || baseCur), 0);

    const totalAllBase = sumBase(txs);
    const total30Base = sumBase(last30);
    const total7Base = sumBase(last7);
    const countAll = txs.length;

    const totalAll = toDisplayAmount(totalAllBase);
    const total30 = toDisplayAmount(total30Base);
    const total7 = toDisplayAmount(total7Base);
    const avgTicket = countAll ? (totalAll / countAll) : 0;

    const income30 = last30.filter(t => t.type === 'deposit');
    const out30 = last30.filter(t => {
      const tt = String(t.type || '').toLowerCase();
      return tt === 'withdraw'
        || tt === 'merchant'
        || tt === 'member_purchase'
        || tt === 'fx_out'
        || tt === 'member_fund';
    });

    // 👇 جديد: نفس الفلتر لكن على آخر 7 أيام فقط
    const out7 = last7.filter(t => {
      const tt = String(t.type || '').toLowerCase();
      return tt === 'withdraw'
        || tt === 'merchant'
        || tt === 'member_purchase'
        || tt === 'fx_out'
        || tt === 'member_fund';
    });

    const totalIncome30Base = sumBase(income30);
    const totalOut30Base = sumBase(out30);
    const totalOut7Base = sumBase(out7); // 👈 جديد

    const totalIncome30 = toDisplayAmount(totalIncome30Base);
    const totalOut30 = toDisplayAmount(totalOut30Base);
    const totalOut7 = toDisplayAmount(totalOut7Base); // 👈 جديد
    const net30 = totalIncome30 - totalOut30;

    const daysWindow = 30;
    const dailySpend = totalOut30 > 0 ? (totalOut30 / daysWindow) : 0;
    const dailySpend7 = totalOut7 > 0 ? (totalOut7 / 7) : 0; // 👈 جديد

    // رصيد حالي:
    let currentBalanceBase = 0;
    if (isMember && member) {
      const memberBalBase = toBaseQar(member.allowance || 0, baseCur);
      currentBalanceBase = memberBalBase;
    } else {
      if (state.wallets) {
        Object.entries(state.wallets).forEach(([ccy, w]) => {
          const bal = Number(w.balance || 0);
          if (!bal) return;
          currentBalanceBase += toBaseQar(bal, ccy);
        });
      }
    }
    const currentBalance = toDisplayAmount(currentBalanceBase);
    const runwayDays = dailySpend > 0 ? currentBalance / dailySpend : null;

    // التعرض بين العملات
    const exposures = [];
    if (isMember && member) {
      if (currentBalanceBase > 0) {
        const eqBase = currentBalanceBase;
        const eqDisplay = toDisplayAmount(eqBase);
        exposures.push({
          ccy: baseCur,
          pct: 100,
          eqBase,
          eqDisplay
        });
      }
    } else if (state.wallets && currentBalanceBase > 0) {
      Object.entries(state.wallets).forEach(([ccy, w]) => {
        const bal = Number(w.balance || 0);
        if (!bal) return;
        const eqBase = toBaseQar(bal, ccy);
        const pct = (eqBase / currentBalanceBase) * 100;
        const eqDisplay = toDisplayAmount(eqBase);
        exposures.push({ ccy, pct, eqBase, eqDisplay });
      });
      exposures.sort((a, b) => b.pct - a.pct);
    }

// فئات الصرف
const spendTxs30 = last30.filter(t => {
  const tt = String(t.type || '').toLowerCase();
  return tt === 'merchant' || tt === 'member_purchase';
});

const byCatBase = {};
spendTxs30.forEach(t => {
  const cat = t.category || 'general';
  byCatBase[cat] =
    (byCatBase[cat] || 0) + toBaseQar(t.amount, t.currency || baseCur);
});

// إجمالي الصرف (معروض) لاستخدامه في النسبة %
const totalSpendCatDisplay = Object.values(byCatBase).reduce(
  (a, vBase) => a + toDisplayAmount(vBase),
  0
);

const categoriesDisplay = Object.entries(byCatBase)
  .map(([code, vBase]) => {
    const amountDisplay = toDisplayAmount(vBase);
    const share =
      totalSpendCatDisplay > 0
        ? (amountDisplay / totalSpendCatDisplay) * 100
        : 0;

    return {
      code,                              // الكود الخام
      amount: amountDisplay,            // نفس الحقل الذي يستخدمه MiniBank Chat
      // الحقول القديمة المتوقعة من money-ai-chat.html:
      label: prettyCategory(code),      // اسم مقروء للفئة
      total: amountDisplay,             // المجموع في هذه الفئة
      share                             // نسبة من إجمالي الصرف (%)
    };
  })
  .sort((a, b) => b.amount - a.amount);

    const cashbackRate = 0.01;
    const eligibleSpend30Base = sumBase(spendTxs30);
    const cashback30 = toDisplayAmount(eligibleSpend30Base) * cashbackRate;

    // Score & Behavior – يستخدم Financial Behavior Engine الجديد
    const behavior = computeBehaviorEngine({
      baseCur,
      txsAll: txs,
      last30,
      last7,
      totalIncome30Base,
      totalOut30Base,
      totalOut7Base,
      net30,
      dailySpend,
      dailySpend7,
      runwayDays,
      currentBalanceBase,
      categoriesDisplay
    });

    const score = behavior.behaviorScore;
    const scoreLabel = behavior.behaviorLabel;
    const scoreNarrative = behavior.behaviorNarrative;
    const scoreReasons = behavior.scoreReasons;

    return {
      baseCur,
      displayCur,
      label: displayCur,
      totalAll,
      total30,
      total7,
      countAll,
      avgTicket,
      totalIncome30,
      totalOut30,
      totalOut7,
      net30,
      dailySpend,
      dailySpend7,
      runwayDays,
      exposures,
      score,
      scoreLabel,
      behaviorLabel: scoreLabel,     // ✅ هذا السطر الجديد
      scoreNarrative,
      scoreReasons,
      categoriesDisplay,
      cashbackRate,
      cashback30,
      currentBalance,
      isMember,
      // Money AI behavior extras
      behaviorStyle: behavior.behaviorStyle,
      weekType: behavior.weekType,
      weekSummary: behavior.weekSummary,
      behaviorIndices: behavior.indices
    };
  }


  // ===========================
  // Dashboard KPIs (Wallet strip powered by Money AI snapshot)
  // ===========================
  function updateDashboardKpisFromSnapshot() {
    const row = document.getElementById('walletKpiRow');
    if (!row) return;
    if (!state || !state.authed) {
      row.classList.add('kpi-row--hidden');
      return;
    }

    if (typeof getMoneyAISnapshotForReport !== 'function') return;
    const snap = getMoneyAISnapshotForReport();
    if (!snap) {
      row.classList.add('kpi-row--hidden');
      return;
    }

    row.classList.remove('kpi-row--hidden');

    const cur =
      snap.label ||
      snap.displayCur ||
      state.globalDisplayCurrency ||
      state.baseCurrency ||
      'QAR';

    const fmt = (n) => Number(n || 0).toFixed(2);

    const inEl = document.getElementById('kpiIn30');
    if (inEl) inEl.textContent = fmt(snap.totalIncome30) + ' ' + cur;

    const outEl = document.getElementById('kpiOut30');
    if (outEl) outEl.textContent = fmt(snap.totalOut30) + ' ' + cur;

    const netEl = document.getElementById('kpiNet30');
    if (netEl) {
      const net = Number(snap.net30 || 0);
      const sign = net > 0 ? '+' : '';
      netEl.textContent = sign + fmt(net) + ' ' + cur;
      netEl.classList.toggle('kpi-positive', net > 0);
      netEl.classList.toggle('kpi-negative', net < 0);
    }

    const runwayEl = document.getElementById('kpiRunway');
    if (runwayEl) {
      const rw = Number(snap.runwayDays || 0);
      let label;
      if (!isFinite(rw) || rw > 365) {
        label = 'Safe · > 1y';
      } else if (rw <= 0) {
        label = '⚠ Under pressure';
      } else if (rw < 30) {
        label = 'Tight · ' + Math.round(rw) + ' days';
      } else if (rw < 90) {
        label = 'OK · ' + Math.round(rw) + ' days';
      } else {
        label = 'Comfort · ' + Math.round(rw) + ' days';
      }
      runwayEl.textContent = label;
    }
  }
  window.updateDashboardKpisFromSnapshot = updateDashboardKpisFromSnapshot;



  // ===========================
  // Money AI Coach – خطة أسبوعية
  // ===========================
  function getMoneyAICoachPlan(snap) {
    const {
      isMember,
      net30,
      runwayDays,
      categoriesDisplay,
      total30,
      totalIncome30,
      totalOut30,
      score,
      label
    } = snap;

    const tasks = [];
    const fmt = n => Number(n || 0).toFixed(2);
    const topCat = categoriesDisplay[0] || null;

    if (!total30 && !totalIncome30 && !totalOut30) {
      tasks.push({
        title: 'ابدأ ببناء تاريخ بيانات',
        desc: 'استخدم هذه المحفظة لعدة أيام في المصاريف والتمويل، ثم ارجع إلى Money AI Coach ليتمكن من بناء خطة دقيقة لك.',
        impactScore: '+0–5',
        impactRunway: 'غير محدد بعد',
        tag: 'Foundation'
      });
      return { tasks, isMember, label };
    }

    if (isMember) {
      if (topCat && topCat.amount > 0) {
        const shrink = topCat.amount * 0.2;
        tasks.push({
          title: 'خفّف 20% من الصرف في ' + prettyCategory(topCat.code),
          desc: `خلال هذا الأسبوع، حاول تقليل صرفك في فئة "${prettyCategory(topCat.code)}" بمقدار ${fmt(shrink)} ${label}. ابدأ باستبدال بعض الكماليات بخيارات أرخص أو تجنّب الطلبات المتكررة.`,
          impactScore: '+5 تقريباً على محفظتك',
          impactRunway: '+3–7 أيام لمحفظتك الصغيرة',
          tag: 'Discipline'
        });
      }

      if (runwayDays != null && runwayDays < 30) {
        tasks.push({
          title: 'أوقف عملية واحدة غير ضرورية',
          desc: 'اختر نوع شراء واحد (مثل حلويات أو قهوة خارجية) وتوقف عنه بالكامل هذا الأسبوع. Money AI سيعكس الأثر مباشرة على run-way الخاص بك.',
          impactScore: '+3–6 نقاط',
          impactRunway: '+2–5 أيام',
          tag: 'Rush → Rich'
        });
      }

      tasks.push({
        title: 'ثبّت “قانون واحد” للعضو هذا الأسبوع',
        desc: 'اختر قاعدة بسيطة لنفسك مثل: "لا أشتري مرتين في اليوم من نفس الفئة" أو "لا أستخدم كامل الـ allowance في أول 3 أيام".',
        impactScore: '+2–4 نقاط',
        impactRunway: 'تحسن تدريجي',
        tag: 'Habits'
      });

      return { tasks, isMember, label };
    }

    // Owner (Global)
    if (net30 < 0) {
      tasks.push({
        title: 'قفل 30% من الكماليات لهذا الأسبوع',
        desc: 'حدد أعلى فئة غير ضرورية في مصاريفك (مثل ترفيه، أكل خارج البيت) وقلّلها بنسبة 30% هذا الأسبوع. الهدف أن يتحوّل صافي التدفق من سلبي إلى صفر أو إيجابي بسيط.',
        impactScore: '+8–15 نقاط على Rush vs Rich',
        impactRunway: '+10–20 يوم على المدى المتوسط',
        tag: 'Rush Cut'
      });
    } else if (net30 > 0 && score < 85) {
      tasks.push({
        title: 'ثبّت نسبة ادخار من الصافي الإيجابي',
        desc: `اختر نسبة ثابتة (مثلاً 20%) من صافي الدخل الإيجابي الحالي (${fmt(net30)} ${label} تقريباً) وضعها أسبوعياً في هدف ادخار معين (احتياطي، استثمار بسيط).`,
        impactScore: '+5–10 نقاط',
        impactRunway: '+15–30 يوم عند الاستمرارية',
        tag: 'Rich Builder'
      });
    }

    if (runwayDays != null && runwayDays < 60) {
      tasks.push({
        title: 'ارفع الـ runway إلى 60 يوم',
        desc: 'الهدف هذا الأسبوع أن تزيد رصيدك أو تقلل مصاريفك بحيث يتحرك الـ runway خطوة نحو 60 يوم. راقب التقدم داخل Insights بعد كل عملية مهمة.',
        impactScore: '+5 نقاط مستهدفة',
        impactRunway: 'الاقتراب من عتبة 60 يوم',
        tag: 'Safety'
      });
    }

    if (categoriesDisplay.length > 0) {
      const top = categoriesDisplay[0];
      tasks.push({
        title: 'قاعدة سقف أسبوعي لأعلى فئة',
        desc: `ضع سقف أسبوعي لفئة "${prettyCategory(top.code)}" لا يتجاوز 80% من متوسطك الحالي. أي صرف أعلى من السقف يؤجل للأسبوع التالي.`,
        impactScore: '+4–7 نقاط',
        impactRunway: '+5–10 أيام خلال شهرين',
        tag: 'Limits'
      });
    }

    if (tasks.length === 0) {
      tasks.push({
        title: 'استمر بنفس السلوك لكن أضف هدفاً واحداً',
        desc: 'طالما مؤشراتك جيدة، اجعل هذا الأسبوع مخصصاً لوضع هدف واحد جديد (استثمار، سداد دين، ادخار لفرصة معينة) واربطه بنسبة ثابتة من دخلك.',
        impactScore: '+3–6 نقاط',
        impactRunway: 'تحسن مستمر',
        tag: 'Focus'
      });
    }

    return { tasks, isMember, label };
  }

  // ===========================
  // Insights Renderer (with Coach + Deep Rush/Rich)
  // ===========================
  function renderInsights(modeOverride) {
    const container = $('#insightsBody'); 
    if (!container) return;

    container.innerHTML = '';
    if (!state.authed) {
      container.innerHTML = '<div class="insight-card">Sign in to see insights.</div>';
      return;
    }

    const snap = getMoneyAISnapshotForReport();
    if (!snap) {
      container.innerHTML = '<div class="insight-card">No data yet.</div>';
      return;
    }

    // 🔁 mode من البراميتر أو من الذاكرة
    const mode = modeOverride || state.insightsMode || 'overview';
    state.insightsMode = mode;

    const {
      totalAll, total30, total7,
      countAll, avgTicket, label,
      totalIncome30, totalOut30, net30,
      dailySpend, runwayDays,
      exposures, score, scoreLabel, scoreNarrative, scoreReasons,
      categoriesDisplay, cashbackRate, cashback30,
      currentBalance,
      isMember,
      // ⚡ معلومات Money AI العميقة
      behaviorStyle,
      weekType,
      weekSummary,
      behaviorIndices
    } = snap;

    const fmt = n => Number(n || 0).toFixed(2);
    const fmtInt = n => Math.round(n || 0);

    const balanceTitle = isMember
      ? 'Member Balance (allowance)'
      : 'Global Balance (all wallets)';
    const balanceDesc = isMember
      ? 'إجمالي رصيد هذه المحفظة (العضو) بناءً على الـ allowance والعمليات الخاصة به فقط.'
      : `إجمالي كل المحافظ بكل العملات بعد تحويلها إلى ${label}.`;

    let exposureBlock = '';
    if (exposures.length > 0) {
      const top3 = exposures.slice(0, 3);
      const rows = top3.map(e =>
        `<div>${e.ccy}: ~${fmt(e.eqDisplay)} ${label} (${fmtInt(e.pct)}%)</div>`
      ).join('');
      exposureBlock = `
        <div class="insight-card">
          <div class="muted">${isMember ? 'توزيع رصيد هذه المحفظة' : 'توزيع الرصيد بين العملات (Global Exposure)'}</div>
          <div style="margin-top:4px;">${rows}</div>
          <div class="muted" style="margin-top:6px;font-size:11px;">
            ${isMember
              ? 'القيم تخص هذه المحفظة فقط كما يراها Money AI.'
              : `كل القيم مقاسة بما يعادل ${label} حسب أسعار FX التقريبية في هذا الديمو.`}
          </div>
        </div>
      `;
    }

    let catBlock = '';
    if (categoriesDisplay.length > 0) {
      const top3 = categoriesDisplay.slice(0, 3);
      const rows = top3.map(c =>
        `<div>${prettyCategory(c.code)}: <b>${fmt(c.amount)} ${label}</b></div>`
      ).join('');
      catBlock = `
        <div class="insight-card">
          <div class="muted">Top spending categories (last 30d)</div>
          <div style="margin-top:4px;">${rows}</div>
          <div class="muted" style="margin-top:6px;font-size:11px;">
            تعتمد الفئات على عمليات المشتريات لهذه المحفظة فقط.
          </div>
        </div>
      `;
    }

    // 🟣 Rich Goals Block – مع Progress + What-if
    let goalsBlock = '';
    const goals = Array.isArray(state.goals) ? state.goals : [];
    if (goals.length || true) {
      const goalsRows = goals.map(g => {
        const proj = computeGoalProjection(g, snap);
        const perMonth = proj.perMonthNeeded.toFixed(2);
        const sevColor =
          proj.severity === 'high' ? '#fb7185' :
          proj.severity === 'medium' ? '#fbbf24' :
          proj.severity === 'good' ? '#22c55e' :
          '#9ca3af';

        const progressWidth = Math.max(2, Math.min(100, proj.progressPct || 0)).toFixed(1);

        let whatIfLine = '';
        if (proj.whatIf && proj.whatIf.length) {
          const parts = proj.whatIf.map(w => {
            const m = w.months;
            const monthsRounded = m < 1 ? '<1 شهر' : Math.round(m) + ' شهر';
            return `${w.label}: ${monthsRounded}`;
          });
          whatIfLine = `
            <div class="muted" style="font-size:11px;margin-top:2px;">
              What-if (من صافي التدفق الشهري الحالي): ${parts.join(' • ')}
            </div>
          `;
        }

        return `
          <div class="goal-item" data-goal="${g.id}" style="border-top:1px solid #1f2937;padding-top:6px;margin-top:6px;">
            <div><b>${g.title}</b></div>
            <div class="muted" style="font-size:12px;margin-top:2px;">
              الهدف: ${g.targetAmount.toFixed(2)} ${label} خلال ${g.targetMonths} شهر
            </div>
            <div style="margin-top:4px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span>Progress: ${proj.progressPct.toFixed(1)}%</span>
                <span>${proj.savedAmount.toFixed(2)} / ${g.targetAmount.toFixed(2)} ${label}</span>
              </div>
              <div style="margin-top:2px;width:100%;height:6px;border-radius:999px;background:#111827;overflow:hidden;">
                <div style="width:${progressWidth}%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
              </div>
            </div>
            <div class="muted" style="font-size:12px;margin-top:4px;">
              تحتاج تقريباً <b>${perMonth}</b> ${label} شهريًا (للجزء المتبقي من الهدف).
            </div>
            <div style="font-size:12px;margin-top:2px;color:${sevColor};">
              ${proj.statusText}
            </div>
            ${whatIfLine}
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:11px;">
              <input type="number" step="0.01" min="0" class="input"
                     placeholder="Add progress (${label})"
                     data-goal-add-input="${g.id}">
              <button type="button" class="btn secondary"
                      data-goal-add="${g.id}">
                Add
              </button>
              <button type="button" class="btn secondary" style="border-color:#fb7185;color:#fecaca;"
                      data-goal-delete="${g.id}">
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('');

      goalsBlock = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Rich Goals – أهدافك الغنية</div>
          <form id="goalForm" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;margin-top:6px;align-items:center;">
            <input id="goalTitle" type="text" placeholder="اسم الهدف (مثلاً: احتياطي طوارئ)" class="input">
            <input id="goalAmount" type="number" step="0.01" min="0" placeholder="المبلغ (${label})" class="input">
            <input id="goalMonths" type="number" step="1" min="1" placeholder="الأشهر" class="input">
            <button type="submit" class="btn primary" style="white-space:nowrap;">Save Goal</button>
          </form>
          <div class="muted" style="font-size:11px;margin-top:4px;">
            Money AI يحسب لك Progress وكم تحتاج تدخر شهريًا، بالإضافة إلى سيناريوهات What-if مبنية على صافي التدفق الشهري الحالي.
          </div>
          <div id="goalsList" style="margin-top:8px;">
            ${goalsRows || '<div class="muted" style="font-size:12px;">لا توجد أهداف بعد – أضف هدفك الأول.</div>'}
          </div>
        </div>
      `;
    }

    // 🟢 Money AI Coach Block
    const coach = getMoneyAICoachPlan(snap);
    let coachBlock = '';
    if (coach && coach.tasks && coach.tasks.length) {
      const tasksHtml = coach.tasks.map(t => `
        <li style="margin-bottom:6px;">
          <div><b>${t.title}</b> <span class="chip" style="margin-left:4px;">${t.tag}</span></div>
          <div style="font-size:12px;margin-top:2px;">${t.desc}</div>
          <div class="muted" style="font-size:11px;margin-top:2px;">
            تأثير تقديري: Score ${t.impactScore} • Runway ${t.impactRunway}
          </div>
        </li>
      `).join('');
      coachBlock = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Money AI Coach – خطة هذا الأسبوع (${coach.isMember ? 'محفظة العضو' : 'Global Owner'})</div>
          <ul style="margin-top:6px;padding-left:18px;font-size:13px;">
            ${tasksHtml}
          </ul>
          <div class="muted" style="font-size:11px;margin-top:4px;">
            هذه الخطة مبنية على بيانات آخر 30 يوم كما تظهر في هذا الديمو، ويمكن أن تختلف النتائج الفعلية حسب التزامك.
          </div>
        </div>
      `;
    }
    // ================= Family Behavior MODE =================
    if (mode === 'family') {
      const fam = Array.isArray(state.family) ? state.family : [];
      const txsAll = Array.isArray(state.tx) ? state.tx : [];
      const baseCur = state.baseCurrency || 'QAR';

      if (!fam.length) {
        container.innerHTML = `
          <div class="insight-card">
            <div class="muted">Family Behavior</div>
            <div style="margin-top:6px;">
              لا يوجد أفراد عائلة بعد. أضف أفرادًا من تبويب <b>Family</b> ثم عد إلى هنا.
            </div>
          </div>
        `;
        return;
      }

      const rows = fam.map(m => {
        const memberTxs = txsAll
          .filter(t => t.actor === m.id)
          .sort((a, b) => b.ts - a.ts);

        const spend30 = memberTxs
          .filter(t => t.type === 'pay' || t.type === 'withdraw')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        const income30 = memberTxs
          .filter(t => t.type === 'deposit' || t.type === 'incoming')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        const net = income30 - spend30;
        const lastTx = memberTxs[0];
        const lastWhen = lastTx
          ? new Date(lastTx.ts).toLocaleDateString()
          : '—';

        const isFrozen = !!m.frozen;
        const name =
          (m.name && (m.name.first || m.name.nick)) ||
          m.label ||
          ('Member ' + String(m.id).slice(-4));

        return `
          <tr>
            <td>${name}</td>
            <td>
              ${isFrozen
                ? '<span class="badge err">Frozen</span>'
                : '<span class="badge ok">Active</span>'}
            </td>
            <td style="text-align:right;">
              ${spend30 ? fmt(spend30) + ' ' + baseCur : '—'}
            </td>
            <td style="text-align:right;">
              ${net ? fmt(net) + ' ' + baseCur : '—'}
            </td>
            <td>${lastWhen}</td>
          </tr>
        `;
      }).join('');

      container.innerHTML = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Family Behavior – Snapshot</div>
          <div class="muted" style="margin-top:4px;font-size:11px;">
            تلخيص سريع لسلوك أفراد العائلة بناءً على عملياتهم في هذا الديمو.
          </div>
          <div style="margin-top:8px;overflow:auto;">
            <table class="mono" style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead>
                <tr>
                  <th align="left">Member</th>
                  <th align="left">Status</th>
                  <th align="right">Spend (30d)</th>
                  <th align="right">Net (30d)</th>
                  <th align="left">Last activity</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
      return;
    }

    // ================= Timeline MODE =================
    if (mode === 'history') {
      let txs = Array.isArray(state.tx) ? state.tx.slice() : [];
      const actor = state.activeActor || { type: 'owner', memberId: null };
      const isMemberActor = actor.type === 'member' && actor.memberId;

      if (isMemberActor) {
        txs = txs.filter(t => t.actor === actor.memberId);
      }

      if (!txs.length) {
        container.innerHTML = `
          <div class="insight-card">
            <div class="muted">Timeline</div>
            <div style="margin-top:6px;">
              لا توجد حركات كافية لعرض التايم لاين بعد. قم ببعض العمليات ثم عد إلى هنا.
            </div>
          </div>
        `;
        return;
      }

      txs = txs
        .slice(0, 30)
        .sort((a, b) => b.ts - a.ts);

      const items = txs.map(t => {
        const d = new Date(t.ts);
        const when = d.toLocaleString(undefined, {
          year: '2-digit',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        const cur = t.currency || label;
        const cat = t.category ? prettyCategory(t.category) : 'Uncategorized';
        const sign = (t.type === 'deposit' || t.type === 'incoming') ? '+' : '-';

        return `
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
            <div style="width:6px;height:6px;border-radius:999px;background:#22c55e;margin-top:6px;"></div>
            <div>
              <div style="display:flex;justify-content:space-between;gap:8px;">
                <span>${t.type.toUpperCase()} ${sign}${fmt(t.amount)} ${cur}</span>
                <span class="muted" style="font-size:11px;">${when}</span>
              </div>
              <div class="muted" style="font-size:12px;margin-top:2px;">
                ${cat}${t.note ? ' • ' + t.note : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Timeline – آخر ${txs.length} حركة</div>
          <div style="margin-top:8px;">
            ${items}
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px;">
            كل القيم تقريبية للتجربة وليست بيانات حقيقية.
          </div>
        </div>
      `;
      return;
    }


        // ================= Rush vs Rich Score MODE =================
    if (mode === 'score') {
      const reasonsArr = Array.isArray(scoreReasons)
        ? scoreReasons
        : (scoreReasons ? [String(scoreReasons)] : []);

      const width = Math.max(4, Math.min(100, Number(score) || 0));
      const reasonsHtml = reasonsArr.length
        ? reasonsArr.map(r => '<li>' + r + '</li>').join('')
        : '<li>لا توجد بيانات كافية حتى الآن، جرّب استخدام هذه المحفظة لعدة أيام ثم عد إلى هنا.</li>';

      // 📊 مؤشرات سلوكية فرعية
      const idx = behaviorIndices || {};
      const idxConfig = [
        { key: 'cqi', label: 'Cashflow Quality (CQI)', hint: 'التوازن بين الدخل والصرف.' },
        { key: 'cps', label: 'Consumption Pattern Stability (CPS)', hint: 'استقرار نمط الصرف اليومي.' },
        { key: 'bv',  label: 'Burn Velocity (BV)', hint: 'سرعة حرق الرصيد مقارنة بحجمه.' },
        { key: 'sms', label: 'Spending Maturity (SMS)', hint: 'نسبة الأساسيات مقابل الكماليات.' },
        { key: 'sdi', label: 'Savings Discipline (SDI)', hint: 'انضباط الادخار وربطه بالأهداف.' },
        { key: 'fsr', label: 'Financial Shock Resistance (FSR)', hint: 'قدرتك على تحمل الصدمات (runway).' }
      ];

      const idxHtml = idxConfig.map(conf => {
        const val = Math.round(idx[conf.key] || 0);
        let color =
          val < 40 ? '#fb7185' :
          val < 70 ? '#fbbf24' :
          '#22c55e';
        const pct = Math.max(4, Math.min(100, val));
        return `
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;">
              <span>${conf.label}</span>
              <span><b>${val}</b> / 100</span>
            </div>
            <div style="margin-top:2px;width:100%;height:5px;border-radius:999px;background:#020617;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};"></div>
            </div>
            <div class="muted" style="font-size:11px;margin-top:2px;">${conf.hint}</div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Rush vs Rich Global Score</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:4px;">
            <div>
              <div style="font-size:26px;font-weight:800;letter-spacing:.06em;">
                ${Math.round(Number(score) || 0)} / 100
              </div>
              <div class="muted" style="font-size:13px;margin-top:2px;">${scoreLabel || ''}</div>
              <div style="margin-top:6px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px;">
                <span class="chip">Style: ${behaviorStyle || '—'}</span>
                <span class="chip">Week: ${weekType || 'normal'}</span>
              </div>
              ${weekSummary ? `
                <div class="muted" style="font-size:11px;margin-top:4px;max-width:340px;">
                  ${weekSummary}
                </div>` : ''}
            </div>
            <div style="min-width:220px;flex:1;">
              <div class="score-meter">
                <div class="score-meter-inner"
                     style="width:${width}%;background:linear-gradient(90deg,#ef4444,#f97316,#22c55e,#4ade80);"></div>
              </div>
              <div class="muted" style="font-size:11px;margin-top:6px;">
                ${isMember
                  ? 'النتيجة تعكس سلوك هذه المحفظة فقط (العضو).'
                  : 'النتيجة مبنية على الدخل/الصرف والرصيد العالمي عبر جميع المحافظ.'}
              </div>
            </div>
          </div>
        </div>

        <div class="insight-card">
          <div class="muted">${balanceTitle}</div>
          <div class="insight-main">${fmt(currentBalance)} ${label}</div>
          <div class="muted" style="font-size:12px;margin-top:4px;">
            ${balanceDesc}
          </div>
        </div>

        <div class="insight-card">
          <div class="muted">قراءة Money AI لوضع هذه المحفظة</div>
          <div style="margin-top:4px;">${scoreNarrative || ''}</div>
        </div>

        <div class="insight-card">
          <div class="muted">تفصيل المؤشرات السلوكية</div>
          <div style="margin-top:4px;font-size:12px;">
            ${idxHtml}
          </div>
        </div>

        <div class="insight-card">
          <div class="muted">أهم الملاحظات من البيانات</div>
          <ul style="margin-top:4px;padding-left:18px;font-size:13px;">
            ${reasonsHtml}
          </ul>
        </div>

        ${catBlock}
        ${exposureBlock}
        ${goalsBlock}
        ${coachBlock}
      `;
      wireGoalsInteractions();
      return;
    }

        // ================= CHAT MODE =================
    if (mode === 'chat') {
      container.innerHTML = `
        <div class="insight-card" style="grid-column:1/-1;">
          <div class="muted">Money AI Chat</div>
          <div id="chatWindow"
               style="margin-top:10px;height:300px;overflow-y:auto;padding:10px;border-radius:12px;
                      background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.18);">
          </div>

          <div style="display:flex;gap:6px;margin-top:10px;">
            <input type="text" id="chatInput" class="input" placeholder="اسأل Money AI أي شيء..."
                   style="flex:1;">
            <button id="chatSend" class="btn primary">Send</button>
          </div>
        </div>
      `;

      wireChat();
      return;
    }


    // ================= OVERVIEW MODE =================
    // helper للـ Overview
    const scoreValue = Math.round(score || 0);
    const reasonsArr = Array.isArray(scoreReasons) ? scoreReasons.slice(0, 3) : [];
    const reasonsText = reasonsArr.join(' • ');

    let runwayLabel;
    if (!isFinite(runwayDays) || runwayDays > 365) {
      runwayLabel = 'Safe · > 1y';
    } else if (runwayDays <= 0) {
      runwayLabel = '⚠ Under pressure';
    } else if (runwayDays < 30) {
      runwayLabel = 'Tight · ' + Math.round(runwayDays) + ' days';
    } else if (runwayDays < 90) {
      runwayLabel = 'OK · ' + Math.round(runwayDays) + ' days';
    } else {
      runwayLabel = 'Comfort · ' + Math.round(runwayDays) + ' days';
    }

    // ================= OVERVIEW MODE =================
    container.innerHTML = `
      <div class="insights-grid">
        <!-- Rush → Rich Score -->
        <div class="insight-card premium">
          <div class="head">Rush → Rich Score</div>
          <div class="big-score">${scoreValue}%</div>
          <div class="desc">${scoreLabel || ''}</div>
          <div class="mini">${reasonsText}</div>
        </div>

        <!-- Runway -->
        <div class="insight-card">
          <div class="head">Runway</div>
          <div class="metric">${runwayLabel}</div>
          <div class="mini">قراءة تقريبية لقدرة هذه المحفظة على تحمل الصدمات.</div>
        </div>

        <!-- Balance -->
        <div class="insight-card">
          <div class="head">${balanceTitle}</div>
          <div class="metric">${fmt(currentBalance)} ${label}</div>
          <div class="mini">${balanceDesc}</div>
        </div>

        <!-- Cashflow -->
        <div class="insight-card">
          <div class="head">${isMember ? 'Spend (last 30 days)' : 'Global spend (last 30 days)'}</div>
          <div class="metric">${fmt(total30)} ${label}</div>
          <div class="mini">
            آخر 7 أيام: ${fmt(total7)} ${label} • All time: ${fmt(totalAll)} ${label} في ${countAll} عملية
          </div>
        </div>

        ${exposureBlock || ''}
        ${catBlock || ''}
        ${goalsBlock || ''}
        ${coachBlock || ''}
      </div>
    `;
    wireGoalsInteractions();
  }

window.MoneyAIInsights = {
  getSnapshot() {
    // هنا رجّع نفس data اللي كنت ترسله لتقرير Money AI PDF
    return window.getMoneyAISnapshotForReport
      ? window.getMoneyAISnapshotForReport()
      : {
          rushScore: 60,
          richScore: 40,
          runwayDays: 35,
          dailyBurn: 280,
          topCategories: ["Food delivery", "Subscriptions", "Taxis"],
          currency: "QAR"
        };
  },
  getPersonalizedAdvice({ prompt, lang, snapshot }) {
    // اختياري – تقدر في المستقبل تشغل هنا logic أعمق
    return null;
  }
};

 // ======== Rich Goals Helpers ========

function computeGoalProjection(goal, snap) {
  const target = Number(goal.targetAmount || 0);
  const months = Number(goal.targetMonths || 0) || 1;
  const saved = Number(goal.savedAmount || 0);

  const remaining = Math.max(0, target - saved);
  const perMonthNeeded = target > 0 ? (remaining / months) : 0;

  // نفترض أن net30 ≈ صافي شهر واحد
  const currentMonthlyNet = Number(snap.net30 || 0);

  let statusText = '';
  let severity = 'neutral';

  if (!target) {
    statusText = 'لم يتم تحديد مبلغ هدف واضح بعد.';
  } else if (remaining <= 0) {
    statusText = 'تم الوصول لهذا الهدف أو تجاوزه – يمكنك قفله أو تعديل المبلغ.';
    severity = 'good';
  } else if (currentMonthlyNet <= 0) {
    statusText = 'حاليًا صافي التدفق قريب من الصفر أو سلبي – أي ادخار لهذا الهدف يحتاج ضبط مصاريف أولاً.';
    severity = 'high';
  } else if (currentMonthlyNet < perMonthNeeded) {
    statusText =
      `صافي التدفق الحالي (${currentMonthlyNet.toFixed(2)} ${snap.label}) ` +
      `أقل من المطلوب (${perMonthNeeded.toFixed(2)} ${snap.label} شهريًا) لتحقيق هذا الهدف في الوقت المحدد – ` +
      'تحتاج رفع الدخل أو خفض الصرف أو تمديد مدة الهدف.';
    severity = 'medium';
  } else {
    statusText =
      `وضعك ممتاز – صافي التدفق (${currentMonthlyNet.toFixed(2)} ${snap.label}) ` +
      `يغطي الادخار المطلوب (${perMonthNeeded.toFixed(2)} ${snap.label} شهريًا) لهذا الهدف.`;
    severity = 'good';
  }

  const progressPct = target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : 0;

  // What-if scenarios: لو خصصت 10% / 30% / 50% من صافي التدفق الشهري الحالي
  const whatIf = [];
  if (remaining > 0 && currentMonthlyNet > 0) {
    const scenarios = [
      { share: 0.1, label: '10%' },
      { share: 0.3, label: '30%' },
      { share: 0.5, label: '50%' }
    ];
    scenarios.forEach(s => {
      const monthlyAlloc = currentMonthlyNet * s.share;
      if (monthlyAlloc > 0) {
        const monthsNeeded = remaining / monthlyAlloc;
        whatIf.push({
          label: s.label,
          months: monthsNeeded
        });
      }
    });
  }

  return {
    perMonthNeeded,
    currentMonthlyNet,
    statusText,
    severity,
    progressPct,
    savedAmount: saved,
    remaining,
    whatIf
  };
}

async function handleGoalSubmit(e) {
  e.preventDefault();
  if (!state.authed) {
    msg('Sign in to save goals.');
    return;
  }
  const titleEl = document.getElementById('goalTitle');
  const amtEl = document.getElementById('goalAmount');
  const monthsEl = document.getElementById('goalMonths');
  if (!titleEl || !amtEl || !monthsEl) return;

  const title = titleEl.value.trim();
  const amount = Number((amtEl.value || '').replace(',', '.'));
  const months = Number((monthsEl.value || '').replace(',', '.'));

  if (!title) {
    msg('اكتب اسم الهدف (مثال: احتياطي طوارئ / تسديد دين).');
    return;
  }
  if (!amount || amount <= 0) {
    msg('ضع مبلغ هدف أكبر من صفر.');
    return;
  }
  if (!months || months <= 0) {
    msg('حدد عدد الأشهر (1 أو أكثر).');
    return;
  }

  const goal = {
    id: 'goal_' + crypto.randomUUID(),
    title,
    targetAmount: amount,
    targetMonths: months,
    createdAt: Date.now(),
    savedAmount: 0 // 👈 تقدم فعلي للهدف
  };

  if (!Array.isArray(state.goals)) state.goals = [];
  state.goals.push(goal);
  await saveProfile();

  titleEl.value = '';
  amtEl.value = '';
  monthsEl.value = '';

  msg('تم حفظ الهدف المالي.');
  renderInsights();
}

async function handleGoalDelete(goalId) {
  if (!goalId) return;
  if (!Array.isArray(state.goals)) return;
  const idx = state.goals.findIndex(g => g.id === goalId);
  if (idx === -1) return;
  const g = state.goals[idx];
  const ok = confirm('حذف الهدف: "' + g.title + '"؟');
  if (!ok) return;
  state.goals.splice(idx, 1);
  await saveProfile();
  msg('تم حذف الهدف.');
  renderInsights();
}

function wireGoalsInteractions() {
  const form = document.getElementById('goalForm');
  if (form) {
    form.onsubmit = handleGoalSubmit;
  }
  document.querySelectorAll('[data-goal-delete]').forEach(btn => {
    const id = btn.getAttribute('data-goal-delete');
    btn.onclick = () => handleGoalDelete(id);
  });
  document.querySelectorAll('[data-goal-add]').forEach(btn => {
    const id = btn.getAttribute('data-goal-add');
    btn.onclick = () => handleGoalContribution(id);
  });
}


async function handleGoalContribution(goalId) {
  if (!goalId) return;
  if (!Array.isArray(state.goals)) return;

  const input = document.querySelector('[data-goal-add-input="' + goalId + '"]');
  if (!input) return;

  const raw = (input.value || '').replace(',', '.');
  const amt = Number(raw);
  if (!amt || amt <= 0 || !isFinite(amt)) {
    msg('أدخل مبلغ صحيح لإضافته كتقدم في الهدف.');
    return;
  }

  const g = state.goals.find(x => x.id === goalId);
  if (!g) return;

  g.savedAmount = Number(g.savedAmount || 0) + amt;
  await saveProfile();

  input.value = '';
  msg('تم تسجيل ' + amt.toFixed(2) + ' كتقدم في الهدف "' + g.title + '".');
  renderInsights();
}

  function generateMoneyAIReport() {
    const snap = getMoneyAISnapshotForReport();
    if (!snap) {
      msg('No data to export.');
      return;
    }
    const {
      label, totalAll, total30, total7, countAll, avgTicket,
      totalIncome30, totalOut30, net30, dailySpend, runwayDays,
      exposures, score, scoreLabel, scoreNarrative, categoriesDisplay,
      cashbackRate, cashback30, currentBalance
    } = snap;
    const fmt = n => Number(n || 0).toFixed(2);
    const fmtInt = n => Math.round(n || 0);

    const ownerName = fullName(state.user) || 'MiniBank User';
    const nowStr = new Date().toLocaleString();

    const freezeSummary = (state.family || []).map(m => {
      const st = memberFreezeStatus(m);
      return `<tr>
        <td>${fullName(m)}</td>
        <td>${m.mode}</td>
        <td>${(m.allowance || 0).toFixed(2)} QAR</td>
        <td>${st.active ? 'Frozen' : 'Active'}</td>
        <td>${st.text || '-'}</td>
      </tr>`;
    }).join('');

    const exposureRows = exposures.map(e =>
      `<tr><td>${e.ccy}</td><td>${fmt(e.eqDisplay)} ${label}</td><td>${fmtInt(e.pct)}%</td></tr>`
    ).join('');

    const catRows = categoriesDisplay.map(c =>
      `<tr><td>${prettyCategory(c.code)}</td><td>${fmt(c.amount)} ${label}</td></tr>`
    ).join('');

    const lang = state.reportLang || 'both';

    const enBlock = `
      <h2>Money AI – Global Financial Report</h2>
      <p><b>Owner:</b> ${ownerName}<br/>
      <b>Generated at:</b> ${nowStr}</p>

      <h3>1. Global Overview</h3>
      <table class="mt">
        <tr><th>Metric</th><th>Value (${label})</th></tr>
        <tr><td>Total spend (last 30 days)</td><td>${fmt(total30)}</td></tr>
        <tr><td>Total spend (last 7 days)</td><td>${fmt(total7)}</td></tr>
        <tr><td>All-time volume</td><td>${fmt(totalAll)} in ${countAll} txs</td></tr>
        <tr><td>Global balance (all wallets)</td><td>${fmt(currentBalance)}</td></tr>
        <tr><td>Average ticket size</td><td>${fmt(avgTicket)}</td></tr>
      </table>

      <h3>2. Cashflow & Runway (last 30 days)</h3>
      <table class="mt">
        <tr><th>Metric</th><th>Value (${label})</th></tr>
        <tr><td>Income (deposits)</td><td>${fmt(totalIncome30)}</td></tr>
        <tr><td>Outflow (withdrawals, purchases, FX, family funding)</td><td>${fmt(totalOut30)}</td></tr>
        <tr><td>Net flow</td><td>${fmt(net30)}</td></tr>
        <tr><td>Average daily spend</td><td>${fmt(dailySpend)}</td></tr>
        <tr><td>Estimated global runway</td><td>${runwayDays ? fmtInt(runwayDays) + ' days' : '—'}</td></tr>
      </table>

      <h3>3. Rush → Rich Score</h3>
      <p><b>Score:</b> ${fmtInt(score)} / 100 (${scoreLabel})</p>
      <p>${scoreNarrative}</p>

      <h3>4. Spending Categories (last 30 days)</h3>
      <table class="mt">
        <tr><th>Category</th><th>Amount (${label})</th></tr>
        ${catRows || '<tr><td colspan="2">Not enough data.</td></tr>'}
      </table>

      <h3>5. Cashback Simulation</h3>
      <p>If your bank offered <b>${(cashbackRate * 100).toFixed(1)}%</b> cashback on purchases, you would have earned approximately
      <b>${fmt(cashback30)} ${label}</b> over the last 30 days.</p>

      <h3>6. Currency Exposure</h3>
      <table class="mt">
        <tr><th>Currency</th><th>Equivalent balance (${label})</th><th>Share</th></tr>
        ${exposureRows || '<tr><td colspan="3">Single-currency only.</td></tr>'}
      </table>

      <h3>7. Family Controls (freeze & allowances)</h3>
      <table class="mt">
        <tr><th>Member</th><th>Mode</th><th>Allowance (QAR)</th><th>Status</th><th>Freeze</th></tr>
        ${freezeSummary || '<tr><td colspan="5">No family members configured.</td></tr>'}
      </table>
    `;

    const arBlock = `
      <h2>تقرير Money AI المالي العالمي</h2>
      <p><b>المالك:</b> ${ownerName}<br/>
      <b>وقت إنشاء التقرير:</b> ${nowStr}</p>

      <h3>1. نظرة عامة عالمية</h3>
      <table class="mt">
        <tr><th>المؤشر</th><th>القيمة (${label})</th></tr>
        <tr><td>إجمالي الصرف آخر 30 يوم</td><td>${fmt(total30)}</td></tr>
        <tr><td>إجمالي الصرف آخر 7 أيام</td><td>${fmt(total7)}</td></tr>
        <tr><td>إجمالي الحجم منذ البداية</td><td>${fmt(totalAll)} في ${countAll} عملية</td></tr>
        <tr><td>الرصيد العالمي (كل المحافظ)</td><td>${fmt(currentBalance)}</td></tr>
        <tr><td>متوسط قيمة العملية الواحدة</td><td>${fmt(avgTicket)}</td></tr>
      </table>

      <h3>2. التدفق النقدي ومدة التحمل (آخر 30 يوم)</h3>
      <table class="mt">
        <tr><th>المؤشر</th><th>القيمة (${label})</th></tr>
        <tr><td>الدخل (إيداعات)</td><td>${fmt(totalIncome30)}</td></tr>
        <tr><td>الخروج (سحب/مشتريات/تحويلات)</td><td>${fmt(totalOut30)}</td></tr>
        <tr><td>صافي التدفق</td><td>${fmt(net30)}</td></tr>
        <tr><td>متوسط الصرف اليومي</td><td>${fmt(dailySpend)}</td></tr>
        <tr><td>مدة التحمل التقريبية (Runway)</td><td>${runwayDays ? fmtInt(runwayDays) + ' يوم' : '—'}</td></tr>
      </table>

      <h3>3. مؤشر Rush → Rich</h3>
      <p><b>النتيجة:</b> ${fmtInt(score)} / 100 (${scoreLabel})</p>
      <p>${scoreNarrative}</p>

      <h3>4. فئات الصرف (آخر 30 يوم)</h3>
      <table class="mt">
        <tr><th>الفئة</th><th>القيمة (${label})</th></tr>
        ${catRows || '<tr><td colspan="2">لا توجد بيانات كافية.</td></tr>'}
      </table>

      <h3>5. محاكاة الكاش باك</h3>
      <p>لو كان لديك بطاقة بكاش باك بنسبة <b>${(cashbackRate * 100).toFixed(1)}%</b> على المشتريات،
      لكان من الممكن أن تحصل على تقريباً <b>${fmt(cashback30)} ${label}</b> خلال آخر 30 يوم.</p>

      <h3>6. توزيع الرصيد بين العملات</h3>
      <table class="mt">
        <tr><th>العملة</th><th>الرصيد المكافئ (${label})</th><th>النسبة</th></tr>
        ${exposureRows || '<tr><td colspan="3">العملات المستخدمة أحادية تقريباً.</td></tr>'}
      </table>

      <h3>7. العائلة – التجميد والـ Allowance</h3>
      <table class="mt">
        <tr><th>العضو</th><th>الوضع</th><th>الـ Allowance (QAR)</th><th>الحالة</th><th>التجميد</th></tr>
        ${freezeSummary || '<tr><td colspan="5">لا يوجد أعضاء عائلة.</td></tr>'}
      </table>
    `;

    const combined = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Money AI Report</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color:#111827; }
          h1,h2,h3 { margin: 0 0 8px; }
          p { margin: 4px 0 8px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 13px; }
          th { background:#f3f4f6; text-align:left; }
          .mt { margin-top: 6px; margin-bottom: 12px; }
          hr { margin: 20px 0; border: none; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <h1>Money AI – Global Report / التقرير المالي</h1>
        ${lang === 'en' ? enBlock : (lang === 'ar' ? arBlock : enBlock + '<hr/>' + arBlock)}
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) {
      msg('Popup blocked – allow popups to export the report.');
      return;
    }
    win.document.open();
    win.document.write(combined);
    win.document.close();
    win.focus();
    win.print();
  }

  function genMerchantQR() {
    const mid = $('#mId').value.trim() || 'M-DEMO';
    const amt = Number($('#mAmount').value || '0');
    const desc = $('#mDesc').value.trim() || 'Purchase';
    if (!amt || amt <= 0) return msg('Enter a valid amount for merchant payment.');
    const payload = { mid, amt, desc, ts: Date.now(), nonce: 'qr_' + Math.random().toString(36).slice(2) };
    state.merchantLastPayload = payload;
    const out = $('#merchantQRPayload');
    if (out) out.textContent = JSON.stringify(payload, null, 2);
    msg('QR payload generated – simulate scan to pay.');
  }

  async function payMerchantQR() {
    if (!state.authed) return msg('Sign in first.');
    if (!state.merchantLastPayload) return msg('Generate QR payload first.');
    const { amt } = state.merchantLastPayload;
    await actorPay(amt, 'merchant');
  }

  async function tapNFC() {
    if (!state.authed) return msg('Sign in first.');
    const amt = Number($('#mAmount').value || '0');
    if (!amt || amt <= 0) return msg('Enter a valid amount before NFC tap.');
    msg('NFC tap detected… processing payment.');
    setTimeout(() => { actorPay(amt, 'nfc'); }, 500);
  }

  function openTransferModal() {
    if (!state.authed) { msg('Sign in first.'); return; }
    const modal = $('#transferModal');
    const sel = $('#transferMemberSelect');
    const amt = $('#transferAmount');
    if (!modal || !sel || !amt) return;

    const allowanceMembers = (state.family || []).filter(m => m.mode === 'allowance');
    if (!allowanceMembers.length) {
      msg('No allowance-based family members. Set at least one member to Allowance mode.');
      return;
    }

    sel.innerHTML = allowanceMembers.map(m =>
      `<option value="${m.id}">${fullName(m)} – allowance: ${(m.allowance || 0).toFixed(2)} QAR</option>`
    ).join('');
    amt.value = '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeTransferModal() {
    const modal = $('#transferModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function handleTransferConfirm() {
    const sel = $('#transferMemberSelect');
    const amtEl = $('#transferAmount');
    if (!sel || !amtEl) return closeTransferModal();
    const memberId = sel.value;
    const raw = (amtEl.value || '').replace(',', '.');
    const amount = Number(raw);
    if (!memberId || !amount || !Number.isFinite(amount) || amount <= 0) {
      msg('Choose member and enter valid amount.');
      return;
    }
    const m = state.family.find(x => x.id === memberId);
    if (!m) {
      msg('Member not found.');
      return;
    }

    ensureWalletStructures();
    const baseCur = state.baseCurrency || 'QAR';
    const wallets = state.wallets || {};
    const baseWallet = wallets[baseCur] || (wallets[baseCur] = { balance: 0, hold: 0 });

    if (amount > (baseWallet.balance || 0)) {
      msg('رصيد المالك غير كافٍ لإتمام التحويل.');
      return;
    }

    const prev = baseWallet.balance || 0;
    baseWallet.balance -= amount;
    state.wallet.balance = baseWallet.balance;
    state.wallet.hold = baseWallet.hold || 0;

    m.allowance = (m.allowance || 0) + amount;
    await saveWallet();
    await upsertMember(m);

    if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
      try {
        await BalanceChainSDK.mirrorToMSL({
          userId: state.user.id,
          direction: 'out',
          amount,
          currency: baseCur,
          ref: 'member_fund:' + m.id
        });
      } catch (e) {
        console.warn('member fund mirror error', e);
      }
    }

    await pushTx({
      ts: Date.now(),
      type: 'member_fund',
      amount,
      currency: baseCur,
      status: 'settled',
      actor: m.id,
      actorName: fullName(m)
    });

    msg('تم تحويل ' + amount.toFixed(2) + ' QAR إلى ' + fullName(m));
    closeTransferModal();
    render(true, prev);
    renderInsights();
  }
  // ===========================
  // Money AI – Chat Brain (clean single implementation)
  // ===========================
  async function moneyAI_ChatReply(rawMsg) {
    const snap = getMoneyAISnapshotForReport();
    if (!snap) {
      return 'لا يوجد بيانات مالية كافية بعد 🧾\nقم باستخدام المحفظة (إيداع + صرف بسيط) ثم اسألني من جديد.';
    }

    const msg = (rawMsg || '').toString().trim().toLowerCase();
    const {
      behaviorStyle,
      behaviorLabel,
      weekType,
      weekSummary,
      runwayDays,
      net30,
      totalOut30,
      totalIncome30,
      goals,
      score,
      scoreLabel,
      currentBalance,
      displayCur: label,
      dailySpend,
      dailySpend7,
      categoriesDisplay
    } = snap;

    const fmt = (n) => Number(n || 0).toFixed(2);
    const fmtInt = (n) => Math.round(n || 0);

    // استقبال خاص من MiniBank
    if (msg === '__welcome__') {
      const ownerName = fullName(state.user) || 'Money AI user';
      return [
        `أهلاً ${ownerName} 👋`,
        `أنا Money AI – أقرأ سلوكك المالي وأساعدك تتحرك من "Rush" إلى "Rich".`,
        '',
        `الآن أرى أن نمطك: ${behaviorStyle} (${behaviorLabel}),`,
        `نوع الأسبوع: ${weekType}، وصافي آخر 30 يوم: ${fmt(net30)} ${label}.`,
        '',
        'اسألني مثلًا:',
        '• كيف وضعي الآن؟',
        '• كيف أحسن ال Score؟',
        '• كيف أرفع الـ runway؟',
        '• كيف أحقق هدفي المالي أسرع؟'
      ].join('\n');
    }

    // تحيات عامة
    if (msg.includes('hello') || msg.includes('hi') || msg.includes('مرحبا') || msg.includes('سلام')) {
      return await moneyAI_ChatReply('__welcome__');
    }

    // كيف وضعي؟ تحليل عام
    if (msg.includes('وضعي') || msg.includes('تحليل') || msg.includes('analysis')) {
      const lines = [];
      lines.push('تحليل سريع لوضعك الآن:');
      lines.push('');
      lines.push(`• السلوك المالي العام: ${behaviorStyle} (${behaviorLabel})`);
      lines.push(`• نوع الأسبوع: ${weekType}`);
      lines.push(`• صافي آخر 30 يوم: ${fmt(net30)} ${label}`);
      lines.push(`• مجموع المصروف: ${fmt(totalOut30)} ${label}`);
      lines.push(`• مجموع الدخل: ${fmt(totalIncome30)} ${label}`);
      lines.push(`• متوسط الصرف اليومي: ${fmt(dailySpend)} ${label}`);
      lines.push(`• Runway تقديري (كم يوم تكمل بنفس النمط): ${fmtInt(runwayDays)} يوم`);
      lines.push(`• Rush → Rich Score: ${fmtInt(score)} / 100 (${scoreLabel})`);
      lines.push('');
      if (Array.isArray(categoriesDisplay) && categoriesDisplay.length) {
        lines.push('أكثر الفئات التي تحرقك حالياً:');
categoriesDisplay.slice(0, 5).forEach((c, idx) => {
  const name = prettyCategory(c.code);         // يحوّل food → طعام مثلاً
  const value = fmt(c.amount);                 // القيمة
  const share = totalOut30 > 0 ? (c.amount / totalOut30) * 100 : 0;

  lines.push(
    `  ${idx + 1}) ${name}: ${value} ${label} (${fmtInt(share)}٪ من المصروف)`
  );
});
        lines.push('');
      }
      if (Array.isArray(goals) && goals.length) {
        const activeGoals = goals.filter((g) => !g.done);
        if (activeGoals.length) {
          lines.push('الأهداف النشطة التي أراها في MiniBank:');
          activeGoals.slice(0, 3).forEach((g, idx) => {
            lines.push(`  • ${g.title || 'هدف'} – الهدف ${fmt(g.target || 0)} ${label}`);
          });
          lines.push('');
        }
      }
      lines.push('لو حاب، اسألني: "كيف أحسن ال score؟" أو "كيف أزيد الـ runway؟" وسأعطيك خطوات أدق.');
      return lines.join('\n');
    }

    // تحسين السكور
    if (msg.includes('score') || msg.includes('سكور') || msg.includes('سكو')) {
      const lines = [];
      lines.push(`Score الحالي تقريباً: ${fmtInt(score)} / 100 (${scoreLabel}).`);
      lines.push('');
      lines.push('لبناء Rich Score أعلى، جرب التالي خلال الأسبوع القادم:');
      lines.push('1) ثبت سقف للصرف اليومي أقل من المتوسط الحالي بـ 10–20٪.');
      lines.push('2) امنع أي مصرف "Rush" مكرر أكثر من مرتين في الأسبوع (مثل توصيل، قهوة غالية، إلخ).');
      lines.push('3) فعّل هدف واحد واضح في MiniBank وخليه ياخذ جزء ثابت من الدخل (حتى لو بسيط).');
      lines.push('4) أي دخل إضافي يجيك، لا ترفعه للصرف اليومي، وجهه كامل للأهداف أو سداد الديون.');
      lines.push('');
      lines.push('بعد أسبوعين، أعد سؤال: "قيّم سكوري الآن" وستلاحظ الفرق لو التزمت.');
      return lines.join('\n');
    }

    // سؤال عن Runway
    if (msg.includes('runway') || msg.includes('رنواي') || msg.includes('كم أقدر أكمل')) {
      const lines = [];
      lines.push(`Runway التقريبي حسب نمطك الحالي: ${fmtInt(runwayDays)} يوم.`);
      lines.push('');
      lines.push('لزيادة الـ Runway بدون ما تحس أنك "مخنوق":');
      lines.push('1) اختر فئتين ترفيه أو كماليات وخفّضهما بـ 30–40٪ فقط.');
      lines.push('2) أي زيادة دخل جديدة لا ترفع بها مستوى الصرف اليومي، خذها كلها كـ Safety buffer.');
      lines.push('3) ثبت مصروف أسبوعي Cash أو على محفظة فرعية ولا تخرج عنه.');
      return lines.join('\n');
    }

    // أهداف وادخار
    if (msg.includes('هدف') || msg.includes('goals') || msg.includes('ادخار') || msg.includes('saving')) {
      const lines = [];
      if (!Array.isArray(goals) || goals.length === 0) {
        lines.push('لا أرى أهدافاً مفعلة في MiniBank حتى الآن.');
        lines.push('ابدأ بهدف واحد واضح (مبلغ + مدة) وربطه بمحفظة أو مبلغ شهري ثابت.');
      } else {
        lines.push('أرى هذه الأهداف في MiniBank:');
        goals.slice(0, 3).forEach((g, idx) => {
          const t = fmt(g.target || 0);
          const saved = fmt(g.saved || 0);
          lines.push(`  • ${g.title || 'هدف'} – مستهدف ${t} ${label}، تم تجميع ${saved} حتى الآن.`);
        });
        lines.push('');
        lines.push('حاول ربط كل هدف بحركة ثابتة (standing order) ولو صغيرة، المهم الاستمرارية.');
      }
      lines.push('');
      lines.push('اسألني أيضاً: "كيف أوزع الدخل على الأهداف والصرف؟" لأعطيك توزيعاً مقترحاً.');
      return lines.join('\n');
    }

    // توزيع الدخل
    if (msg.includes('وزع') || msg.includes('توزيع') || msg.includes('كيف أوزع') || msg.includes('budget')) {
      const lines = [];
      lines.push(`افترض أن دخلك الشهري الفعلي يقارب ${fmt(totalIncome30)} ${label}.`);
      lines.push('توزيع مبدئي مقترح:');
      lines.push('• 50% احتياجات أساسية (سكن، أكل، نقل، إلخ).');
      lines.push('• 20% أمان (أهداف، ادخار، صندوق طوارئ، سداد ديون).');
      lines.push('• 20% نمو (تعلم، مشروع جانبي، تطوير مهارات).');
      lines.push('• 10% متعة مسيطر عليها (ترفيه، كافيهات، إلخ).');
      lines.push('');
      lines.push('كلما زادت نسبة الأمان والنمو مقابل الاحتياجات والمتعة، زاد Rich Score الخاص بك مع الوقت.');
      return lines.join('\n');
    }

    // fallback عام يربط بالسلوك
    const lines = [];
    lines.push('استقبلت سؤالك 👌');
    lines.push('');
    lines.push('سأجاوبك من زاوية السلوك المالي، ليس كأرقام فقط:');
    lines.push(`• وضعك الحالي: ${weekSummary || 'ملخص أسبوعي غير متوفر بعد.'}`);
    lines.push(`• السلوك: ${behaviorStyle} (${behaviorLabel}), Runway ≈ ${fmtInt(runwayDays)} يوم.`);
    lines.push('');
    lines.push('حاول تعيد صياغة سؤالك لوحدة محددة أكثر (دين، هدف، مشروع، مصروف معين)');
    lines.push('وسأساعدك بخطوات عملية مختصرة.');

    return lines.join('\n');
  }


  function wireChat() {
  const win = $('#chatWindow');
  const input = $('#chatInput');
  const send = $('#chatSend');
  if (!win || !input || !send) return;

  // Scroll helper
  function scroll() {
    win.scrollTop = win.scrollHeight;
  }

  // Append messages
  function addMsg(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.style.margin = '6px 0';
    bubble.style.padding = '8px 12px';
    bubble.style.borderRadius = '10px';
    bubble.style.maxWidth = '80%';
    bubble.style.fontSize = '13px';
    bubble.style.whiteSpace = 'pre-wrap';

    if (sender === 'user') {
      bubble.style.background = '#2563eb';
      bubble.style.color = 'white';
      bubble.style.marginLeft = 'auto';
    } else {
      bubble.style.background = 'rgba(255,255,255,.1)';
      bubble.style.color = '#e5e7eb';
      bubble.style.marginRight = 'auto';
    }

    bubble.textContent = text;
    win.appendChild(bubble);
    scroll();
  }

  // Mock "typing..."
  function addTyping() {
    const t = document.createElement('div');
    t.id = 'typingBubble';
    t.style.margin = '6px 0';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '10px';
    t.style.background = 'rgba(255,255,255,.1)';
    t.style.color = '#e5e7eb';
    t.textContent = 'Money AI is thinking...';
    win.appendChild(t);
    scroll();
  }

  function removeTyping() {
    const t = $('#typingBubble');
    if (t) t.remove();
  }

  // Handle send
  send.onclick = async () => {
    const msg = input.value.trim();
    if (!msg) return;

    addMsg('user', msg);
    input.value = '';

    addTyping();

    // Call Money AI logic
    const reply = await moneyAI_ChatReply(msg);

    removeTyping();
    addMsg('ai', reply);
  };
}


  // ======== Rush Alerts (Dashboard Bar) ========

function computeRushAlerts(snap) {
  const alerts = [];
  const {
    net30,
    runwayDays,
    total30,
    total7,
    label,
    categoriesDisplay,
    totalOut30,
    totalOut7,
    currentBalance,
    isMember
  } = snap;
  const fmt = n => Number(n || 0).toFixed(2);

  // 1) صافي تدفق سلبي
  if (net30 < 0) {
    alerts.push({
      severity: 'high',
      title: 'صافي التدفق سلبي',
      detail: `تستهلك أكثر مما يدخل محفظتك بحوالي ${fmt(Math.abs(net30))} ${label} خلال آخر 30 يوم.`
    });
  }

  // 2) Runway قصير (عتبات مختلفة للمالك والعضو)
  if (runwayDays != null) {
    if (isMember) {
      // العضو – غالباً allowance أسبوعي / شهري صغير
      if (runwayDays < 7) {
        alerts.push({
          severity: 'high',
          title: 'Runway قصير جداً للعضو',
          detail: 'مدة التحمل أقل من أسبوع – أي صرف إضافي بسيط قد ينهي الـ allowance بسرعة.'
        });
      } else if (runwayDays < 15) {
        alerts.push({
          severity: 'medium',
          title: 'Runway محدود للعضو',
          detail: 'مدة التحمل أقل من 15 يوم – جرّب تهدئة الصرف قليلاً لتمديدها.'
        });
      }
    } else {
      // المالك – المحفظة الرئيسية
      if (runwayDays < 30) {
        alerts.push({
          severity: 'high',
          title: 'Runway أقل من شهر',
          detail: 'مدة التحمل أقل من 30 يوم – أي صدمة بسيطة في المصاريف قد تسبب ضغطًا قويًا.'
        });
      } else if (runwayDays < 60) {
        alerts.push({
          severity: 'medium',
          title: 'Runway أقل من شهرين',
          detail: 'جرّب رفع الاحتياطي أو خفض بعض المصاريف للوصول إلى 60 يوم وأكثر.'
        });
      }
    }
  }

  // 3) قفزة في "الصرف" هذا الأسبوع مقارنة بـ 30 يوم (بدون الإيداعات)
  if (totalOut30 > 0 && totalOut7 > 0) {
    const daily30 = totalOut30 / 30;
    const daily7 = totalOut7 / 7;
    const ratio = daily7 / (daily30 || 1);
    const shareOfBalance = currentBalance > 0 ? (totalOut7 / currentBalance) : 0;

    // Thresholds مختلفة للـ Owner vs Member
    let ratioMedium, ratioHigh, shareMedium, shareHigh;
    if (isMember) {
      // العضو: نسمح بتذبذب أكبر، لكن ننتبه لو أكل نسبة كبيرة من الـ allowance
      ratioMedium = 1.2;   // +20%
      ratioHigh   = 1.5;   // +50%
      shareMedium = 0.05;  // 5% من الرصيد
      shareHigh   = 0.15;  // 15% من الرصيد
    } else {
      // المالك: محافظ كبيرة، أي قفزة 2–5% تعتبر ملحوظة
      ratioMedium = 1.3;   // +30%
      ratioHigh   = 1.7;   // +70%
      shareMedium = 0.02;  // 2% من الرصيد
      shareHigh   = 0.05;  // 5% من الرصيد
    }

    let severity = null;
    if (ratio > ratioHigh && shareOfBalance >= shareHigh) {
      severity = 'high';
    } else if (ratio > ratioMedium && shareOfBalance >= shareMedium) {
      severity = 'medium';
    }

    if (severity) {
      alerts.push({
        severity,
        title: 'هذا الأسبوع أعلى من المعتاد',
        detail: `معدل الصرف هذا الأسبوع أعلى بحوالي ${((ratio - 1) * 100).toFixed(0)}٪ من متوسط 30 يوم.`
      });
    }
  }

  // 4) تركّز عالي في فئة واحدة
  if (categoriesDisplay && categoriesDisplay.length > 0 && total30 > 0) {
    const top = categoriesDisplay[0];
    if (top.amount > total30 * 0.5) {
      alerts.push({
        severity: 'info',
        title: 'تركيز الصرف في فئة واحدة',
        detail: `أكثر من 50٪ من صرفك يذهب إلى "${prettyCategory(top.code)}".`
      });
    }
  }

  return alerts;
}

function renderRushAlertsBar(snap) {
  const bar = document.getElementById('rushAlertsBar');
  if (!bar) return;

  const alerts = computeRushAlerts(snap);

  // لو ما في تنبيهات: إخفاء وتنظيف وأيضاً إلغاء أي تايمر قديم
  if (!alerts.length) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    if (bar._rushTimer) {
      clearTimeout(bar._rushTimer);
      bar._rushTimer = null;
    }
    return;
  }

  const chips = alerts.map(a => {
    const color =
      a.severity === 'high'   ? '#b91c1c' :
      a.severity === 'medium' ? '#92400e' :
      '#1e3a8a';
    const bg =
      a.severity === 'high'   ? '#fee2e2' :
      a.severity === 'medium' ? '#fef3c7' :
      '#dbeafe';
    return `
      <div class="rush-chip" style="
        display:flex;flex-direction:column;gap:2px;
        padding:6px 10px;border-radius:999px;
        background:${bg};color:${color};
        font-size:11px;white-space:nowrap;
      ">
        <span style="font-weight:600;">${a.title}</span>
        <span>${a.detail}</span>
      </div>
    `;
  }).join('');

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;overflow-x:auto;padding:4px 0;">
      <span class="muted" style="font-size:11px;white-space:nowrap;">Rush Alerts:</span>
      ${chips}
    </div>
  `;
  bar.classList.remove('hidden');

  // ⏱️ تايمر 10 ثواني ثم إخفاء التنبيه
  if (bar._rushTimer) {
    clearTimeout(bar._rushTimer);
  }
  bar._rushTimer = setTimeout(() => {
    bar.classList.add('hidden');
    bar.innerHTML = '';
  }, 10000); // 10,000ms = 10 ثواني
}


  function updateShellVisibility() {
    const authed = !!state.authed;
    const appShell = $('#appShell');
    const welcome = $('#welcomeShell');
    if (appShell) appShell.classList.toggle('hidden', !authed);
    if (welcome) welcome.classList.toggle('hidden', authed);

    if (authed) {
      $('#onboardCard')?.classList.add('hidden');
      $('#loginCard')?.classList.add('hidden');
    }

    $('#btnLogout')?.classList.toggle('hidden', !authed);
    $('#btnSignUp')?.classList.toggle('hidden', authed);
    $('#btnSignIn')?.classList.toggle('hidden', authed);
    const bioBtn = $('#btnBioIn');
    if (bioBtn) bioBtn.classList.toggle('hidden', authed || !state.user.credId);
    const t = $('#btnTransfer');
    if (t) t.disabled = !authed;
    $('#btnDeposit') && ($('#btnDeposit').disabled = !authed);
    $('#btnWithdraw') && ($('#btnWithdraw').disabled = !authed);
    $('#btnPay') && ($('#btnPay').disabled = !authed);
  }

  function bufToB64Url(buf) {
    const b = new Uint8Array(buf); let str = ''; for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64UrlToBuf(b64url) {
    const pad = '='.repeat((4 - b64url.length % 4) % 4);
    const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
    const str = atob(b64);
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
    return buf.buffer;
  }
  function validateEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ''); }
  function validateQatarPhone(p) { return /^(\+974|974)?\d{8}$/.test((p || '').replace(/\s+/g, '')); }

  const fxData = [
    { ccy: 'USD', label: 'US', rate: 3.64 },
    { ccy: 'EUR', label: 'EU', rate: 3.95 },
    { ccy: 'GBP', label: 'GB', rate: 4.56 },
    { ccy: 'SAR', label: 'SA', rate: 0.97 },
    { ccy: 'AED', label: 'AE', rate: 1.00 },
    { ccy: 'OMR', label: 'OM', rate: 9.45 },
    { ccy: 'KWD', label: 'KW', rate: 11.75 },
    { ccy: 'BHD', label: 'BH', rate: 9.65 },
    { ccy: 'JOD', label: 'JO', rate: 5.15 },
    { ccy: 'EGP', label: 'EG', rate: 0.075 },
    { ccy: 'MAD', label: 'MA', rate: 0.37 },
    { ccy: 'TND', label: 'TN', rate: 1.17 },
    { ccy: 'DZD', label: 'DZ', rate: 0.027 },
    { ccy: 'TRY', label: 'TR', rate: 0.11 },
    { ccy: 'INR', label: 'IN', rate: 0.044 },
    { ccy: 'PKR', label: 'PK', rate: 0.013 },
    { ccy: 'CNY', label: 'CN', rate: 0.51 },
    { ccy: 'JPY', label: 'JP', rate: 0.025 },
    { ccy: 'SGD', label: 'SG', rate: 2.70 },
    { ccy: 'HKD', label: 'HK', rate: 0.47 },
    { ccy: 'CHF', label: 'CH', rate: 4.10 },
    { ccy: 'CAD', label: 'CA', rate: 2.65 },
    { ccy: 'AUD', label: 'AU', rate: 2.40 },
    { ccy: 'NZD', label: 'NZ', rate: 2.25 },
    { ccy: 'RUB', label: 'RU', rate: 0.04 },
    { ccy: 'ZAR', label: 'ZA', rate: 0.20 }
  ];

  const cityData = [
    { code: 'NY', name: 'New York', offset: -5 },
    { code: 'LDN', name: 'London', offset: 0 },
    { code: 'PAR', name: 'Paris', offset: 1 },
    { code: 'DOH', name: 'Doha', offset: 3 },
    { code: 'DXB', name: 'Dubai', offset: 4 },
    { code: 'DEL', name: 'Delhi', offset: 5.5 },
    { code: 'SGP', name: 'Singapore', offset: 8 },
    { code: 'TKY', name: 'Tokyo', offset: 9 }
  ];

  function initTickers() {
    const fxTrack = $('#fxTickerTrack');
    const timeTrack = $('#timeTickerTrack');
    if (fxTrack) renderFxTicker(fxTrack);
    if (timeTrack) renderTimeTicker(timeTrack);

    const fxSelect = $('#fxTargetCcy');
    if (fxSelect) {
      fxSelect.innerHTML = fxData
        .map(d => `<option value="${d.ccy}">${d.label} - ${d.ccy}</option>`)
        .join('');
      fxSelect.value = 'USD';
    }

    setInterval(() => {
      jiggleFxRates();
      if (fxTrack) renderFxTicker(fxTrack);
    }, 8000);
    setInterval(() => {
      if (timeTrack) renderTimeTicker(timeTrack);
    }, 20000);
  }

  function renderFxTicker(track) {
    const items = fxData.map(d => `<span class="ticker-item"><span class="ticker-label">${d.label} ${d.ccy}</span>1 = ${d.rate.toFixed(3)} QAR</span>`);
    track.innerHTML = items.join('') + items.join('');
  }

  function jiggleFxRates() {
    fxData.forEach(d => {
      const delta = (Math.random() - 0.5) * 0.01;
      d.rate = Math.max(0, d.rate + delta);
    });
  }

  function renderTimeTicker(track) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const items = cityData.map(c => {
      const date = new Date(utcMs + c.offset * 3600000);
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `<span class="ticker-item"><span class="ticker-label">${c.name}</span>${hh}:${mm}</span>`;
    });
    track.innerHTML = items.join('') + items.join('');
  }

  async function applyFxToWallets(amount, rec, dir) {
    ensureWalletStructures();
    const wallets = state.wallets || {};
    const baseCur = state.baseCurrency || 'QAR';
    const qarWallet = wallets[baseCur] || (wallets[baseCur] = { balance: 0, hold: 0 });
    const targetCur = rec.ccy;
    const targetWallet = wallets[targetCur] || (wallets[targetCur] = { balance: 0, hold: 0 });

    let outCur, outAmt, inCur, inAmt;

    if (dir === 'QAR_TO_FX') {
      outCur = baseCur;
      outAmt = amount;
      inCur = targetCur;
      inAmt = amount / rec.rate;
      if (outAmt > (qarWallet.balance || 0)) {
        msg('رصيد QAR غير كافٍ لإتمام هذا التحويل.');
        return false;
      }
      qarWallet.balance -= outAmt;
      targetWallet.balance += inAmt;
    } else {
      outCur = targetCur;
      outAmt = amount;
      inCur = baseCur;
      inAmt = amount * rec.rate;
      if (outAmt > (targetWallet.balance || 0)) {
        msg('رصيد ' + targetCur + ' غير كافٍ لإتمام هذا التحويل.');
        return false;
      }
      targetWallet.balance -= outAmt;
      qarWallet.balance += inAmt;
    }

    state.wallet.balance = qarWallet.balance;
    state.wallet.hold = qarWallet.hold || 0;
    await saveWallet();

    const now = Date.now();
    await pushTx({ ts: now, type: 'fx_out', amount: outAmt, currency: outCur, status: 'settled', actor: 'owner' });
    await pushTx({ ts: now + 1, type: 'fx_in', amount: inAmt, currency: inCur, status: 'settled', actor: 'owner' });

    if (window.BalanceChainSDK && BalanceChainSDK.mirrorToMSL) {
      try {
        await BalanceChainSDK.mirrorToMSL({ userId: state.user.id, direction: 'out', amount: outAmt, currency: outCur, ref: 'fx_out' });
        await BalanceChainSDK.mirrorToMSL({ userId: state.user.id, direction: 'in', amount: inAmt, currency: inCur, ref: 'fx_in' });
      } catch (e) {
        console.warn('FX mirror error', e);
      }
    }
    return true;
  }

  async function convertFx() {
    const amtEl = $('#fxAmount');
    const targetEl = $('#fxTargetCcy');
    const outEl = $('#fxResult');
    if (!amtEl || !targetEl || !outEl) return;

    const raw = amtEl.value.trim();
    const normalized = raw.replace(',', '.');
    const amount = Number(normalized);

    if (!raw || !isFinite(amount) || amount <= 0) {
      outEl.innerHTML = '<span class="muted">أدخل مبلغ صحيح للتحويل.</span>';
      return;
    }

    const ccy = targetEl.value;
    const rec = fxData.find(d => d.ccy === ccy);
    if (!rec) {
      outEl.innerHTML = '<span class="muted">العملة غير معروفة.</span>';
      return;
    }
    if (rec.rate <= 0) {
      outEl.innerHTML = '<span class="muted">لا يمكن الحساب لهذه العملة حالياً.</span>';
      return;
    }

    const dirInput = document.querySelector('input[name="fxDir"]:checked');
    const dir = dirInput ? dirInput.value : 'QAR_TO_FX';

    let resultLine = '';
    let detailLine = '';

    if (dir === 'QAR_TO_FX') {
      const foreign = amount / rec.rate;
      resultLine = `${amount.toFixed(2)} QAR ≈ ${foreign.toFixed(2)} ${ccy}`;
      detailLine = `1 ${ccy} = ${rec.rate.toFixed(3)} QAR (سعر تقريبي داخل الديمو)`;
    } else {
      const qars = amount * rec.rate;
      resultLine = `${amount.toFixed(2)} ${ccy} ≈ ${qars.toFixed(2)} QAR`;
      detailLine = `1 ${ccy} = ${rec.rate.toFixed(3)} QAR (سعر تقريبي داخل الديمو)`;
    }

    outEl.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:4px;">
        ${resultLine}
      </div>
      <div class="muted" style="font-size:12px;">
        ${detailLine}
      </div>
    `;

    const apply = $('#fxApplyWallets');
    if (apply && apply.checked) {
      const activeWallet = getActiveWalletRef();
      const prev = activeWallet ? (activeWallet.balance || 0) : 0;
      const ok = await applyFxToWallets(amount, rec, dir);
      if (ok) {
        render(true, prev);
        renderInsights();
        renderHistory();
      }
    }
  }

    // ---------------------------------------------
  // Money AI Insights – Bridge for money-ai-chat
  // يربط MiniBank الحقيقي مع صفحة Money AI Chat
  // ---------------------------------------------
  window.getMoneyAISnapshotForReport = getMoneyAISnapshotForReport;

  window.MoneyAIInsights = {
    // يستعمله money-ai-chat للحصول على snapshot حقيقي
    getSnapshot() {
      try {
        return getMoneyAISnapshotForReport();
      } catch (err) {
        console.warn("MoneyAIInsights.getSnapshot failed:", err);
        return null;
      }
    }

    // لو حبيت مستقبلاً تضيف محرك نصي خاص:
    // getPersonalizedAdvice(payload) {
    //   // payload = { prompt, lang, snapshot }
    //   // تقدر هنا تنادي getMoneyAICoachPlan(snapshot) وترجع نص جاهز
    //   return null;
    // }
  };


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
