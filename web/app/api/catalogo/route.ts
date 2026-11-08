import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ajustes, expirar, mapVehiculo, negocio, ocupados } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Catálogo público: vehículos activos, periodos ocupados (sin datos personales) y condiciones. */
export async function GET() {
  await expirar();
  const [vehiculos, ocup, a] = await Promise.all([db()`select * from vehiculos where estado <> 'inactivo' order by precio_dia`, ocupados(), ajustes()]);
  return NextResponse.json({
    vehicles: vehiculos.map(mapVehiculo),
    busy: ocup,
    settings: a,
    negocio: negocio(),
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
  });
}
