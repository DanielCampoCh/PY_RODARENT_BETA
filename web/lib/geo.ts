/**
 * Ubicaciones: convertir coordenadas en dirección (y al revés) con OpenStreetMap (Nominatim).
 * Nominatim es gratis con dos condiciones: identificarse con un User-Agent propio y no pasar de ~1 consulta por segundo.
 * Por eso las respuestas se guardan en memoria y la ruta /api/ubicacion tiene límite por IP.
 */
const BASE = () => process.env.GEOCODER_URL?.trim() || "https://nominatim.openstreetmap.org";
const UA = "RodaRent/1.0 (reservas de alquiler de vehiculos en Cali)";

/** numero: «# 3-45». aproximado: true si el número se estimó (el cliente debe confirmarlo). */
export type Direccion = { direccion: string; barrio: string; ciudad: string; via?: string; numero?: string; aproximado?: boolean };

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
function armar(a: Addr, nombre?: string, numero?: string | null): Direccion {
  const calle = a.road || a.pedestrian || a.footway || "";
  const num = a.house_number ? (/#/.test(a.house_number) ? a.house_number : `# ${a.house_number}`) : numero || "";
  const via = [calle, num].filter(Boolean).join(" ");
  const barrio = a.neighbourhood || a.suburb || a.quarter || a.city_district || "";
  const ciudad = (a.city || a.town || a.village || a.municipality || "").replace(/\s+ciudad$/i, "");
  const partes = [nombre && nombre !== via ? nombre : "", via, barrio, ciudad].filter(Boolean);
  return { direccion: [...new Set(partes)].join(", "), barrio, ciudad, via: calle, numero: num || undefined, aproximado: !a.house_number && !!numero };
}

/** Dirección aproximada de unas coordenadas, o null si el servicio no responde. */
export async function direccionDe(lat: number, lng: number, { conNumero = true } = {}): Promise<Direccion | null> {
  const g = await google(`latlng=${lat.toFixed(6)},${lng.toFixed(6)}&result_type=street_address|premise`);
  if (g?.[0]) {
    const c = (t: string) => g[0].address_components.find((x) => x.types.includes(t))?.long_name ?? "";
    return { direccion: limpiarGoogle(g[0].formatted_address), barrio: c("neighborhood") || c("sublocality"), ciudad: c("locality") };
  }
  try {
    const j = (await nominatim(`/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`)) as { address?: Addr; name?: string; error?: string };
    if (!j?.address) return null;
    const calle = j.address.road || "";
    const numero = conNumero && !j.address.house_number && calle ? await numeroEstimado(lat, lng, calle) : null;
    return armar(j.address, j.name, numero);
  } catch (e) {
    console.error("[geo] reverse", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Busca una dirección escrita a mano (prioriza Cali). Devuelve el primer resultado o null. */
export async function buscarDireccion(q: string): Promise<{ lat: number; lng: number; direccion: string } | null> {
  const texto = /cali|valle|jamund|palmira|yumbo/i.test(q) ? q : `${q}, Cali`;
  const g = await google(`address=${encodeURIComponent(texto)}&components=country:CO`);
  if (g?.[0]) return { lat: g[0].geometry.location.lat, lng: g[0].geometry.location.lng, direccion: limpiarGoogle(g[0].formatted_address) };
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

/* ---------- Número de la dirección al estilo colombiano («Carrera 24 # 3-45») ---------- */
// OpenStreetMap casi nunca tiene el número de la casa en Colombia. Lo estimamos con la nomenclatura:
// en «Carrera 24 # 3-45», 3 es la calle transversal donde empieza la cuadra y 45 los metros desde esa esquina.
// Se busca en Overpass (datos de OpenStreetMap) las calles transversales cercanas al punto.

// Servidores públicos de Overpass: a veces uno está caído o lento, por eso se consultan varios a la vez y gana el primero.
const OVERPASS = () => (process.env.OVERPASS_URL?.trim() || "https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.private.coffee/api/interpreter").split(",").map((u) => u.trim()).filter(Boolean);
type Pt = { lat: number; lon: number };

/** Tipo de vía y número: «Carrera 24», «Avenida Calle 5», «Calle 3A», «Calle 25 Norte». */
function partesVia(nombre: string) {
  const m = nombre.match(/\b(Calle|Carrera|Diagonal|Transversal|Avenida|Autopista)\b\s*(?:(Calle|Carrera)\s*)?(\d+\s?[A-Z]?(?:\s?Bis)?(?:\s?(?:Norte|Sur|Oeste|Este|N))?)\b/i);
  if (!m) return null;
  const tipo = (m[2] || m[1]).toLowerCase();
  const eje = /calle|diagonal/.test(tipo) ? "calle" : /carrera|transversal/.test(tipo) ? "carrera" : null;
  return eje ? { eje, numero: m[3].replace(/\s+/g, " ").trim() } : null;
}
const valor = (n: string) => { const m = n.match(/^(\d+)\s?([A-Z])?/i); return m ? +m[1] + (m[2] ? (m[2].toUpperCase().charCodeAt(0) - 64) / 30 : 0) : 0; };

function aSegmento(p: Pt, a: Pt, b: Pt) {
  const kx = Math.cos(p.lat * Math.PI / 180) * 111320, ky = 110540;
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, bx = (b.lon - p.lon) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Estima «# 3-45» para un punto sobre una vía. Devuelve null si no hay datos suficientes.
 * Es aproximado (±15 m): por eso la página le pide al cliente confirmarlo.
 */
export async function numeroEstimado(lat: number, lng: number, via: string): Promise<string | null> {
  const p = partesVia(via);
  if (!p) return null;
  const cruce = p.eje === "calle" ? "Carrera|Transversal" : "Calle|Diagonal";
  const q = `[out:json][timeout:25];way(around:180,${lat.toFixed(6)},${lng.toFixed(6)})[highway][name~"(${cruce})",i];out tags geom;`;
  const clave = "overpass:" + q;
  try {
    let j = cache.get(clave) as { elements?: { tags?: { name?: string }; geometry?: Pt[] }[] } | undefined;
    if (!j) {
      j = await Promise.any(OVERPASS().map(async (base) => {
        const r = await fetch(`${base}?data=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
        return (await r.json()) as typeof j;
      }));
      cache.set(clave, j);
    }
    const punto = { lat, lon: lng };
    // Distancia del punto a cada calle transversal (por número).
    const porNumero = new Map<string, number>();
    for (const w of j?.elements ?? []) {
      const pv = w.tags?.name ? partesVia(w.tags.name) : null;
      if (!pv || pv.eje === p.eje || !w.geometry || w.geometry.length < 2) continue;
      let d = Infinity;
      for (let i = 1; i < w.geometry.length; i++) d = Math.min(d, aSegmento(punto, w.geometry[i - 1], w.geometry[i]));
      if (d < (porNumero.get(pv.numero) ?? Infinity)) porNumero.set(pv.numero, d);
    }
    const cercanas = [...porNumero.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2);
    if (!cercanas.length || cercanas[0][1] > 150) return null;
    // La cuadra empieza en la transversal de número menor de las dos que la encierran.
    const [inicio] = cercanas.length === 2 && cercanas[1][1] < 150 ? [...cercanas].sort((a, b) => valor(a[0]) - valor(b[0])) : cercanas;
    const m = Math.max(1, Math.round(inicio[1]));
    if (m > 140) return null;
    return `# ${inicio[0].replace(/ /g, "")}-${String(m).padStart(2, "0")}`;
  } catch (e) {
    console.error("[geo] número", e instanceof AggregateError ? "ningún servidor de Overpass respondió" : e instanceof Error ? e.message : e);
    return null;
  }
}

/* ---------- Google Maps (opcional): direcciones exactas si se configura GOOGLE_MAPS_API_KEY ---------- */
const claveGoogle = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
async function google(params: string): Promise<{ formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: { long_name: string; types: string[] }[]; types: string[] }[] | null> {
  if (!claveGoogle()) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?language=es&region=co&${params}&key=${claveGoogle()}`;
  const key = url.replace(claveGoogle(), "");
  if (cache.has(key)) return cache.get(key) as never;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.status !== "OK") { if (j.status !== "ZERO_RESULTS") console.error("[geo] Google", j.status, j.error_message ?? ""); return null; }
    cache.set(key, j.results);
    return j.results;
  } catch (e) { console.error("[geo] Google", e instanceof Error ? e.message : e); return null; }
}
const limpiarGoogle = (s: string) => s.replace(/,\s*(Valle del Cauca|Colombia)\b/g, "").replace(/,\s*\d{6}\b/g, "").trim();
