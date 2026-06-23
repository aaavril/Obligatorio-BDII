"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn, LogOut, Menu, ShieldCheck, Ticket, UserPlus, X } from "lucide-react";
import { clearSession, getSession, hasRole, type Session } from "@/lib/api";

export function Navbar() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setSession(getSession());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("session-change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("session-change", refresh);
    };
  }, []);

  const links = [
    { href: "/", label: "Eventos", show: true },
    { href: "/mis-entradas", label: "Mis Entradas", show: hasRole(session, "usuario_general") },
    { href: "/mis-compras", label: "Mis Compras", show: hasRole(session, "usuario_general") },
    { href: "/transferencias", label: "Transferencias", show: hasRole(session, "usuario_general") },
    { href: "/validar", label: "Validar QR", show: hasRole(session, "funcionario") },
    { href: "/admin", label: "Admin", show: hasRole(session, "administrador") },
  ].filter((link) => link.show);

  const logout = () => {
    clearSession();
    setOpen(false);
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-950" onClick={() => setOpen(false)}>
          <Ticket className="h-6 w-6 text-emerald-700" aria-hidden />
          Mundial Tickets
        </Link>

        <button
          type="button"
          aria-label="Abrir menu"
          className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 text-slate-700 md:hidden"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {session ? (
            <>
              <span className="max-w-48 truncate rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{session.mail}</span>
              <button type="button" onClick={logout} className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white">
                <LogOut className="h-4 w-4" aria-hidden />
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800">
                <LogIn className="h-4 w-4" aria-hidden />
                Ingresar
              </Link>
              <Link href="/auth/register" className="inline-flex h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white">
                <UserPlus className="h-4 w-4" aria-hidden />
                Registrarse
              </Link>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-sm font-medium text-slate-800 hover:bg-slate-100">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
            {session ? (
              <>
                <span className="flex min-h-12 items-center gap-2 rounded-md bg-slate-100 px-3 text-sm text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
                  {session.mail}
                </span>
                <button type="button" onClick={logout} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800">
                  <LogIn className="h-4 w-4" aria-hidden />
                  Ingresar
                </Link>
                <Link href="/auth/register" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white">
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
