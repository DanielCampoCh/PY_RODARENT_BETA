import { NextResponse } from "next/server";
import { buscarDireccion, direccionDe, enColombia } from "@/lib/geo";
import { excedeLimite, ipDe } from "@/lib/limite";

export const dynamic = "force-dynamic";

/**
 * Ayuda a la página a mostrar la dirección del pin del mapa:
 *   GET /api/ubicacion?lat=3.45&lng=-76.53  → { direccion, barrio, ciudad }
 *   GET /api/ubicacion?q=Calle 5 # 38-20     → { lat, lng, direccion }
 * No guarda nada: la ubicación solo se guarda si el cliente la envía en el chat o en la reserva.
 */
export async function GET(req: Request) {
  if (excedeLimite("ubicacion:" + ipDe(req), 40, 10 * 60000)) return NextResponse.json({ error: "Demasiadas búsquedas seguidas. Espera un momento." }, { status: 429 });
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") ?? "").trim();
  if (q) {
    if (q.length < 3 || q.length > 200) return NextResponse.json({ error: "Escribe una dirección más completa." }, { status: 400 });
    const r = await buscarDireccion(q);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "No encontramos esa dirección en el mapa. Mueve el pin a mano." }, { status: 404 });
  }
  const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !enColombia(lat, lng)) return NextResponse.json({ error: "Ubicación fuera de Colombia o inválida." }, { status: 400 });
  const d = await direccionDe(lat, lng);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "No pudimos leer la dirección. Escríbela a mano." }, { status: 404 });
}
