"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { BarChart3, FileText, LayoutDashboard, LogOut, Menu, Plug, Settings, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/upload", label: "Upload", icon: Upload },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "U";

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-1.5 px-4">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:bg-slate-100 hover:text-navy",
            )}
          >
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const logout = (
    <div className="px-4 pb-6">
      <button
        onClick={() => signOut({ redirectUrl: "/login" })}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-slate-100 hover:text-red-600"
      >
        <LogOut className="h-[18px] w-[18px]" /> Logout
      </button>
    </div>
  );

  const brand = (
    <div className="flex h-20 items-center gap-3 px-7 text-navy">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-white"><FileText className="h-[18px] w-[18px]" /></span>
      <span className="text-lg font-semibold tracking-tight">InvoiceFlow<span className="text-primary-ink">.</span></span>
    </div>
  );

  const userChip = (
    <div className="flex items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg">{initials(user.name)}</span>
      <span className="hidden min-w-0 sm:block">
        <span className="block max-w-[160px] truncate text-sm font-medium leading-tight text-navy">{user.name}</span>
        <span className="block max-w-[160px] truncate text-[11px] leading-tight text-muted">{user.email}</span>
      </span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[#fbfbfc] md:flex">
        {brand}
        {nav}
        {logout}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-background/90 px-4 backdrop-blur md:justify-end md:px-8">
          <button aria-label="Open menu" className="md:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          {userChip}
        </header>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-[#fbfbfc] shadow-xl">
              <button aria-label="Close menu" className="absolute right-4 top-6" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
              {brand}
              {nav}
              {logout}
            </aside>
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-2 md:px-8">{children}</main>
      </div>
    </div>
  );
}
