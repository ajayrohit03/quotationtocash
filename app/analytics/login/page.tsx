import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/auth";
import { LoginForm } from "@/app/admin/login/login-form";

export default async function AnalyticsLoginPage() {
  if (await isAdminSession()) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="font-display text-2xl font-bold">QuotationToCash analytics</h1>
      <p className="mt-1 text-sm text-slate-400">Enter the admin password to continue.</p>
      <LoginForm redirectTo="/" />
    </main>
  );
}
