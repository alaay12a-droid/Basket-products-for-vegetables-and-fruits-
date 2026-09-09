import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDashboardLogin, getDashboardMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const resetSchema = z.object({
  code: z.string().length(6, "الرمز 6 أرقام"),
  newPassword: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
});

type Step = "login" | "otp";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("login");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Local state for OTP code — completely independent from FormControl/Slot
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");

  const { mutate: login, isPending } = useDashboardLogin();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: "", newPassword: "" },
  });

  function onLogin(values: z.infer<typeof loginSchema>) {
    login({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getDashboardMeQueryKey() });
        setLocation("/");
      },
      onError: (err: unknown) => {
        const apiErr = err as { status?: number; message?: string } | null;
        const status = apiErr?.status;
        let description = "تأكد من صحة اسم المستخدم وكلمة المرور";
        if (status === 401) {
          description = "اسم المستخدم أو كلمة المرور غير صحيحة";
        } else if (status === 502 || status === 503 || status === 504) {
          description = `السيرفر يستيقظ (${status}) — انتظر 30 ثانية وحاول مجدداً`;
        } else if (status && status >= 500) {
          description = `خطأ في السيرفر (${status}) — حاول مجدداً`;
        } else if (!status) {
          description = "تعذّر الوصول للسيرفر — تحقق من الاتصال أو انتظر 30 ثانية";
        }
        toast({
          title: `فشل تسجيل الدخول${status ? ` (${status})` : ""}`,
          description,
          variant: "destructive",
        });
      }
    });
  }

  async function handleForgotPassword() {
    setSendingOtp(true);
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${apiBase}/api/dashboard/auth/forgot-password`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `خطأ ${res.status}`);
      }
      setStep("otp");
      setCodeInput("");
      setCodeError("");
      toast({ title: "تم الإرسال", description: "تحقق من بريدك الإلكتروني للحصول على الرمز" });
    } catch (err) {
      clearTimeout(timer);
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "انتهت مهلة الاتصال (60 ثانية)، حاول مرة أخرى"
          : err instanceof Error ? err.message : "حاول مرة أخرى";
      toast({ title: "فشل الإرسال", description: msg, variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleReset() {
    // Validate locally
    if (codeInput.length !== 6) {
      setCodeError("الرمز 6 أرقام");
      return;
    }
    setCodeError("");

    const newPassword = resetForm.getValues("newPassword");
    if (newPassword.length < 6) {
      resetForm.setError("newPassword", { message: "كلمة المرور 6 أحرف على الأقل" });
      return;
    }

    setResettingPw(true);
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
    try {
      const res = await fetch(`${apiBase}/api/dashboard/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطأ");
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setStep("login");
      setCodeInput("");
      resetForm.reset();
    } catch (e: unknown) {
      toast({
        title: "فشل إعادة التعيين",
        description: e instanceof Error ? e.message : "الرمز غير صحيح أو منتهي الصلاحية",
        variant: "destructive",
      });
    } finally {
      setResettingPw(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.15),transparent_40%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_bottom_left,hsl(var(--primary)/0.15),transparent_40%)]" />

      <Card className="w-full max-w-md z-10 shadow-2xl border-primary/20">
        <CardHeader className="space-y-3 text-center pt-8">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="منتجات السلة للخضار والفواكه"
            className="mx-auto h-24 w-auto object-contain"
          />
          <CardTitle className="text-2xl font-bold">
            {step === "login" ? "لوحة تحكم المطعم" : "إعادة تعيين كلمة المرور"}
          </CardTitle>
        </CardHeader>

        <CardContent className="pb-8">
          {step === "login" ? (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-6">
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المستخدم</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="أدخل اسم المستخدم"
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="username"
                          spellCheck={false}
                          {...field}
                          className="h-12"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="أدخل كلمة المرور"
                            {...field}
                            className="h-12 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-bold"
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    "تسجيل الدخول"
                  )}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={sendingOtp}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {sendingOtp ? "جارٍ الإرسال..." : "نسيت كلمة المرور؟"}
                  </button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center">
                أُرسل رمز تحقق من 6 أرقام إلى بريدك الإلكتروني — صالح لمدة 10 دقائق
              </p>

              {/* OTP field — plain native input, no FormControl/Slot wrapper */}
              <div className="space-y-2">
                <label
                  htmlFor="otp-code"
                  className="text-sm font-medium text-right block"
                >
                  رمز التحقق
                </label>
                <input
                  id="otp-code"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={codeInput}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCodeInput(v);
                    if (codeError) setCodeError("");
                  }}
                  style={{
                    direction: "ltr",
                    width: "100%",
                    height: 52,
                    textAlign: "center",
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: 10,
                    borderRadius: 8,
                    border: codeError ? "2px solid #ef4444" : "1px solid #e2e8f0",
                    outline: "none",
                    background: "#fff",
                    boxSizing: "border-box",
                    padding: "0 12px",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#C8171A";
                    e.target.style.boxShadow = "0 0 0 3px rgba(200,23,26,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = codeError ? "#ef4444" : "#e2e8f0";
                    e.target.style.boxShadow = "none";
                  }}
                />
                {codeError && (
                  <p className="text-sm font-medium text-destructive text-right">
                    {codeError}
                  </p>
                )}
              </div>

              {/* Password field via react-hook-form */}
              <Form {...resetForm}>
                <div className="space-y-6">
                  <FormField
                    control={resetForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>كلمة المرور الجديدة</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showNewPassword ? "text" : "password"}
                              placeholder="أدخل كلمة المرور الجديدة"
                              {...field}
                              className="h-12 pr-12"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}
                            >
                              {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    onClick={handleReset}
                    className="w-full h-12 text-lg font-bold"
                    disabled={resettingPw}
                  >
                    {resettingPw ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      "تغيير كلمة المرور"
                    )}
                  </Button>
                </div>
              </Form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep("login");
                    setCodeInput("");
                    setCodeError("");
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto"
                >
                  <ArrowRight className="h-4 w-4" />
                  العودة لتسجيل الدخول
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
