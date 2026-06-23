"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { apiFetch, formatDate, getSession, hasRole, money } from "@/lib/api";

interface Compra {
  id_venta: number;
  fecha: string;
  estado: string;
  monto_total: number;
  comision_pct: number;
  entradas: number;
}

export default function MisComprasPage() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasRole(getSession(), "usuario_general")) {
      window.location.href = "/auth/login";
      return;
    }
    apiFetch<Compra[]>("/ventas/mis-compras")
      .then(setCompras)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar compras."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell">
      <h1 className="mb-5 text-2xl font-bold text-slate-950">Mis Compras</h1>
      {loading && <div className="panel text-sm text-slate-500">Cargando compras...</div>}
      {error && <div className="panel text-sm font-medium text-red-600">{error}</div>}

      <div className="grid gap-3">
        {compras.map((compra) => (
          <article key={compra.id_venta} className="panel grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Receipt className="h-4 w-4" aria-hidden />
                Venta #{compra.id_venta}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">{money(compra.monto_total)}</h2>
              <p className="text-sm text-slate-600">{formatDate(compra.fecha)} · {compra.entradas} entrada(s) · Comision {compra.comision_pct}%</p>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{compra.estado}</span>
          </article>
        ))}
      </div>

      {!loading && compras.length === 0 && <div className="panel text-sm text-slate-500">No hay compras registradas.</div>}
    </main>
  );
}
