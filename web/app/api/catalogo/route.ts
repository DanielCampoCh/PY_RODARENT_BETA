import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ajustes, expirar, mapVehiculo, negocio, ocupados } from "@/lib/repo";
import { fotosParaMostrar, fotosPorVehiculo, galeria } from "@/lib/fotos";

export const dynamic = "force-dynamic";

/** Catálogo público: vehículos de alquiler y de la agencia aliada (no los de Uber), periodos ocupados (sin datos personales) y condiciones. */
export async function GET() {
  await expirar();
  const [vehiculos, ocup, a, fotos] = await Promise.all([
    db()`select * from vehiculos where estado <> 'inactivo' and modalidad in ('alquiler', 'agencia') and precio_dia > 0 order by precio_dia`,
    ocupados(), ajustes(), fotosPorVehiculo(),
  ]);
  const g = galeria();
  return NextResponse.json({
    vehicles: vehiculos.map((v) => mapVehiculo(v, fotosParaMostrar(v, fotos.get(v.id)))),
    busy: ocup,
    settings: a,
    negocio: negocio(),
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
    // Fotos del Instagram del negocio para la galería de la página.
    galeria: { perfil: g.perfil, fotos: g.fotos.map(({ url, titulo, detalle, post }) => ({ url, titulo, detalle, post })) },
  });
}
