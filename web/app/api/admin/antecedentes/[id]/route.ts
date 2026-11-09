import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Descarga el certificado o la captura adjunta a una consulta de antecedentes (solo administrador). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await usuarioActual();
  if (!u || u.rol !== "admin") return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const [c] = await db()`select archivo, archivo_tipo, archivo_nombre from consultas_antecedentes where id = ${id}`;
  if (!c?.archivo) return NextResponse.json({ error: "Esta consulta no tiene archivo adjunto" }, { status: 404 });
  const nombre = String(c.archivo_nombre || "certificado").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(c.archivo), {
    headers: { "Content-Type": c.archivo_tipo, "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "private, no-store" },
  });
}
