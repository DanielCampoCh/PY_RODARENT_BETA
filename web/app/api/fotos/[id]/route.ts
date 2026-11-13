import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Foto de un vehículo subida desde el panel. Es pública (sale en el catálogo) y nunca cambia: se guarda en caché. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return new NextResponse("No encontrada", { status: 404 });
  const [f] = await db()`select datos, tipo from vehiculo_fotos where id = ${id} and datos is not null`;
  if (!f) return new NextResponse("No encontrada", { status: 404 });
  return new NextResponse(new Uint8Array(f.datos), {
    headers: { "Content-Type": f.tipo, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
