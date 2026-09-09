import { Resend } from "resend";

const ADMIN_EMAIL = "alaay12a@gmail.com";

export async function sendPinOtpEmail(code: string): Promise<void> {
  const apiKey = process.env.PROJECT_RESEND_API_KEY;
  if (!apiKey || apiKey === "none") throw new Error("PROJECT_RESEND_API_KEY غير مضبوط");

  const resend = new Resend(apiKey);

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#1A0A00;border-radius:12px;color:#F5E6D0">
      <h2 style="color:#E8920C;text-align:center">🔐 سلة الخضار</h2>
      <p style="font-size:15px;text-align:center">طلب تغيير رمز الدخول</p>
      <div style="background:#2A1800;border:2px solid #E8920C;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
        <p style="font-size:13px;color:#C9A86C;margin:0 0 10px">رمز التحقق</p>
        <span style="font-size:36px;font-weight:bold;color:#E8920C;letter-spacing:10px">${code}</span>
        <p style="font-size:12px;color:#9A7A5A;margin:12px 0 0">صالح لمدة 10 دقائق فقط</p>
      </div>
      <p style="font-size:12px;color:#9A7A5A;text-align:center">إذا لم تطلب هذا الرمز، تجاهل هذا البريد.</p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: "سلة الخضار <onboarding@resend.dev>",
    to: ADMIN_EMAIL,
    subject: `${code} — رمز تغيير كلمة المرور | سلة الخضار`,
    html,
  });

  if (error) throw new Error(error.message);
}
