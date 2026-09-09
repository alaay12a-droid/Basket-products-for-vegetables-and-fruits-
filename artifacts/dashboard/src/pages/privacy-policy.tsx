export default function PrivacyPolicy() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10 leading-relaxed">
        <h1 className="mb-2 text-2xl font-bold text-primary">سياسة الخصوصية — سلة الخضار</h1>
        <p className="mb-8 text-sm text-muted-foreground">آخر تحديث: 9 يوليو 2026</p>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">1. جمع بيانات الموقع الجغرافي في الخلفية</h2>
          <p>
            يجمع تطبيق "سلة الخضار" (تطبيق المندوب) بيانات الموقع الجغرافي أثناء تشغيل التطبيق وفي الخلفية،
            وذلك فقط عندما يكون المستخدم مسجّلاً كمندوب توصيل نشط ويقوم بتنفيذ طلب توصيل حالي.
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">2. لماذا يتم جمع هذه البيانات؟</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>عرض موقع المندوب المباشر (Live Tracking) للعميل ولإدارة المطعم.</li>
            <li>متابعة حالة التوصيل وتحسين دقة تقدير وقت الوصول.</li>
            <li>ضمان تنفيذ طلبات التوصيل بكفاءة وموثوقية.</li>
          </ul>
          <p>لا يتم استخدام بيانات الموقع لأي غرض إعلاني أو تسويقي، ولا تتم مشاركتها مع أي طرف ثالث لأغراض تجارية.</p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">3. متى يبدأ جمع بيانات الموقع؟</h2>
          <p>
            يبدأ تتبع الموقع فقط بعد أن يوافق المندوب صريحاً على شاشة الإفصاح داخل التطبيق (بالضغط على "متابعة")
            ويقوم باستلام طلب توصيل نشط (عند تغيير حالة الطلب إلى "تم الاستلام").
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">4. متى يتوقف جمع بيانات الموقع؟</h2>
          <p>يتوقف تتبع الموقع تلقائياً وفوراً في أي من الحالات التالية:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>عند تسليم الطلب وإنهاء التوصيل.</li>
            <li>عند إيقاف المندوب لخيار "مشاركة الموقع" يدوياً من داخل التطبيق.</li>
            <li>عند تسجيل خروج المندوب من التطبيق.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">5. كيفية تخزين البيانات وحمايتها والاحتفاظ بها</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>يتم إرسال بيانات الموقع (خط الطول والعرض فقط) عبر اتصال مشفّر (HTTPS/TLS) إلى خادم سلة الخضار.</li>
            <li>تُخزَّن بيانات الموقع الحالية للمندوب مرتبطة فقط بالطلب النشط قيد التوصيل، ولا تُخزَّن كسجل تتبع دائم لمسار المندوب.</li>
            <li>يُستبدل آخر موقع مُسجَّل تلقائياً بموقع جديد كل عدة ثوانٍ أثناء التوصيل، ولا يُحتفظ بسجل تاريخي مفصّل لمسار الحركة.</li>
            <li>الوصول إلى بيانات الموقع مقيّد بموظفي إدارة المطعم والكاشير المخوّلين فقط عبر لوحة تحكم محمية بكلمة مرور.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">6. حقوق المستخدم (المندوب)</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>يحق للمندوب إيقاف مشاركة الموقع في أي وقت من داخل التطبيق.</li>
            <li>يحق للمندوب طلب حذف بياناته الشخصية عبر التواصل مع إدارة المطعم على واتساب: 966530707042.</li>
            <li>رفض إذن الموقع في الخلفية لا يمنع استخدام باقي ميزات التطبيق، لكنه يعطّل ميزة التتبع المباشر للعميل خلال التوصيل.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">7. التواصل معنا</h2>
          <p>
            لأي استفسار يخص هذه السياسة أو بياناتك الشخصية، يمكنك التواصل معنا عبر واتساب: 966530707042
            أو الهاتف: 0530707042 — سلة الخضار، تبوك، حي الروضة.
          </p>
        </section>

        <hr className="my-10 border-border" />

        <h1 className="mb-2 text-2xl font-bold text-primary" dir="ltr">Privacy Policy — Salat Al Khodar</h1>
        <p className="mb-8 text-sm text-muted-foreground" dir="ltr">Last updated: July 9, 2026</p>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">1. Background Location Data Collection</h2>
          <p>
            The Salat Al Khodar driver app collects location data while the app is in use and in the background,
            only when the user is logged in as an active delivery driver and is fulfilling an active delivery order.
          </p>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">2. Why We Collect This Data</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>To show the driver's live location to the customer and restaurant management.</li>
            <li>To track delivery progress and improve estimated arrival time accuracy.</li>
            <li>To ensure efficient and reliable execution of delivery orders.</li>
          </ul>
          <p>Location data is never used for advertising or marketing purposes, and is never sold or shared with third parties for commercial purposes.</p>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">3. When Tracking Starts</h2>
          <p>
            Location tracking begins only after the driver explicitly consents on the in-app disclosure screen (by tapping
            "Continue") and picks up an active delivery order (order status changes to "picked up").
          </p>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">4. When Tracking Stops</h2>
          <p>Location tracking stops automatically and immediately when:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>The order is marked as delivered.</li>
            <li>The driver manually turns off "share location" within the app.</li>
            <li>The driver logs out of the app.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">5. How Data Is Stored, Protected, and Retained</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Location data (latitude/longitude only) is transmitted over an encrypted connection (HTTPS/TLS) to the Salat Al Khodar server.</li>
            <li>Only the driver's current location for the active order is stored — it is not retained as a permanent route history.</li>
            <li>The last recorded location is overwritten every few seconds during delivery; no detailed historical movement log is kept.</li>
            <li>Access to location data is restricted to authorized restaurant management and cashier staff via a password-protected dashboard.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">6. Your Rights</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>You may disable location sharing at any time from within the app.</li>
            <li>You may request deletion of your personal data by contacting restaurant management via WhatsApp: 966530707042.</li>
            <li>Denying background location permission does not block the rest of the app's features, but disables live tracking during delivery.</li>
          </ul>
        </section>

        <section className="mb-8 space-y-3" dir="ltr">
          <h2 className="text-lg font-bold">7. Contact Us</h2>
          <p>
            For any questions about this policy or your personal data, contact us via WhatsApp: 966530707042
            or phone: 0530707042 — Salat Al Khodar, Tabuk, Al-Rawdah District.
          </p>
        </section>
      </div>
    </div>
  );
}
