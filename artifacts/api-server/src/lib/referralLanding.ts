/**
 * Generates the Arabic referral landing page HTML.
 * Served at GET / when ?ref=... is present, or as a general app download page.
 */
export function buildReferralPage(ref: string | undefined): string {
  const code = (ref ?? "").toUpperCase().trim();
  const hasCode = code.startsWith("REF") && code.length > 3;

  const iosUrl = "https://apps.apple.com/app/id6792793006";
  const androidUrl = "https://play.google.com/store/apps/details?id=com.rwabi.almndi";

  // Deep link into onboarding screen with the ref param
  const iosDeepLink = hasCode
    ? `rawabi-menu://onboarding?ref=${encodeURIComponent(code)}`
    : `rawabi-menu://`;
  // Android intent URL — falls back to Play Store if not installed
  const androidDeepLink = hasCode
    ? `intent://onboarding?ref=${encodeURIComponent(code)}#Intent;scheme=rawabi-menu;package=com.rwabi.almndi;S.browser_fallback_url=${encodeURIComponent(androidUrl)};end`
    : `intent://#Intent;scheme=rawabi-menu;package=com.rwabi.almndi;S.browser_fallback_url=${encodeURIComponent(androidUrl)};end`;

  const title = hasCode ? "دعوة للانضمام إلى منتجات السلة للخضار والفواكه 🎁" : "منتجات السلة للخضار والفواكه — خضار طازجة في تبوك";
  const metaDesc = hasCode
    ? `صديقك يدعوك للانضمام إلى تطبيق منتجات السلة للخضار والفواكه، استخدم كود ${code} للحصول على المكافأة`
    : "اطلب خضارك الطازجة في تبوك من تطبيق منتجات السلة للخضار والفواكه";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <title>${title}</title>
  <meta name="description" content="${metaDesc}"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${metaDesc}"/>
  <meta property="og:image" content="/dashboard/opengraph.jpg"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', system-ui, sans-serif;
      background: #0F0A05;
      color: #F5E6C8;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px;
      position: relative;
      overflow-x: hidden;
    }
    /* Subtle decorative glow */
    body::before {
      content: '';
      position: fixed;
      top: -30%;
      left: 50%;
      transform: translateX(-50%);
      width: 80vw;
      height: 60vh;
      background: radial-gradient(ellipse, rgba(232,146,12,0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .card {
      position: relative;
      z-index: 1;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(232,146,12,0.2);
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 0 60px rgba(232,146,12,0.06);
    }
    /* Logo mark */
    .logo-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 28px;
    }
    .logo-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #E8920C, #C8171A);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      flex-shrink: 0;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 800;
      color: #E8920C;
      line-height: 1.2;
      text-align: right;
    }
    .logo-sub {
      font-size: 11px;
      font-weight: 500;
      color: rgba(245,230,200,0.5);
      letter-spacing: 0.5px;
    }
    /* Invite banner */
    .invite-banner {
      display: ${hasCode ? "block" : "none"};
      background: linear-gradient(135deg, rgba(200,23,26,0.15), rgba(232,146,12,0.10));
      border: 1px solid rgba(232,146,12,0.3);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .invite-label {
      font-size: 13px;
      color: rgba(245,230,200,0.6);
      margin-bottom: 4px;
    }
    .invite-title {
      font-size: 18px;
      font-weight: 800;
      color: #F5E6C8;
    }
    /* Code box */
    .code-section {
      display: ${hasCode ? "block" : "none"};
      margin-bottom: 28px;
    }
    .code-label {
      font-size: 12px;
      color: rgba(245,230,200,0.5);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .code-box {
      background: rgba(232,146,12,0.1);
      border: 2px dashed rgba(232,146,12,0.4);
      border-radius: 12px;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .code-value {
      font-size: 26px;
      font-weight: 900;
      color: #E8920C;
      letter-spacing: 3px;
      font-variant-numeric: tabular-nums;
    }
    .copy-btn {
      background: rgba(232,146,12,0.15);
      border: 1px solid rgba(232,146,12,0.3);
      border-radius: 8px;
      color: #E8920C;
      padding: 6px 10px;
      font-size: 12px;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .copy-btn:hover { background: rgba(232,146,12,0.25); }
    /* Headline */
    .headline {
      font-size: 22px;
      font-weight: 800;
      color: #F5E6C8;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .sub {
      font-size: 14px;
      color: rgba(245,230,200,0.55);
      margin-bottom: 28px;
      line-height: 1.7;
    }
    /* Open app button */
    .open-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 16px 20px;
      background: linear-gradient(135deg, #E8920C, #C8171A);
      color: #fff;
      font-family: inherit;
      font-size: 17px;
      font-weight: 800;
      border: none;
      border-radius: 14px;
      cursor: pointer;
      text-decoration: none;
      margin-bottom: 14px;
      transition: opacity 0.15s, transform 0.1s;
      box-shadow: 0 4px 24px rgba(232,146,12,0.3);
    }
    .open-btn:active { opacity: 0.85; transform: scale(0.98); }
    /* Store buttons */
    .stores {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .store-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 13px 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      color: #F5E6C8;
      font-family: inherit;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      transition: background 0.15s;
    }
    .store-btn:hover { background: rgba(255,255,255,0.1); }
    .store-btn svg { flex-shrink: 0; }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0;
      color: rgba(245,230,200,0.25);
      font-size: 12px;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(245,230,200,0.1);
    }
    /* Loading state */
    .loading-wrap {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 20px 0;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(232,146,12,0.2);
      border-top-color: #E8920C;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { font-size: 14px; color: rgba(245,230,200,0.55); }
    /* No-code variant */
    .no-code-banner {
      display: ${hasCode ? "none" : "block"};
      font-size: 32px;
      margin-bottom: 16px;
    }
    footer {
      position: relative;
      z-index: 1;
      margin-top: 24px;
      font-size: 11px;
      color: rgba(245,230,200,0.2);
    }
  </style>
</head>
<body>
  <div class="card">
    <!-- Logo -->
    <div class="logo-wrap">
      <div>
        <div class="logo-text">منتجات السلة للخضار والفواكه</div>
        <div class="logo-sub">تبوك — Tabuk</div>
      </div>
      <div class="logo-icon">🍖</div>
    </div>

    <!-- Invite banner (shown only when ref present) -->
    <div class="invite-banner">
      <div class="invite-label">لديك دعوة من صديق 🎁</div>
      <div class="invite-title">انضم واستفد من مكافأة الإحالة</div>
    </div>

    <!-- No-code emoji -->
    <div class="no-code-banner">📲</div>

    <!-- Headline -->
    <div class="headline">${hasCode ? "حمّل التطبيق وسجّل الآن" : "منتجات السلة للخضار والفواكه"}</div>
    <div class="sub">${hasCode
      ? "خضار طازجة في تبوك تصلك إلى باب البيت"
      : "اطلب خضارك الطازجة مباشرة من هاتفك"
    }</div>

    <!-- Referral code box -->
    <div class="code-section">
      <div class="code-label">كود الإحالة الخاص بك</div>
      <div class="code-box">
        <span class="code-value">${code}</span>
        <button class="copy-btn" onclick="copyCode()">نسخ</button>
      </div>
    </div>

    <!-- Loading state while trying to open app -->
    <div class="loading-wrap" id="loading">
      <div class="spinner"></div>
      <div class="loading-text">جاري فتح التطبيق...</div>
    </div>

    <!-- Action area -->
    <div id="actions">
      <a class="open-btn" id="openBtn" href="#">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path d="M12 18.5A6.5 6.5 0 1 0 12 5.5a6.5 6.5 0 0 0 0 13ZM12 5.5V2M12 2l-2 2.5M12 2l2 2.5"/>
        </svg>
        فتح التطبيق
      </a>

      <div class="divider">أو حمّل التطبيق</div>

      <div class="stores">
        <a class="store-btn" href="${iosUrl}" target="_blank">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          تحميل من App Store
        </a>
        <a class="store-btn" href="${androidUrl}" target="_blank">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="m3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12 3.84 21.85C3.34 21.6 3 21.09 3 20.5m13.81-4.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49Z"/>
          </svg>
          تحميل من Google Play
        </a>
      </div>
    </div>
  </div>

  <footer>منتجات السلة للخضار والفواكه &copy; ${new Date().getFullYear()}</footer>

  <script>
    (function () {
      var ua = navigator.userAgent;
      var isAndroid = /Android/i.test(ua);
      var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var isMobile = isAndroid || isIOS;

      var iosDeep  = ${JSON.stringify(iosDeepLink)};
      var droidDeep = ${JSON.stringify(androidDeepLink)};
      var iosStore  = ${JSON.stringify(iosUrl)};
      var droidStore = ${JSON.stringify(androidUrl)};
      var refCode   = ${JSON.stringify(code)};

      // Store code in localStorage as fallback for web flow
      if (refCode) {
        try { localStorage.setItem('rawabi_pending_referral', refCode); } catch(e) {}
      }

      var openBtn = document.getElementById('openBtn');
      var loading = document.getElementById('loading');
      var actions = document.getElementById('actions');

      function tryOpenApp() {
        var deepLink = isIOS ? iosDeep : (isAndroid ? droidDeep : null);
        if (!deepLink) return;

        loading.style.display = 'flex';
        actions.style.display = 'none';

        window.location.href = deepLink;

        // If app not installed, after 2.5s show the download page
        setTimeout(function () {
          loading.style.display = 'none';
          actions.style.display = 'block';
        }, 2500);
      }

      // Set the open button href and click handler
      if (isMobile) {
        openBtn.href = isIOS ? iosDeep : droidDeep;
        openBtn.addEventListener('click', function (e) {
          e.preventDefault();
          tryOpenApp();
        });
        // Auto-try on load if on mobile and has a ref code
        if (refCode) {
          // Slight delay so page renders first
          setTimeout(tryOpenApp, 600);
        }
      } else {
        // Desktop: change button to just open store
        openBtn.textContent = '⬇ تحميل التطبيق';
        openBtn.href = iosStore;
        openBtn.target = '_blank';
      }

      // Copy code helper
      window.copyCode = function () {
        if (!refCode) return;
        navigator.clipboard && navigator.clipboard.writeText(refCode).then(function () {
          var btn = document.querySelector('.copy-btn');
          if (btn) { btn.textContent = 'تم ✓'; setTimeout(function () { btn.textContent = 'نسخ'; }, 2000); }
        }).catch(function () {});
      };
    })();
  </script>
</body>
</html>`;
}
