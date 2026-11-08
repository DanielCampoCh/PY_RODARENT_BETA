import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Mensajes nuevos de una conversación (para que el cliente vea las respuestas del asesor). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const desde = Number(new URL(req.url).searchParams.get("desde") || 0) || 0;
  const sql = db();
  const [c] = await sql`select estado from conversaciones where id = ${id} and canal = 'web'`;
  if (!c) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const msgs = await sql`select id, emisor, texto, fecha from mensajes where conversacion_id = ${id} and id > ${desde} order by id`;
  return NextResponse.json({ estado: c.estado, mensajes: msgs.map((m) => ({ id: m.id, emisor: m.emisor, texto: m.texto, fecha: new Date(m.fecha).toISOString() })) });
}
