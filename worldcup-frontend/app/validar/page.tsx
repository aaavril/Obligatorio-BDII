"use client";

import { FormEvent, useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { apiFetch, getSession, hasRole } from "@/lib/api";

interface Dispositivo {
  id_dispositivo: number;
  descripcion: string;
  activo: boolean;
}

interface ValidacionResponse {
  ok: boolean;
  mensaje: string;
}

export default function ValidarPage() {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [idDispositivo, setIdDispositivo] = useState("");
  const [codigoHash, setCodigoHash] = useState("");
  const [resultado, setResultado] = useState<ValidacionResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasRole(getSession(), "funcionario")) {
      window.location.href = "/auth/login";
      return;
    }
    apiFetch<Dispositivo[]>("/validaciones/mis-dispositivos")
      .then((rows) => {
        setDispositivos(rows);
        if (rows[0]) setIdDispositivo(String(rows[0].id_dispositivo));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar dispositivos."));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResultado(null);
    try {
      const response = await apiFetch<ValidacionResponse>("/validaciones", {
        method: "POST",
        body: JSON.stringify({ codigoHash, idDispositivo: Number(idDispositivo) }),
      });
      setResultado(response);
      setCodigoHash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo validar.");
    }
  };

  return (
    <main className="page-shell max-w-2xl">
      <form onSubmit={submit} className="panel grid gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Validar QR</h1>
          <p className="mt-1 text-sm text-slate-600">Pega o escanea el hash del QR presentado en puerta.</p>
        </div>
        <label className="grid gap-1">
          <span className="label">Dispositivo</span>
          <select className="field" value={idDispositivo} onChange={(e) => setIdDispositivo(e.target.value)} required>
            {dispositivos.map((dispositivo) => (
              <option key={dispositivo.id_dispositivo} value={dispositivo.id_dispositivo}>
                {dispositivo.descripcion}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">Codigo hash</span>
          <textarea className="field min-h-28 py-3" value={codigoHash} onChange={(e) => setCodigoHash(e.target.value)} required />
        </label>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        {resultado && (
          <p className={`rounded-md p-3 text-sm font-semibold ${resultado.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {resultado.mensaje}
          </p>
        )}
        <button type="submit" className="btn-primary">
          <ScanLine className="h-4 w-4" aria-hidden />
          Validar
        </button>
      </form>
    </main>
  );
}
