"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    mail: "",
    docPais: "",
    docTipo: "",
    docNro: "",
    dirPais: "",
    dirCiudad: "",
    dirCalle: "",
    password: "",
    telefonos: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          telefonos: form.telefonos.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      router.push("/auth/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la cuenta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell max-w-2xl">
      <form onSubmit={submit} className="panel grid gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Registrarse</h1>
          <p className="mt-1 text-sm text-slate-600">La cuenta queda pendiente hasta que un administrador la verifique.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2"><span className="label">Mail</span><input className="field" type="email" value={form.mail} onChange={(e) => update("mail", e.target.value)} required /></label>
          <label className="grid gap-1"><span className="label">Pais documento</span><input className="field" value={form.docPais} onChange={(e) => update("docPais", e.target.value)} required /></label>
          <label className="grid gap-1"><span className="label">Tipo documento</span><input className="field" value={form.docTipo} onChange={(e) => update("docTipo", e.target.value)} required /></label>
          <label className="grid gap-1"><span className="label">Numero documento</span><input className="field" value={form.docNro} onChange={(e) => update("docNro", e.target.value)} required /></label>
          <label className="grid gap-1"><span className="label">Telefono(s)</span><input className="field" value={form.telefonos} onChange={(e) => update("telefonos", e.target.value)} placeholder="+598..., +598..." /></label>
          <label className="grid gap-1"><span className="label">Pais</span><input className="field" value={form.dirPais} onChange={(e) => update("dirPais", e.target.value)} required /></label>
          <label className="grid gap-1"><span className="label">Ciudad</span><input className="field" value={form.dirCiudad} onChange={(e) => update("dirCiudad", e.target.value)} required /></label>
          <label className="grid gap-1 sm:col-span-2"><span className="label">Direccion</span><input className="field" value={form.dirCalle} onChange={(e) => update("dirCalle", e.target.value)} required /></label>
          <label className="grid gap-1 sm:col-span-2"><span className="label">Password</span><input className="field" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required /></label>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          <UserPlus className="h-4 w-4" aria-hidden />
          {loading ? "Creando..." : "Crear cuenta"}
        </button>
      </form>
    </main>
  );
}
