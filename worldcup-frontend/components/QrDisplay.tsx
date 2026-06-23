"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface QrResponse {
  idToken: number;
  codigoHash: string;
  fechaExpiracion: string;
  qrBase64: string;
}

export function QrDisplay({ idEntrada }: { idEntrada: number }) {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [seg, setSeg] = useState(29);
  const [error, setError] = useState("");

  const fetchQr = useCallback(async () => {
    try {
      const data = await apiFetch<QrResponse>(`/entradas/${idEntrada}/qr`);
      setQr(data);
      setSeg(29);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el QR.");
    }
  }, [idEntrada]);

  useEffect(() => {
    fetchQr();
    const interval = setInterval(fetchQr, 29000);
    return () => clearInterval(interval);
  }, [fetchQr]);

  useEffect(() => {
    const interval = setInterval(() => setSeg((value) => (value > 0 ? value - 1 : 29)), 1000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <p className="text-sm font-medium text-red-600">{error}</p>;

  if (!qr) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500">
        Generando QR...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-white p-4">
      <Image
        src={qr.qrBase64}
        alt="QR de entrada"
        width={192}
        height={192}
        unoptimized
        className="h-48 w-48 rounded-md border-2 border-slate-950"
      />
      <p className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
        <RefreshCcw className="h-4 w-4 text-emerald-700" aria-hidden />
        Renueva en <span className="text-emerald-700">{seg}s</span>
      </p>
      <p className="max-w-full truncate text-xs text-slate-400">{qr.codigoHash}</p>
    </div>
  );
}
