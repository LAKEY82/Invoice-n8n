"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { BarChart3, FileText, LayoutDashboard, LogOut, Menu, Plug, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/upload", label: "Upload", icon: Upload },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
];

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-100 hover:text-navy",
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-border p-4">
      <p className="truncate text-sm font-medium text-navy">{user.name}</p>
      <p className="truncate text-xs text-muted">{user.email}</p>
      <button onClick={() => signOut({ redirectUrl: "/login" })} className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-red-600">
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </button>
    </div>
  );

  const brand = (
    <div className="flex h-16 items-center gap-2 px-5 text-navy">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><FileText className="h-4 w-4" /></span>
      <span className="font-semibold">InvoiceFlow AI</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
        {brand}
        {nav}
        {account}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white px-4 md:hidden">
          <span className="font-semibold text-navy">InvoiceFlow AI</span>
          <button aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        </header>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
              <button aria-label="Close menu" className="absolute right-3 top-4" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
              {brand}
              {nav}
              {account}
            </aside>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
