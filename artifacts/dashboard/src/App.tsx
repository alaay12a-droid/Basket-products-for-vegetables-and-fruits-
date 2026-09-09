import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import Orders from "@/pages/orders";
import Login from "@/pages/login";
import Drivers from "@/pages/drivers";
import MenuManagement from "@/pages/menu-management";
import SalesReports from "@/pages/reports";
import MandoobPortal from "@/pages/mandoob";
import Broadcast from "@/pages/broadcast";
import Cashier from "@/pages/cashier";
import AdminPanel from "@/pages/admin";
import AuthDiagnostics from "@/pages/auth-diagnostics";
import PrivacyPolicy from "@/pages/privacy-policy";
import DriverRankings from "@/pages/driver-rankings";
import Branches from "@/pages/branches";
import Users from "@/pages/users";
import { setBaseUrl } from "@workspace/api-client-react";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
if (apiBase) setBaseUrl(apiBase);

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/mandoob" component={MandoobPortal} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/">
        <Layout>
          <Home />
        </Layout>
      </Route>
      <Route path="/orders">
        <Layout fullWidth>
          <Orders />
        </Layout>
      </Route>
      <Route path="/drivers">
        <Layout>
          <Drivers />
        </Layout>
      </Route>
      <Route path="/menu">
        <Layout>
          <MenuManagement />
        </Layout>
      </Route>
      <Route path="/broadcast">
        <Layout><Broadcast /></Layout>
      </Route>
      <Route path="/reports">
        <Layout>
          <SalesReports />
        </Layout>
      </Route>
      <Route path="/cashier" component={Cashier} />
      <Route path="/admin">
        <Layout><AdminPanel /></Layout>
      </Route>
      <Route path="/auth-diagnostics">
        <Layout><AuthDiagnostics /></Layout>
      </Route>
      <Route path="/drivers/rankings">
        <Layout><DriverRankings /></Layout>
      </Route>
      <Route path="/branches">
        <Layout><Branches /></Layout>
      </Route>
      <Route path="/users">
        <Layout><Users /></Layout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <div dir="rtl" translate="no" className="notranslate min-h-screen text-right font-sans antialiased bg-background text-foreground">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
