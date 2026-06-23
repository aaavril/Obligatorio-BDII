"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { apiFetch, formatDate, getSession, hasRole } from "@/lib/api";

interface EventoAdmin {
  id_evento: number;
  fecha_hora: string;
  estado: string;
  id_estadio: number;
  estadio: string;
  ciudad: string;
  id_equipo_local: number;
  equipo_local: string;
  id_equipo_visit: number;
  equipo_visitante: string;
}

interface Equipo {
  id_equipo: number;
  nombre: string;
}

interface Estadio {
  id_estadio: number;
  nombre: string;
  ciudad: string;
}

export default function AdminEventosPage() {
  const [eventos, setEventos] = useState<EventoAdmin[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [estadios, setEstadios] = useState<Estadio[]>([]);
  const [form, setForm] = useState({ idEstadio: "", fechaHora: "", idEquipoLocal: "", idEquipoVisit: "" });
  const [sector, setSector] = useState({ idEvento: "", idEstadio: "", idSector: "1", cupoMaximo: "1000" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setError("");
    try {
      const [ev, eq, es] = await Promise.all([
        apiFetch<EventoAdmin[]>("/admin/eventos"),
        apiFetch<Equipo[]>("/equipos"),
        apiFetch<Estadio[]>("/estadios"),
      ]);
      setEventos(ev);
      setEquipos(eq);
      setEstadios(es);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar datos.");
    }
  };

  useEffect(() => {
    if (!hasRole(getSession(), "administrador")) {
      window.location.href = "/auth/login";
      return;
    }
    load();
  }, []);

  const crearEvento = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch("/admin/eventos", {
        method: "POST",
        body: JSON.stringify({
          idEstadio: Number(form.idEstadio),
          fechaHora: new Date(form.fechaHora).toISOString(),
          idEquipoLocal: Number(form.idEquipoLocal),
          idEquipoVisit: Number(form.idEquipoVisit),
        }),
      });
      setMessage("Evento creado.");
      setForm({ idEstadio: "", fechaHora: "", idEquipoLocal: "", idEquipoVisit: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear evento.");
    }
  };

  const agregarSector = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiFetch(`/admin/eventos/${sector.idEvento}/sectores`, {
        method: "POST",
        body: JSON.stringify({
          idSector: Number(sector.idSector),
          idEstadio: Number(sector.idEstadio),
          cupoMaximo: Number(sector.cupoMaximo),
        }),
      });
      setMessage("Sector guardado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar sector.");
    }
  };

  return (
    <main className="page-shell">
      <h1 className="mb-5 text-2xl font-bold text-slate-950">Eventos Admin</h1>
      {error && <div className="panel mb-4 text-sm font-medium text-red-600">{error}</div>}
      {message && <div className="panel mb-4 text-sm font-medium text-emerald-700">{message}</div>}

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={crearEvento} className="panel grid gap-3">
          <h2 className="text-lg font-bold text-slate-950">Crear evento</h2>
          <label className="grid gap-1">
            <span className="label">Estadio</span>
            <select className="field" value={form.idEstadio} onChange={(e) => setForm((c) => ({ ...c, idEstadio: e.target.value }))} required>
              <option value="">Seleccionar</option>
              {estadios.map((estadio) => <option key={estadio.id_estadio} value={estadio.id_estadio}>{estadio.nombre} · {estadio.ciudad}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="label">Fecha y hora</span>
            <input className="field" type="datetime-local" value={form.fechaHora} onChange={(e) => setForm((c) => ({ ...c, fechaHora: e.target.value }))} required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="label">Local</span>
              <select className="field" value={form.idEquipoLocal} onChange={(e) => setForm((c) => ({ ...c, idEquipoLocal: e.target.value }))} required>
                <option value="">Seleccionar</option>
                {equipos.map((equipo) => <option key={equipo.id_equipo} value={equipo.id_equipo}>{equipo.nombre}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="label">Visitante</span>
              <select className="field" value={form.idEquipoVisit} onChange={(e) => setForm((c) => ({ ...c, idEquipoVisit: e.target.value }))} required>
                <option value="">Seleccionar</option>
                {equipos.map((equipo) => <option key={equipo.id_equipo} value={equipo.id_equipo}>{equipo.nombre}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" className="btn-primary">
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Crear evento
          </button>
        </form>

        <form onSubmit={agregarSector} className="panel grid gap-3">
          <h2 className="text-lg font-bold text-slate-950">Agregar sector</h2>
          <label className="grid gap-1">
            <span className="label">Evento</span>
            <select
              className="field"
              value={sector.idEvento}
              onChange={(e) => {
                const evento = eventos.find((row) => row.id_evento === Number(e.target.value));
                setSector((current) => ({ ...current, idEvento: e.target.value, idEstadio: evento ? String(evento.id_estadio) : "" }));
              }}
              required
            >
              <option value="">Seleccionar</option>
              {eventos.map((evento) => <option key={evento.id_evento} value={evento.id_evento}>#{evento.id_evento} {evento.equipo_local} vs {evento.equipo_visitante}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="label">Sector</span>
              <select className="field" value={sector.idSector} onChange={(e) => setSector((c) => ({ ...c, idSector: e.target.value }))}>
                <option value="1">A</option>
                <option value="2">B</option>
                <option value="3">C</option>
                <option value="4">D</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="label">Cupo maximo</span>
              <input className="field" type="number" min={1} value={sector.cupoMaximo} onChange={(e) => setSector((c) => ({ ...c, cupoMaximo: e.target.value }))} required />
            </label>
          </div>
          <button type="submit" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            Guardar sector
          </button>
        </form>
      </section>

      <section className="mt-4 grid gap-3">
        {eventos.map((evento) => (
          <article key={evento.id_evento} className="panel">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{evento.estado}</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">#{evento.id_evento} {evento.equipo_local} vs {evento.equipo_visitante}</h2>
            <p className="text-sm text-slate-600">{evento.estadio}, {evento.ciudad} · {formatDate(evento.fecha_hora)}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
