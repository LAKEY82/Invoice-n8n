"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validation/schemas";

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-slate-100 px-4 py-10">
      <div className="animate-fade-up w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-navy">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><FileText className="h-5 w-5" /></span>
          <span className="text-lg font-semibold">InvoiceFlow AI</span>
        </div>
        <Card>
          <CardContent className="p-7">
            <h1 className="text-xl font-semibold text-navy">{title}</h1>
            <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>
            {children}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}

const link = "font-medium text-primary hover:underline";

function useSubmit<T>(fn: (v: T) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    run: async (v: T) => {
      setError(null);
      setBusy(true);
      try {
        await fn(v);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
  };
}

const ErrorBox = ({ message }: { message: string | null }) =>
  message ? <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null;

type LoginInput = z.input<typeof loginSchema>;
export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const { run, error, busy } = useSubmit<LoginInput>(async (v) => {
    await api("/api/auth/login", { method: "POST", json: v });
    router.replace(next && next.startsWith("/dashboard") ? next : "/dashboard");
    router.refresh();
  });
  return (
    <Shell title="Welcome back" subtitle="Sign in to your account" footer={<>No account? <Link className={link} href="/register">Create one</Link></>}>
      <form onSubmit={form.handleSubmit(run)} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" {...form.register("email")} /><FieldError message={form.formState.errors.email?.message} /></div>
        <div>
          <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="mb-1 text-xs text-primary hover:underline">Forgot?</Link></div>
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
          <FieldError message={form.formState.errors.password?.message} />
        </div>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
    </Shell>
  );
}

type RegisterInput = z.input<typeof registerSchema>;
export function RegisterForm() {
  const router = useRouter();
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const { run, error, busy } = useSubmit<RegisterInput>(async (v) => {
    await api("/api/auth/register", { method: "POST", json: v });
    router.replace("/dashboard");
    router.refresh();
  });
  const e = form.formState.errors;
  return (
    <Shell title="Create your account" subtitle="Start processing invoices with AI" footer={<>Already registered? <Link className={link} href="/login">Sign in</Link></>}>
      <form onSubmit={form.handleSubmit(run)} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <div><Label htmlFor="name">Name</Label><Input id="name" autoComplete="name" {...form.register("name")} /><FieldError message={e.name?.message} /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" {...form.register("email")} /><FieldError message={e.email?.message} /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" {...form.register("password")} /><FieldError message={e.password?.message} /></div>
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
    </Shell>
  );
}

type ForgotInput = z.input<typeof forgotSchema>;
export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema) });
  const { run, error, busy } = useSubmit<ForgotInput>(async (v) => {
    await api("/api/auth/forgot-password", { method: "POST", json: v });
    setSent(true);
  });
  return (
    <Shell title="Reset your password" subtitle="We'll email you a reset link" footer={<Link className={link} href="/login">Back to sign in</Link>}>
      {sent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">If an account exists for that email, a reset link is on its way. It expires in 30 minutes.</p>
      ) : (
        <form onSubmit={form.handleSubmit(run)} className="space-y-4" noValidate>
          <ErrorBox message={error} />
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" {...form.register("email")} /><FieldError message={form.formState.errors.email?.message} /></div>
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </Shell>
  );
}

type ResetInput = z.input<typeof resetSchema>;
export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const form = useForm<ResetInput>({ resolver: zodResolver(resetSchema), defaultValues: { token } });
  const { run, error, busy } = useSubmit<ResetInput>(async (v) => {
    await api("/api/auth/reset-password", { method: "POST", json: v });
    router.replace("/login");
  });
  return (
    <Shell title="Choose a new password" subtitle="Use at least 10 characters with a letter and a number" footer={<Link className={link} href="/login">Back to sign in</Link>}>
      <form onSubmit={form.handleSubmit(run)} className="space-y-4" noValidate>
        <ErrorBox message={error ?? (!token ? "This link is missing its token." : null)} />
        <input type="hidden" {...form.register("token")} />
        <div><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" {...form.register("password")} /><FieldError message={form.formState.errors.password?.message} /></div>
        <Button type="submit" className="w-full" loading={busy} disabled={!token}>Update password</Button>
      </form>
    </Shell>
  );
}
