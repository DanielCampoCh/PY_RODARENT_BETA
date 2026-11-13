import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ajustes } from "@/lib/repo";
import { revisarAlertas } from "@/lib/alertas";

export const dynamic = "force-dynamic";

/**
 * Revisión diaria de alertas de la flota (SOAT, tecnomecánica, seguro, extintor, impuesto, GPS, aceite y pico y placa).
 * Llamarla una vez al día (por ejemplo 6:00 p. m.) con la cabecera  Authorization: Bearer <CRON_SECRET>.
 * El panel también revisa las alertas cada vez que se abre.
 */
export async function GET(req: Request) {
  const clave = process.env.CRON_SECRET?.trim();
  const dada = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!clave || dada.length !== clave.length || !timingSafeEqual(Buffer.from(dada), Buffer.from(clave))) return new NextResponse("No autorizado", { status: 401 });
  const alertas = await revisarAlertas(await ajustes());
  return NextResponse.json({ ok: true, alertas: alertas.length });
}
