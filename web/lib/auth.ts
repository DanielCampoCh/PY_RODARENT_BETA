import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export type Usuario = { id: string; email: string; nombre: string; rol: "admin" | "operador" };

const COOKIE = "rr_session";
const DURACION_H = 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return s;
}

export function verificarClave(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 64), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const firmar = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function crearSesion(uid: string) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + DURACION_H * 3600000 })).toString("base64url");
  return { name: COOKIE, value: `${payload}.${firmar(payload)}`, maxAge: DURACION_H * 3600 };
}

export const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

/** Usuario de la sesión actual, o null. Revalida contra la base (usuario activo). */
export async function usuarioActual(): Promise<Usuario | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const esperado = firmar(payload);
  if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  let data: { uid: string; exp: number };
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
  if (!data.exp || data.exp < Date.now()) return null;
  const [u] = await db()`select id, email, nombre, rol from usuarios where id = ${data.uid} and activo`;
  return (u as unknown as Usuario) ?? null;
}

export const COOKIE_NAME = COOKIE;
export const actorDe = (u: Usuario) => `${u.nombre.split(" ")[0]} (${u.rol === "admin" ? "Administrador" : "Operador"})`;
