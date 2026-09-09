import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useDashboardMe, useDashboardLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getDashboardMeQueryKey } from "@workspace/api-client-react";
import { Loader2, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  "/":                  "الرئيسية",
  "/orders":            "الطلبات",
  "/drivers":           "المناديب",
  "/drivers/rankings":  "ترتيب المناديب",
  "/menu":              "القائمة",
  "/reports":           "تقارير المبيعات",
  "/broadcast":         "إشعار جماعي",
  "/cashier":           "لوحة الكاشير",
  "/admin":             "لوحة الإدارة",
  "/auth-diagnostics":  "تشخيص المصادقة",
  "/branches":          "إدارة الفروع",
  "/users":             "إدارة المستخدمين",
};

export function Layout({ children, fullWidth = false }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { mutate: logout } = useDashboardLogout();
  const queryClient = useQueryClient();

  const { data: user, isLoading, isError } = useDashboardMe({
    query: { retry: false, queryKey: getDashboardMeQueryKey() }
  });

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading || isError || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isHome = location === "/";
  const pageTitle = PAGE_TITLES[location] ?? "";

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getDashboardMeQueryKey() });
        setLocation("/login");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Back button on inner pages */}
          {!isHome && (
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="h-4 w-4" />
                <span className="hidden sm:inline">رئيسية</span>
              </button>
            </Link>
          )}
          {/* Logo / brand */}
          <div className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="منتجات السلة للخضار والفواكه"
              className="h-9 w-auto object-contain"
            />
            {!isHome && (
              <span className="font-bold text-primary text-base tracking-tight">
                {pageTitle}
              </span>
            )}
          </div>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="sm" onClick={handleLogout}
          className="gap-2 text-muted-foreground hover:text-foreground text-xs">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">خروج</span>
        </Button>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className={fullWidth ? "w-full" : "mx-auto w-full max-w-5xl"}>
          {children}
        </div>
      </main>

    </div>
  );
}
