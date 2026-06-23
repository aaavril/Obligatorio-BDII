"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, ShoppingCart } from "lucide-react";
import { apiFetch, formatDate, getSession, hasRole, money } from "@/lib/api";

interface Sector {
  id_sector: number;
  id_estadio: number;
  nombre: string;
  costo_entrada: number;
  cupo_maximo: number;
  entradas_emitidas: number;
  disponibles: number;
}

interface EventoDetalle {
  evento: {
    id_evento: number;
    fecha_hora: string;
    estado: string;
    estadio: string;
    ciudad: string;
    direccion: string;
    equipo_local: string;
    equipo_visitante: string;
  };
  sectores: Sector[];
}

export default function EventoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detalle, setDetalle] = useState<EventoDetalle | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<EventoDetalle>(`/eventos/${params.id}`)
      .then(setDetalle)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el evento."))
      .finally(() => setLoading(false));
  }, [params.id]);

  const total = useMemo(() => {
    if (!detalle) return 0;
    return detalle.sectores.reduce((acc, sector) => acc + (cantidades[sector.id_sector] || 0) * Number(sector.costo_entrada), 0);
  }, [cantidades, detalle]);

  const comprar = async () => {
    const session = getSession();
    if (!hasRole(session, "usuario_general")) {
      router.push("/auth/login");
      return;
    }

    const items = Object.entries(cantidades)
      .map(([idSector, cantidad]) => {
        const sector = detalle?.sectores.find((s) => s.id_sector === Number(idSector));
        return sector && cantidad > 0 ? { idSector: sector.id_sector, idEstadio: sector.id_estadio, cantidad } : null;
      })
      .filter(Boolean);

    if (items.length === 0) {
      setError("Selecciona al menos una entrada.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await apiFetch("/ventas", {
        method: "POST",
        body: JSON.stringify({ idEvento: Number(params.id), items }),
      });
      router.push("/mis-entradas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la compra.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="page-shell"><div className="panel text-sm text-slate-500">Cargando evento...</div></main>;
  if (!detalle) return <main className="page-shell"><div className="panel text-sm font-medium text-red-600">{error}</div></main>;

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{detalle.evento.estado}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
          {detalle.evento.equipo_local} vs {detalle.evento.equipo_visitante}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden />
          {formatDate(detalle.evento.fecha_hora)} · {detalle.evento.estadio}, {detalle.evento.ciudad}
        </p>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3">
          {detalle.sectores.map((sector) => (
            <article key={sector.id_sector} className="panel grid gap-3 sm:grid-cols-[1fr_120px] sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Sector {sector.nombre}</h2>
                <p className="text-sm text-slate-600">{sector.disponibles} disponibles de {sector.cupo_maximo}</p>
                <p className="mt-1 text-sm font-semibold text-emerald-700">{money(sector.costo_entrada)}</p>
              </div>
              <label className="grid gap-1">
                <span className="label">Cantidad</span>
                <input
                  className="field"
                  type="number"
                  min={0}
                  max={Math.min(5, sector.disponibles)}
                  value={cantidades[sector.id_sector] || 0}
                  onChange={(event) => setCantidades((current) => ({ ...current, [sector.id_sector]: Number(event.target.value) }))}
                />
              </label>
            </article>
          ))}
        </div>

        <aside className="panel h-fit">
          <h2 className="text-lg font-bold text-slate-950">Resumen</h2>
          <p className="mt-2 text-sm text-slate-600">Subtotal sin comision</p>
          <p className="text-3xl font-bold text-slate-950">{money(total)}</p>
          <p className="mt-2 text-xs text-slate-500">La comision vigente se calcula en backend al confirmar.</p>
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          <button type="button" onClick={comprar} disabled={saving} className="btn-primary mt-4 w-full">
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {saving ? "Comprando..." : "Comprar"}
          </button>
        </aside>
      </section>
    </main>
  );
}
