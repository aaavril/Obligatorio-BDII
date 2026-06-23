"use client";

import { FormEvent, useEffect, useState } from "react";
import { Send, Ticket } from "lucide-react";
import { QrDisplay } from "@/components/QrDisplay";
import { apiFetch, formatDate, getSession, hasRole, money } from "@/lib/api";

interface Entrada {
  id_entrada: number;
  id_evento: number;
  fecha_hora: string;
  estadio: string;
  ciudad: string;
  id_sector: number;
  sector_nombre: string;
  costo_entrada: number;
  equipo_local: string;
  equipo_visitante: string;
  transferencias_rest: number;
}

export default function MisEntradasPage() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [activeQr, setActiveQr] = useState<number | null>(null);
  const [transferFor, setTransferFor] = useState<number | null>(null);
  const [destinatario, setDestinatario] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    apiFetch<Entrada[]>("/entradas/mis-entradas")
      .then(setEntradas)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar entradas."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasRole(getSession(), "usuario_general")) {
      window.location.href = "/auth/login";
      return;
    }
    load();
  }, []);

  const transferir = async (event: FormEvent, idEntrada: number) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/transferencias", {
        method: "POST",
        body: JSON.stringify({ idEntrada, mailDestinatario: destinatario }),
      });
      setMessage("Transferencia creada.");
      setTransferFor(null);
      setDestinatario("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la transferencia.");
    }
  };

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Mis Entradas</h1>
          <p className="text-sm text-slate-600">Muestra el QR solamente al ingresar al estadio.</p>
        </div>
      </div>

      {loading && <div className="panel text-sm text-slate-500">Cargando entradas...</div>}
      {message && <div className="panel mb-4 text-sm font-medium text-emerald-700">{message}</div>}
      {error && <div className="panel mb-4 text-sm font-medium text-red-600">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {entradas.map((entrada) => (
          <article key={entrada.id_entrada} className="panel grid gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Entrada #{entrada.id_entrada}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{entrada.equipo_local} vs {entrada.equipo_visitante}</h2>
                <p className="mt-1 text-sm text-slate-600">{formatDate(entrada.fecha_hora)}</p>
                <p className="text-sm text-slate-600">{entrada.estadio}, {entrada.ciudad} · Sector {entrada.sector_nombre}</p>
              </div>
              <Ticket className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-md bg-slate-100 p-3">Precio: <strong>{money(entrada.costo_entrada)}</strong></p>
              <p className="rounded-md bg-slate-100 p-3">Transferencias: <strong>{entrada.transferencias_rest}</strong></p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn-primary" onClick={() => setActiveQr((current) => current === entrada.id_entrada ? null : entrada.id_entrada)}>
                Ver QR
              </button>
              <button type="button" className="btn-secondary" onClick={() => setTransferFor((current) => current === entrada.id_entrada ? null : entrada.id_entrada)}>
                <Send className="h-4 w-4" aria-hidden />
                Transferir
              </button>
            </div>

            {activeQr === entrada.id_entrada && <QrDisplay idEntrada={entrada.id_entrada} />}

            {transferFor === entrada.id_entrada && (
              <form className="grid gap-2 rounded-md border border-slate-200 p-3" onSubmit={(event) => transferir(event, entrada.id_entrada)}>
                <label className="grid gap-1">
                  <span className="label">Mail destinatario</span>
                  <input className="field" type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} required />
                </label>
                <button type="submit" className="btn-primary">
                  <Send className="h-4 w-4" aria-hidden />
                  Enviar transferencia
                </button>
              </form>
            )}
          </article>
        ))}
      </div>

      {!loading && entradas.length === 0 && <div className="panel text-sm text-slate-500">Todavia no tenes entradas disponibles.</div>}
    </main>
  );
}
