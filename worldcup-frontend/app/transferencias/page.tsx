"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { apiFetch, formatDate, getSession, hasRole } from "@/lib/api";

interface Transferencia {
  id_transfer: number;
  id_entrada: number;
  mail_remitente: string;
  mail_destinat: string;
  fecha_solicitud: string;
  fecha_respuesta?: string;
  estado: string;
  equipo_local: string;
  equipo_visitante: string;
  estadio: string;
  ciudad: string;
  fecha_hora: string;
  sector_nombre: string;
}

export default function TransferenciasPage() {
  const [tab, setTab] = useState<"historial" | "pendientes">("historial");
  const [historial, setHistorial] = useState<Transferencia[]>([]);
  const [pendientes, setPendientes] = useState<Transferencia[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [all, pending] = await Promise.all([
        apiFetch<Transferencia[]>("/transferencias/mis-transferencias"),
        apiFetch<Transferencia[]>("/transferencias/pendientes"),
      ]);
      setHistorial(all);
      setPendientes(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar transferencias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasRole(getSession(), "usuario_general")) {
      window.location.href = "/auth/login";
      return;
    }
    load();
  }, []);

  const action = async (id: number, op: "aceptar" | "rechazar") => {
    setError("");
    try {
      await apiFetch(`/transferencias/${id}/${op}`, { method: "PUT" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la transferencia.");
    }
  };

  const rows = tab === "historial" ? historial : pendientes;

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-950">Transferencias</h1>
        <div className="grid grid-cols-2 rounded-md border border-slate-300 bg-white p-1">
          <button type="button" onClick={() => setTab("historial")} className={`min-h-11 rounded px-3 text-sm font-semibold ${tab === "historial" ? "bg-slate-950 text-white" : "text-slate-700"}`}>Mis transferencias</button>
          <button type="button" onClick={() => setTab("pendientes")} className={`min-h-11 rounded px-3 text-sm font-semibold ${tab === "pendientes" ? "bg-slate-950 text-white" : "text-slate-700"}`}>Pendientes</button>
        </div>
      </div>

      {loading && <div className="panel text-sm text-slate-500">Cargando transferencias...</div>}
      {error && <div className="panel mb-4 text-sm font-medium text-red-600">{error}</div>}

      <div className="grid gap-3">
        {rows.map((transfer) => (
          <article key={transfer.id_transfer} className="panel grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{transfer.estado}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">{transfer.equipo_local} vs {transfer.equipo_visitante}</h2>
              <p className="text-sm text-slate-600">Entrada #{transfer.id_entrada} · Sector {transfer.sector_nombre} · {formatDate(transfer.fecha_hora)}</p>
              <p className="text-sm text-slate-600">De {transfer.mail_remitente} para {transfer.mail_destinat}</p>
            </div>
            {tab === "pendientes" && transfer.estado === "pendiente" && (
              <div className="grid gap-2 sm:grid-cols-2 lg:w-72">
                <button type="button" className="btn-primary" onClick={() => action(transfer.id_transfer, "aceptar")}>
                  <Check className="h-4 w-4" aria-hidden />
                  Aceptar
                </button>
                <button type="button" className="btn-secondary" onClick={() => action(transfer.id_transfer, "rechazar")}>
                  <X className="h-4 w-4" aria-hidden />
                  Rechazar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {!loading && rows.length === 0 && <div className="panel text-sm text-slate-500">No hay transferencias para mostrar.</div>}
    </main>
  );
}
