"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { apiFetch, formatDate } from "@/lib/api";

interface Evento {
  id_evento: number;
  fecha_hora: string;
  estado: string;
  estadio: string;
  ciudad: string;
  equipo_local: string;
  equipo_visitante: string;
  disponibles: number;
}

export default function Home() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Evento[]>("/eventos")
      .then(setEventos)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar eventos."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
        <div className="panel flex flex-col justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Ticketing oficial universitario</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-4xl">Partidos disponibles</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Compra entradas, gestiona transferencias y valida accesos con QR dinamico desde una sola plataforma.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-slate-100 p-3">
              <p className="font-bold text-slate-950">{eventos.length}</p>
              <p className="text-slate-500">Eventos</p>
            </div>
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="font-bold text-emerald-800">30s</p>
              <p className="text-slate-500">QR</p>
            </div>
            <div className="rounded-md bg-amber-50 p-3">
              <p className="font-bold text-amber-800">5</p>
              <p className="text-slate-500">Max/evento</p>
            </div>
          </div>
        </div>
        <Image
          src="/stadium-ticket.png"
          alt="Estadio nocturno con entradas digitales"
          width={1200}
          height={500}
          priority
          className="h-52 w-full rounded-md object-cover sm:h-64 lg:h-full"
        />
      </section>

      <section className="mt-6">
        {loading && <div className="panel text-sm text-slate-500">Cargando eventos...</div>}
        {error && <div className="panel text-sm font-medium text-red-600">{error}</div>}
        {!loading && !error && eventos.length === 0 && <div className="panel text-sm text-slate-500">No hay eventos publicados.</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {eventos.map((evento) => (
            <article key={evento.id_evento} className="panel flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{evento.estado}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {evento.equipo_local} vs {evento.equipo_visitante}
                </h2>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden />
                  {formatDate(evento.fecha_hora)}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-700" aria-hidden />
                  {evento.estadio}, {evento.ciudad}
                </p>
                <p className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-emerald-700" aria-hidden />
                  {evento.disponibles} disponibles
                </p>
              </div>
              <Link href={`/evento/${evento.id_evento}`} className="btn-primary mt-auto">
                <Ticket className="h-4 w-4" aria-hidden />
                Ver entradas
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
