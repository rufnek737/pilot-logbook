(function () {
  'use strict';

  const API_BASE = 'https://crewconnex.tae26001.workers.dev';
  const PRODUCTS = {
    monthly: 'com.rufnek.pilotlogbook.autoimport.monthly',
    annual: 'com.rufnek.pilotlogbook.autoimport.annual',
  };
  let status = null;
  let products = [];
  let loadingProducts = false;
  let activeNoticeKind = '';
  let noticeTimer = null;

  function plugin() {
    return window.Capacitor?.Plugins?.NativePurchases || null;
  }

  function isNativeIOS() {
    return Boolean(window.Capacitor?.isNativePlatform?.())
      && window.Capacitor?.getPlatform?.() === 'ios';
  }

  async function idToken() {
    if (!window.auth?.currentUser) throw new Error('로그인한 뒤 이용해 주세요.');
    return window.auth.currentUser.getIdToken();
  }

  async function api(path, options) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${await idToken()}`,
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || '구독 정보를 확인하지 못했습니다.');
      error.code = body.code;
      throw error;
    }
    return body;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp)).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  function renderStatus(nextStatus) {
    if (nextStatus) status = nextStatus;
    const usedCount = Math.max(0, Number(status?.usedCount) || 0);
    const freeLimit = Math.max(1, Number(status?.freeLimit) || 100);
    const remaining = Math.max(0, Number.isFinite(Number(status?.remaining)) ? Number(status.remaining) : freeLimit - usedCount);
    const text = status?.active
      ? `구독 이용 중 · ${formatDate(status.expiresAt)}까지`
      : `자동 가져오기 무료 ${status?.remaining ?? 100}편 남음`;
    document.querySelectorAll('[data-billing-status]').forEach(el => { el.textContent = text; });
    document.querySelectorAll('[data-billing-used]').forEach(el => {
      el.textContent = status?.active
        ? 'CrewConnex 자동 가져오기 무제한'
        : `${status?.usedCount ?? 0} / ${status?.freeLimit ?? 100}편 사용`;
    });
    const activePanel = document.getElementById('billingActivePanel');
    const purchasePanel = document.getElementById('billingPurchasePanel');
    if (activePanel) activePanel.style.display = status?.active ? '' : 'none';
    if (purchasePanel) purchasePanel.style.display = status?.active ? 'none' : '';
    const expiry = document.getElementById('billingExpiry');
    if (expiry && status?.active) expiry.textContent = `${formatDate(status.expiresAt)}까지 자동 가져오기를 무제한 이용할 수 있습니다.`;
    const overviewTitle = document.getElementById('billingOverviewTitle');
    const overviewUsed = document.getElementById('billingOverviewUsed');
    const overviewRemaining = document.getElementById('billingOverviewRemaining');
    const progressTrack = document.getElementById('billingProgressTrack');
    const progressFill = document.getElementById('billingProgressFill');
    const progress = status?.active ? 100 : Math.min(100, Math.round((usedCount / freeLimit) * 100));
    if (overviewTitle) overviewTitle.textContent = status?.active ? '✈️ 자동 가져오기 무제한' : '✈️ 자동 가져오기 무료 이용';
    if (overviewUsed) overviewUsed.textContent = status?.active ? '구독 이용 중' : `${Math.min(usedCount, freeLimit)} / ${freeLimit}편 사용`;
    if (overviewRemaining) overviewRemaining.textContent = status?.active ? '구독 활성화 · 구독 자세히' : `${remaining}편 남음 · 구독 자세히`;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(progress));
    if (progressFill) progressFill.style.width = `${progress}%`;
  }

  async function refreshStatus(silent) {
    try {
      renderStatus(await api('/billing/status', { method: 'GET' }));
      if (!status?.active) await syncStoreEntitlement();
      scheduleNotice();
      return status;
    } catch (error) {
      if (!silent) window.showToast?.(error.message, 3500);
      return status;
    }
  }

  async function recordImports(flights) {
    if (!Array.isArray(flights) || !flights.length) return status;
    renderStatus(await api('/billing/imports', {
      method: 'POST',
      body: JSON.stringify({ flights }),
    }));
    scheduleNotice();
    return status;
  }

  function noticeStorageKey(kind) {
    const uid = window.auth?.currentUser?.uid || 'guest';
    return `pilotLogbookBillingNotice:v1:${uid}:${kind}`;
  }

  function nextNoticeKind() {
    if (!window.auth?.currentUser || status?.active) return '';
    const used = Math.max(0, Number(status?.usedCount) || 0);
    const threshold = used >= 100 ? 100 : used >= 90 ? 90 : used >= 80 ? 80 : 0;
    const milestone = threshold ? `milestone-${threshold}` : '';
    if (milestone && localStorage.getItem(noticeStorageKey(milestone)) !== 'seen') return milestone;
    return localStorage.getItem(noticeStorageKey('intro')) === 'seen' ? '' : 'intro';
  }

  function showNotice(kind) {
    const overlay = document.getElementById('billingNoticeOverlay');
    if (!overlay || !kind) return;
    const used = Math.min(Math.max(0, Number(status?.usedCount) || 0), Number(status?.freeLimit) || 100);
    const remaining = Math.max(0, Number(status?.remaining ?? 100));
    const title = document.getElementById('billingNoticeTitle');
    const lead = document.getElementById('billingNoticeLead');
    if (kind === 'intro') {
      title.textContent = '✈️ 자동 가져오기 이용 안내';
      lead.textContent = '처음 100편까지 결제 없이 자동으로 가져올 수 있습니다.';
    } else {
      title.textContent = `✈️ 자동 가져오기 ${used}편 사용`;
      lead.textContent = remaining > 0
        ? `무료 자동 가져오기가 ${remaining}편 남았습니다. 필요할 때 구독을 확인해 주세요.`
        : '무료 자동 가져오기 100편을 모두 사용했습니다. 구독하면 계속 무제한으로 가져올 수 있습니다.';
    }
    activeNoticeKind = kind;
    overlay.classList.add('show');
    window.syncBodyScrollLock?.();
  }

  function scheduleNotice() {
    clearTimeout(noticeTimer);
    const kind = nextNoticeKind();
    if (!kind) return;
    noticeTimer = setTimeout(() => {
      if (document.querySelector('.modal-overlay.show')) return;
      showNotice(kind);
    }, 700);
  }

  function closeNotice() {
    const overlay = document.getElementById('billingNoticeOverlay');
    if (activeNoticeKind) localStorage.setItem(noticeStorageKey(activeNoticeKind), 'seen');
    activeNoticeKind = '';
    overlay?.classList.remove('show');
    window.syncBodyScrollLock?.();
  }

  function openFromNotice() {
    closeNotice();
    open();
  }

  function productById(id) {
    return products.find(product => product.identifier === id);
  }

  function renderProducts() {
    const monthly = productById(PRODUCTS.monthly);
    const annual = productById(PRODUCTS.annual);
    const monthlyButton = document.getElementById('billingMonthlyButton');
    const annualButton = document.getElementById('billingAnnualButton');
    if (monthlyButton) {
      monthlyButton.disabled = !monthly;
      monthlyButton.innerHTML = monthly
        ? `<strong>${monthly.title}</strong><span>${monthly.priceString} / 월</span>`
        : '<strong>월간 구독</strong><span>App Store 정보 준비 중</span>';
    }
    if (annualButton) {
      annualButton.disabled = !annual;
      annualButton.innerHTML = annual
        ? `<strong>${annual.title}</strong><span>${annual.priceString} / 년</span>`
        : '<strong>연간 구독</strong><span>App Store 정보 준비 중</span>';
    }
  }

  async function loadProducts() {
    if (loadingProducts || status?.active) return;
    loadingProducts = true;
    try {
      if (!isNativeIOS() || !plugin()) {
        document.getElementById('billingPlatformNotice').textContent = '구독 구매는 iPhone 앱에서 가능합니다.';
        return;
      }
      const support = await plugin().isBillingSupported();
      if (!support.isBillingSupported) throw new Error('이 기기에서 App Store 결제를 사용할 수 없습니다.');
      const result = await plugin().getProducts({
        productIdentifiers: Object.values(PRODUCTS),
        productType: 'subs',
      });
      products = result.products || [];
      renderProducts();
      document.getElementById('billingPlatformNotice').textContent = products.length
        ? '결제는 Apple ID로 처리되며 설정에서 언제든 해지할 수 있습니다.'
        : 'App Store 상품 정보를 불러오지 못했습니다. 상품 등록 상태를 확인해 주세요.';
    } catch (error) {
      document.getElementById('billingPlatformNotice').textContent = error.message || 'App Store 상품 정보를 불러오지 못했습니다.';
    } finally {
      loadingProducts = false;
    }
  }

  async function accountToken() {
    const uid = window.auth?.currentUser?.uid || '';
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pilot-logbook:${uid}`)));
    const hex = [...bytes.slice(0, 16)].map(value => value.toString(16).padStart(2, '0')).join('').split('');
    hex[12] = '5';
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  async function verifyTransaction(transaction) {
    if (!transaction?.transactionId) throw new Error('Apple 거래번호를 확인하지 못했습니다.');
    renderStatus(await api('/billing/verify', {
      method: 'POST',
      body: JSON.stringify({ transactionId: String(transaction.transactionId) }),
    }));
  }

  async function currentStoreEntitlement() {
    if (!plugin() || !isNativeIOS()) return null;
    const result = await plugin().getPurchases({
      productType: 'subs',
      appAccountToken: await accountToken(),
      onlyCurrentEntitlements: true,
    });
    return (result.purchases || [])
      .filter(item => Object.values(PRODUCTS).includes(item.productIdentifier) && item.isActive !== false)
      .sort((a, b) => new Date(b.expirationDate || 0) - new Date(a.expirationDate || 0))[0] || null;
  }

  async function syncStoreEntitlement() {
    try {
      const transaction = await currentStoreEntitlement();
      if (transaction) await verifyTransaction(transaction);
    } catch (error) {
      console.warn('StoreKit entitlement sync failed:', error);
    }
    return status;
  }

  async function purchase(plan) {
    const productId = PRODUCTS[plan];
    if (!productById(productId) || !plugin()) return;
    const button = document.getElementById(plan === 'monthly' ? 'billingMonthlyButton' : 'billingAnnualButton');
    if (button) button.disabled = true;
    try {
      const transaction = await plugin().purchaseProduct({
        productIdentifier: productId,
        productType: 'subs',
        appAccountToken: await accountToken(),
      });
      await verifyTransaction(transaction);
      window.showToast?.('구독이 활성화되었습니다', 3500);
    } catch (error) {
      if (!/cancel/i.test(String(error?.message || error))) {
        window.showToast?.(error?.message || '구매를 완료하지 못했습니다.', 4000);
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function restore() {
    if (!plugin() || !isNativeIOS()) {
      window.showToast?.('구매 복원은 iPhone 앱에서 가능합니다.', 3500);
      return;
    }
    try {
      await plugin().restorePurchases();
      const transaction = await currentStoreEntitlement();
      if (!transaction) throw new Error('복원할 활성 구독이 없습니다.');
      await verifyTransaction(transaction);
      window.showToast?.('구매를 복원했습니다', 3500);
    } catch (error) {
      window.showToast?.(error?.message || '구매를 복원하지 못했습니다.', 4000);
    }
  }

  async function manage() {
    try { await plugin()?.manageSubscriptions(); }
    catch (error) { window.showToast?.(error?.message || '구독 관리 화면을 열지 못했습니다.', 3500); }
  }

  async function open() {
    window.closeAccountMenu?.();
    document.getElementById('billingModalOverlay').classList.add('show');
    window.syncBodyScrollLock?.();
    document.getElementById('billingPlatformNotice').textContent = '구독 상태를 확인하고 있습니다…';
    await refreshStatus(true);
    await loadProducts();
  }

  function close() {
    document.getElementById('billingModalOverlay').classList.remove('show');
    window.syncBodyScrollLock?.();
  }

  function onAuthChanged(user) {
    if (user) refreshStatus(true);
    else {
      clearTimeout(noticeTimer);
      activeNoticeKind = '';
      document.getElementById('billingNoticeOverlay')?.classList.remove('show');
      status = null;
      renderStatus({ active: false, usedCount: 0, freeLimit: 100, remaining: 100 });
    }
  }

  window.PilotLogbookBilling = {
    open, close, closeNotice, openFromNotice, purchase, restore, manage,
    refreshStatus, recordImports, renderStatus, onAuthChanged, syncStoreEntitlement,
  };
})();
