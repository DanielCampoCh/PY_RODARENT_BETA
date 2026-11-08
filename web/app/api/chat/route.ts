import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { atender, type Conv } from "@/lib/agent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({ conversacion: z.string().uuid().optional(), mensaje: z.string().trim().min(1).max(1500) });

// Límite simple por conversación para evitar abuso (por instancia del servidor).
const ultimos = new Map<string, number[]>();
function limitado(clave: string) {
  const ahora = Date.now();
  const lista = (ultimos.get(clave) ?? []).filter((t) => ahora - t < 60000);
  lista.push(ahora);
  ultimos.set(clave, lista);
  return lista.length > 12;
}

/** Mensaje del cliente al asistente. Crea la conversación si no existe. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensaje inválido." }, { status: 400 });
  const sql = db();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limitado(parsed.data.conversacion ?? ip)) return NextResponse.json({ error: "Estás enviando mensajes muy rápido. Espera un momento." }, { status: 429 });

  let conv;
  if (parsed.data.conversacion) [conv] = await sql`select id, cliente_id, nombre, telefono, estado, historial_api from conversaciones where id = ${parsed.data.conversacion}`;
  if (!conv) [conv] = await sql`insert into conversaciones (canal) values ('web') returning id, cliente_id, nombre, telefono, estado, historial_api`;
  if (conv.estado === "cerrada") await sql`update conversaciones set estado = 'ia' where id = ${conv.id}`;

  const r = await atender({ ...(conv as unknown as Conv), estado: conv.estado === "cerrada" ? "ia" : conv.estado }, parsed.data.mensaje);
  const [ult] = await sql`select coalesce(max(id), 0)::int as id from mensajes where conversacion_id = ${conv.id}`;
  return NextResponse.json({ conversacion: conv.id, respuesta: r.respuesta, estado: r.estado, ultimoId: ult.id });
}
