import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/** Galería del negocio (fotos tomadas de su Instagram) en public/fotos/instagram/index.json. */
export type FotoGaleria = { archivo: string; titulo: string; detalle: string; claves: string[]; post: string; url: string };
let cache: { perfil: string; fotos: FotoGaleria[] } | null = null;
export function galeria() {
  if (cache) return cache;
  try {
    const j = JSON.parse(readFileSync(join(process.cwd(), "public", "fotos", "instagram", "index.json"), "utf8"));
    cache = { perfil: j.perfil, fotos: j.fotos.map((f: FotoGaleria) => ({ ...f, url: `/fotos/instagram/${f.archivo}` })) };
  } catch {
    cache = { perfil: "", fotos: [] };
  }
  return cache;
}
/** Solo se aceptan fotos de la galería del propio sitio (nunca enlaces externos). */
export const esFotoGaleria = (url: string) => galeria().fotos.some((f) => f.url === url);

export type FotoVehiculo = { id: string; url: string; galeria: boolean };

/** Fotos de cada vehículo, la principal primero. */
export async function fotosPorVehiculo(): Promise<Map<string, FotoVehiculo[]>> {
  const rows = await db()`select id, vehiculo_id, url from vehiculo_fotos order by vehiculo_id, orden, id`;
  const m = new Map<string, FotoVehiculo[]>();
  for (const r of rows) {
    const f = { id: String(r.id), url: r.url ?? `/api/fotos/${r.id}`, galeria: !!r.url };
    m.set(r.vehiculo_id, [...(m.get(r.vehiculo_id) ?? []), f]);
  }
  return m;
}

/**
 * Fotos para mostrar: las del vehículo; si no tiene, la de la galería que coincida con su marca y línea
 * (así un Kia Picanto muestra la foto del Picanto del Instagram hasta que suban una propia).
 */
export function fotosParaMostrar(v: Row, propias?: FotoVehiculo[]): string[] {
  if (propias?.length) return propias.map((f) => f.url);
  const nombre = `${v.marca} ${v.modelo}`.toLowerCase();
  const g = galeria().fotos.find((f) => f.claves.some((c) => nombre.includes(c)));
  return g ? [g.url] : [];
}
