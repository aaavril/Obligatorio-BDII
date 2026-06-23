"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiFetch, saveSession } from "@/lib/api";

interface LoginResponse {
  token: string;
  mail: string;
  roles: string[];
}

export default function LoginPage() {
  const router = useRouter();
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ mail, password }),
      });
      saveSession(session);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell max-w-lg">
      <form onSubmit={submit} className="panel grid gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Ingresar</h1>
          <p className="mt-1 text-sm text-slate-600">Usa una de las credenciales seed o tu cuenta registrada.</p>
        </div>
        <label className="grid gap-1">
          <span className="label">Mail</span>
          <input className="field" type="email" value={mail} onChange={(e) => setMail(e.target.value)} required />
        </label>
        <label className="grid gap-1">
          <span className="label">Password</span>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          <LogIn className="h-4 w-4" aria-hidden />
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
        <Link href="/auth/register" className="text-center text-sm font-semibold text-emerald-700">
          Crear cuenta
        </Link>
      </form>
    </main>
  );
}
