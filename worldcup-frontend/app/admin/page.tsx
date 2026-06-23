"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, CheckCircle, CalendarPlus } from "lucide-react";
import { apiFetch, formatDate, getSession, hasRole, money } from "@/lib/api";

interface EventoStat {
  id_evento: number;
  equipo_local: string;
  equipo_visitante: string;
  estadio: string;
  fecha_hora: string;
  entradas_vendidas: number;
  bruto_entradas: number;
}

interface Comprador {
  mail: string;
  entradas_compradas: number;
  monto_total_compras: number;
}

interface Usuario {
  mail: string;
  doc_pais: string;
  doc_tipo: string;
  doc_nro: string;
  fecha_registro: string;
  estado_verif: string;
}

export default function AdminPage() {
  const [eventos, setEventos] = useState<EventoStat[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [ev, top, users] = await Promise.all([
        apiFetch<EventoStat[]>("/stats/eventos-mas-vendidos"),
        apiFetch<Comprador[]>("/stats/top-compradores"),
        apiFetch<Usuario[]>("/admin/usuarios"),
      ]);
      setEventos(ev);
      setCompradores(top);
      setUsuarios(users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar admin.");
    }
  };

  useEffect(() => {
    if (!hasRole(getSession(), "administrador")) {
      window.location.href = "/auth/login";
      return;
    }
    load();
  }, []);

  const verificar = async (mail: string) => {
    setError("");
    try {
      await apiFetch(`/admin/usuarios/${encodeURIComponent(mail)}/verificar`, { method: "PATCH" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar usuario.");
    }
  };

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Admin</h1>
          <p className="text-sm text-slate-600">Dashboard operativo y verificacion de usuarios.</p>
        </div>
        <Link href="/admin/eventos" className="btn-primary">
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Gestionar eventos
        </Link>
      </div>

      {error && <div className="panel mb-4 text-sm font-medium text-red-600">{error}</div>}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
            <BarChart3 className="h-5 w-5 text-emerald-700" aria-hidden />
            Eventos mas vendidos
          </h2>
          <div className="grid gap-3">
            {eventos.map((evento) => (
              <div key={evento.id_evento} className="rounded-md bg-slate-100 p-3">
                <p className="font-semibold text-slate-950">{evento.equipo_local} vs {evento.equipo_visitante}</p>
                <p className="text-sm text-slate-600">{evento.estadio} · {formatDate(evento.fecha_hora)}</p>
                <p className="text-sm text-slate-700">{evento.entradas_vendidas} entradas · {money(evento.bruto_entradas)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="mb-3 text-lg font-bold text-slate-950">Top compradores</h2>
          <div className="grid gap-3">
            {compradores.map((comprador) => (
              <div key={comprador.mail} className="rounded-md bg-slate-100 p-3">
                <p className="font-semibold text-slate-950">{comprador.mail}</p>
                <p className="text-sm text-slate-700">{comprador.entradas_compradas} entradas · {money(comprador.monto_total_compras)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel mt-4">
        <h2 className="mb-3 text-lg font-bold text-slate-950">Usuarios</h2>
        <div className="grid gap-3">
          {usuarios.map((usuario) => (
            <article key={usuario.mail} className="grid gap-3 rounded-md border border-slate-200 p-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="font-semibold text-slate-950">{usuario.mail}</p>
                <p className="text-sm text-slate-600">{usuario.doc_tipo} {usuario.doc_nro} · {usuario.estado_verif}</p>
              </div>
              {usuario.estado_verif !== "verificado" && (
                <button type="button" className="btn-primary" onClick={() => verificar(usuario.mail)}>
                  <CheckCircle className="h-4 w-4" aria-hidden />
                  Verificar
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
