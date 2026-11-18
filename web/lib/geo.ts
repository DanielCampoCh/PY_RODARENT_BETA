/**
 * Ubicaciones: convertir coordenadas en dirección (y al revés) con OpenStreetMap (Nominatim).
 * Nominatim es gratis con dos condiciones: identificarse con un User-Agent propio y no pasar de ~1 consulta por segundo.
 * Por eso las respuestas se guardan en memoria y la ruta /api/ubicacion tiene límite por IP.
 */
const BASE = () => process.env.GEOCODER_URL?.trim() || "https://nominatim.openstreetmap.org";
const UA = "RodaRent/1.0 (reservas de alquiler de vehiculos en Cali)";

export type Direccion = { direccion: string; barrio: string; ciudad: string };

/** Coordenadas dentro de Colombia (con margen): evita guardar ubicaciones absurdas. */
export const enColombia = (lat: number, lng: number) => lat >= -4.5 && lat <= 13.6 && lng >= -82.2 && lng <= -66.7;
/** Enlace para abrir el punto en Google Maps (funciona en celular y computador). */
export const enlaceMapa = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

const cache = new Map<string, unknown>();
let ultima = 0;

async function nominatim(ruta: string): Promise<unknown> {
  const url = `${BASE()}${ruta}`;
  if (cache.has(url)) return cache.get(url);
  // Respeta ~1 consulta por segundo hacia Nominatim.
  const espera = ultima + 1100 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
  const j = await r.json();
  if (cache.size > 2000) cache.clear();
  cache.set(url, j);
  return j;
}

type Addr = Record<string, string | undefined>;
function armar(a: Addr, nombre?: string): Direccion {
  const via = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(" # ");
  const barrio = a.neighbourhood || a.suburb || a.quarter || a.city_district || "";
  const ciudad = (a.city || a.town || a.village || a.municipality || "").replace(/\s+ciudad$/i, "");
  const partes = [nombre && nombre !== via ? nombre : "", via, barrio, ciudad].filter(Boolean);
  return { direccion: [...new Set(partes)].join(", "), barrio, ciudad };
}

/** Dirección aproximada de unas coordenadas, o null si el servicio no responde. */
export async function direccionDe(lat: number, lng: number): Promise<Direccion | null> {
  try {
    const j = (await nominatim(`/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`)) as { address?: Addr; name?: string; error?: string };
    if (!j?.address) return null;
    return armar(j.address, j.name);
  } catch (e) {
    console.error("[geo] reverse", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Busca una dirección escrita a mano (prioriza Cali). Devuelve el primer resultado o null. */
export async function buscarDireccion(q: string): Promise<{ lat: number; lng: number; direccion: string } | null> {
  const texto = /cali|valle|jamund|palmira|yumbo/i.test(q) ? q : `${q}, Cali`;
  try {
    const j = (await nominatim(`/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=co&viewbox=-76.75,3.6,-76.35,3.25&q=${encodeURIComponent(texto)}`)) as { lat: string; lon: string; address?: Addr; name?: string }[];
    const r = j?.[0];
    if (!r) return null;
    const lat = Number(r.lat), lng = Number(r.lon);
    return { lat, lng, direccion: r.address ? armar(r.address, r.name).direccion : texto };
  } catch (e) {
    console.error("[geo] search", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Texto con el que se le pasa una ubicación al asistente (mismo formato en la web y en WhatsApp). */
export function textoUbicacion(u: { direccion?: string | null; indicaciones?: string | null; lat?: number | null; lng?: number | null }) {
  return [
    `📍 Mi ubicación: ${u.direccion || "(sin dirección)"}`,
    u.indicaciones ? `Indicaciones: ${u.indicaciones}` : "",
    u.lat != null && u.lng != null ? `Mapa: ${enlaceMapa(u.lat, u.lng)}` : "",
  ].filter(Boolean).join("\n");
}
