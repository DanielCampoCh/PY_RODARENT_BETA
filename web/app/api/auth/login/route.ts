import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cookieOpts, crearSesion, verificarClave } from "@/lib/auth";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const intentos = new Map<string, { n: number; hasta: number }>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe un correo y una contraseña válidos." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const lock = intentos.get(email);
  if (lock && lock.n >= 5 && lock.hasta > Date.now()) return NextResponse.json({ error: "Demasiados intentos. Espera 10 minutos." }, { status: 429 });

  const [u] = await db()`select id, password_hash from usuarios where email = ${email} and activo`;
  if (!u || !verificarClave(parsed.data.password, u.password_hash)) {
    const cur = intentos.get(email) ?? { n: 0, hasta: 0 };
    intentos.set(email, { n: cur.n + 1, hasta: Date.now() + 10 * 60000 });
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }
  intentos.delete(email);
  const s = crearSesion(u.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(s.name, s.value, { ...cookieOpts, maxAge: s.maxAge });
  return res;
}
