import { useState } from "react";
import {
  useGetRevenue, useListOrders, useGetLiveRevenue,
  getGetRevenueQueryKey, getListOrdersQueryKey, getGetLiveRevenueQueryKey,
} from "@workspace/api-client-react";
import { TabOverview }   from "./tab-overview";
import { TabProducts }   from "./tab-products";
import { TabCustomers }  from "./tab-customers";
import { TabAccounting } from "./tab-accounting";
import { TabExport }     from "./tab-export";
import { TabErp }        from "./tab-erp";
import { TabDrivers }    from "./tab-drivers";

const TABS = [
  { id: "overview",   icon: "📊", label: "نظرة عامة"      },
  { id: "products",   icon: "📦", label: "الأصناف"         },
  { id: "customers",  icon: "👥", label: "العملاء تفصيل"   },
  { id: "drivers",    icon: "🛵", label: "المندوبين"        },
  { id: "accounting", icon: "🧾", label: "المحاسبة"        },
  { id: "erp",        icon: "🗂️", label: "تقارير ERP"      },
  { id: "export",     icon: "📥", label: "التصدير"         },
] as const;
type TabId = typeof TABS[number]["id"];

export default function ReportsPage() {
  const [tab, setTab] = useState<TabId>("overview");

  const { data: revenue, isLoading: revLoading } = useGetRevenue({
    query: { queryKey: getGetRevenueQueryKey(), refetchInterval: 30_000 },
  });
  const { data: liveData, isLoading: liveLoading } = useGetLiveRevenue({
    query: { queryKey: getGetLiveRevenueQueryKey(), refetchInterval: 30_000 },
  });
  const ordersParams = { limit: 500 };
  const { data: orders = [], isLoading: ordersLoading } = useListOrders(
    ordersParams,
    { query: { queryKey: getListOrdersQueryKey(ordersParams), refetchInterval: 30_000 } },
  );

  const loading = revLoading || ordersLoading || liveLoading;

  const now    = new Date();
  const dateAR = now.toLocaleDateString("ar-SA", {
    timeZone: "Asia/Riyadh", weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeAR = now.toLocaleTimeString("ar-SA", {
    timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div dir="rtl">

      {/* ── Print Header ── */}
      <div className="hidden print:block border-b pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">سلة الخضار</h1>
            <p className="text-sm text-gray-500">تبوك — حي الروضة | 0530707042</p>
          </div>
          <div className="text-xs text-gray-500 text-left">
            <p className="font-bold text-sm">تقرير المبيعات اليومي</p>
            <p>{dateAR}</p>
            <p>وقت الطباعة: {timeAR}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3 text-xs border-t pt-3">
          <div><span className="font-semibold">إجمالي المبيعات: </span>{revenue?.today.totalRevenue?.toLocaleString("ar-SA")} ر.س</div>
          <div><span className="font-semibold">صافي الإيرادات: </span>{revenue?.today.netRevenue?.toLocaleString("ar-SA")} ر.س</div>
          <div><span className="font-semibold">ضريبة 15%: </span>{revenue?.today.taxAmount?.toLocaleString("ar-SA")} ر.س</div>
          <div><span className="font-semibold">عدد الفواتير: </span>{revenue?.today.orderCount}</div>
        </div>
      </div>

      {/* ── Screen Header ── */}
      <div className="print:hidden flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>📊</span> لوحة المبيعات والتقارير
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{dateAR} · الساعة {timeAR}</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
              جاري التحديث…
            </span>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 bg-background hover:bg-muted transition-colors font-medium"
          >
            🖨️ طباعة / PDF
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="print:hidden border-b mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div>

        {/* Screen: active tab only */}
        <div className="print:hidden">
          {tab === "overview" && (
            <TabOverview
              today={revenue?.today}
              live={liveData}
              daily={revenue?.dailyBreakdown ?? []}
              loading={loading}
            />
          )}
          {tab === "products" && (
            <TabProducts orders={orders} loading={ordersLoading} />
          )}
          {tab === "customers" && (
            <TabCustomers orders={orders} loading={ordersLoading} />
          )}
          {tab === "accounting" && (
            <TabAccounting
              today={revenue?.today}
              week={revenue?.week}
              month={revenue?.month}
              year={revenue?.year}
              orders={orders}
              loading={loading}
            />
          )}
          {tab === "drivers" && (
            <TabDrivers />
          )}
          {tab === "erp" && (
            <TabErp orders={orders} loading={ordersLoading} />
          )}
          {tab === "export" && (
            <TabExport
              today={revenue?.today}
              year={revenue?.year}
              orders={orders}
            />
          )}
        </div>

        {/* Print: all sections at once — only rendered after data loads */}
        {!loading && (
          <div className="hidden print:block space-y-10">
            <TabOverview
              today={revenue?.today}
              live={liveData}
              daily={revenue?.dailyBreakdown ?? []}
              loading={false}
            />
            <div className="border-t pt-8">
              <h2 className="text-lg font-bold mb-4">تقرير الأصناف</h2>
              <TabProducts orders={orders} loading={false} />
            </div>
            <div className="border-t pt-8">
              <h2 className="text-lg font-bold mb-4">تقرير العملاء</h2>
              <TabCustomers orders={orders} loading={false} />
            </div>
            <div className="border-t pt-8">
              <h2 className="text-lg font-bold mb-4">الحسابات والمطابقة</h2>
              <TabAccounting
                today={revenue?.today}
                week={revenue?.week}
                month={revenue?.month}
                year={revenue?.year}
                orders={orders}
                loading={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Print Footer ── */}
      <div className="hidden print:block border-t mt-8 pt-4 text-center text-xs text-gray-400 px-4">
        <p>سلة الخضار — جميع المبالغ بالريال السعودي شاملة ضريبة القيمة المضافة 15%</p>
        <p>طُبع بتاريخ {dateAR} الساعة {timeAR}</p>
      </div>
    </div>
  );
}
