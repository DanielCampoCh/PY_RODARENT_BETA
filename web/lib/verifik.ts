/**
 * Verificación automática con fuentes oficiales vía Verifik (https://docs.verifik.co).
 * Regla: solo se marca "verificado" cuando la fuente lo confirma. Cualquier hallazgo,
 * homónimo o error deja el requisito pendiente para revisión humana. Nunca rechaza solo.
 */
import { db } from "./db";

export const verifikActivo = () => !!process.env.VERIFIK_TOKEN?.trim();

type Resultado = "ok" | "hallazgo" | "no_encontrado" | "error" | "no_aplica";
export type Consulta = { fuente: string; resultado: Resultado; detalle: string; referencia?: string };

async function llamar(ruta: string, params: Record<string, string>) {
  const base = process.env.VERIFIK_URL?.trim() || "https://api.verifik.co";
  const url = `${base}${ruta}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.VERIFIK_TOKEN?.trim()}`, Accept: "application/json", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { message: e instanceof Error ? e.message : "sin respuesta" } as Record<string, unknown> };
  }
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
/** El nombre oficial coincide si contiene al menos 2 palabras del nombre del cliente, incluida la primera. */
export function nombreCoincide(cliente: string, oficial: string) {
  const a = sinTildes(cliente).split(/\s+/).filter((t) => t.length > 1);
  const b = new Set(sinTildes(oficial).split(/\s+/));
  return a.length > 0 && b.has(a[0]) && a.filter((t) => b.has(t)).length >= Math.min(2, a.length);
}

const fechaDMY = (s?: string) => { const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T23:59:59-05:00`) : null; };
const errorTexto = (r: { status: number; json: Record<string, unknown> | null }) =>
  r.status === 0 ? "La fuente no respondió" : `La fuente respondió con error ${r.status}${r.json?.message ? `: ${String(r.json.message).slice(0, 120)}` : ""}`;

export type ResumenVerificacion = {
  consultas: Consulta[];
  identidad: "verificado" | "pendiente";
  licencia: "verificado" | "pendiente";
  antecedentes: "verificado" | "pendiente";
  nombreOficial?: string;
};

/** Consulta RUNT (licencia), Policía y Procuraduría en paralelo y resume el resultado. */
export async function verificarPersona(p: { tipo: string; numero: string; nombre: string; fin?: string; categorias: string[] }): Promise<ResumenVerificacion> {
  const tipo = p.tipo === "PAS" ? "PA" : p.tipo;
  const params = { documentType: tipo, documentNumber: p.numero };
  const [runt, policia, procu] = await Promise.all([
    llamar("/v2/co/runt/conductor", params),
    llamar("/v2/co/policia/consultar", params),
    ["CC", "CE", "PEP"].includes(tipo) ? llamar("/v2/co/procuraduria/antecedentes", params) : Promise.resolve(null),
  ]);
  const consultas: Consulta[] = [];
  const nombres: string[] = [];

  // Licencia (RUNT)
  if (runt.status === 200 && runt.json?.data) {
    const d = runt.json.data as { fullName?: string; driverStatus?: string; licenses?: { category?: string; status?: string; dueDate?: string }[]; infractions?: { tieneMultas?: string } };
    if (d.fullName) nombres.push(d.fullName);
    const limite = p.fin ? new Date(p.fin) : new Date();
    const validas = (d.licenses ?? []).filter((l) => /ACTIV/i.test(l.status ?? "") && p.categorias.includes(String(l.category).toUpperCase()) && (fechaDMY(l.dueDate)?.getTime() ?? 0) >= limite.getTime());
    const conductorActivo = !d.driverStatus || /ACTIV/i.test(d.driverStatus);
    const multas = /^S/i.test(d.infractions?.tieneMultas ?? "") ? " Tiene multas de tránsito registradas." : "";
    if (validas.length && conductorActivo) consultas.push({ fuente: "RUNT · licencia", resultado: "ok", detalle: `Licencia ${validas.map((l) => `${l.category} vence ${l.dueDate}`).join(", ")}.${multas}`, referencia: String(runt.json.id ?? "") });
    else consultas.push({ fuente: "RUNT · licencia", resultado: "hallazgo", detalle: `${conductorActivo ? "" : `Conductor ${d.driverStatus}. `}Sin licencia activa de categoría ${p.categorias.join("/")} vigente para las fechas. Licencias: ${(d.licenses ?? []).map((l) => `${l.category} ${l.status} ${l.dueDate}`).join("; ") || "ninguna"}.${multas}`, referencia: String(runt.json.id ?? "") });
  } else consultas.push({ fuente: "RUNT · licencia", resultado: runt.status === 404 ? "no_encontrado" : "error", detalle: runt.status === 404 ? "El RUNT no tiene licencia registrada para ese documento." : errorTexto(runt) });

  // Policía (antecedentes judiciales)
  if (policia.status === 200 && policia.json?.data) {
    const d = policia.json.data as { fullName?: string; details?: string };
    if (d.fullName) nombres.push(d.fullName);
    const det = sinTildes(d.details ?? "");
    const r: Resultado = det.includes("NO TIENE ASUNTOS PENDIENTES") ? "ok" : det.includes("REGISTRA") ? "hallazgo" : "error";
    consultas.push({ fuente: "Policía · antecedentes judiciales", resultado: r, detalle: r === "ok" ? "No tiene asuntos pendientes con las autoridades judiciales." : r === "hallazgo" ? "Registra asuntos pendientes. Revisar el certificado oficial." : "La Policía no generó el certificado en línea; requiere consulta manual.", referencia: String(policia.json.id ?? "") });
  } else consultas.push({ fuente: "Policía · antecedentes judiciales", resultado: policia.status === 404 ? "no_encontrado" : "error", detalle: policia.status === 404 ? "Documento no encontrado en la Policía." : errorTexto(policia) });

  // Procuraduría (antecedentes disciplinarios)
  if (!procu) consultas.push({ fuente: "Procuraduría · disciplinarios", resultado: "no_aplica", detalle: `La Procuraduría no admite documentos tipo ${tipo}; requiere revisión manual.` });
  else if (procu.status === 200 && procu.json?.data) {
    const d = procu.json.data as { fullName?: string; hasRecord?: boolean; antecedentes?: unknown[] };
    if (d.fullName) nombres.push(d.fullName);
    const tiene = d.hasRecord === true || (d.antecedentes?.length ?? 0) > 0;
    consultas.push({ fuente: "Procuraduría · disciplinarios", resultado: tiene ? "hallazgo" : "ok", detalle: tiene ? `Registra ${d.antecedentes?.length ?? 1} antecedente(s). Revisar en la Procuraduría.` : "Sin antecedentes disciplinarios.", referencia: String(procu.json.id ?? "") });
  } else consultas.push({ fuente: "Procuraduría · disciplinarios", resultado: procu.status === 404 ? "no_encontrado" : "error", detalle: procu.status === 404 ? "Documento no encontrado en la Procuraduría." : errorTexto(procu) });

  // Identidad: el nombre de las fuentes oficiales debe coincidir con el que dio el cliente.
  const nombreOficial = nombres[0];
  const identidadOk = nombres.length > 0 && nombres.every((n) => nombreCoincide(p.nombre, n));
  consultas.unshift({
    fuente: "Identidad · nombre oficial", resultado: nombres.length === 0 ? "no_encontrado" : identidadOk ? "ok" : "hallazgo",
    detalle: nombres.length === 0 ? "Ninguna fuente devolvió el nombre del titular." : identidadOk ? `Coincide con ${nombreOficial}.` : `El nombre registrado (${nombreOficial}) no coincide con el que dio el cliente.`,
  });

  const r = (f: string) => consultas.find((c) => c.fuente.startsWith(f))?.resultado;
  return {
    consultas,
    nombreOficial,
    identidad: identidadOk ? "verificado" : "pendiente",
    // La licencia solo cuenta si además la identidad coincide (evita usar la cédula de otra persona).
    licencia: identidadOk && r("RUNT") === "ok" ? "verificado" : "pendiente",
    antecedentes: identidadOk && r("Policía") === "ok" && r("Procuraduría") === "ok" ? "verificado" : "pendiente",
  };
}

/**
 * Verifica a un cliente, guarda la traza y actualiza sus requisitos.
 * Solo sube estados a "verificado"; nunca baja ni rechaza (eso lo decide una persona).
 */
export async function verificarCliente(clienteId: string, actor: string, fin?: string) {
  const sql = db();
  const [c] = await sql`select * from clientes where id = ${clienteId}`;
  if (!c) throw new Error("Cliente no encontrado");
  if (!c.consentimiento_antecedentes) throw new Error("El cliente no ha autorizado la consulta de antecedentes y licencia.");
  const [m] = await sql`select valor from configuracion where clave = 'ajustes'`;
  const categorias: string[] = m?.valor?.categorias ?? ["B1", "B2", "C1"];
  const [tipo, numero] = String(c.documento ?? "").split(" ");
  if (!numero) throw new Error("El cliente no tiene número de documento.");

  const res = await verificarPersona({ tipo, numero, nombre: c.nombre, fin, categorias });
  for (const q of res.consultas) {
    await sql`insert into verificaciones_externas (cliente_id, fuente, resultado, detalle, referencia, actor) values (${c.id}, ${q.fuente}, ${q.resultado}, ${q.detalle}, ${q.referencia ?? null}, ${actor})`;
  }
  // No se pisa un "rechazado" que haya decidido una persona.
  const actual = (c.verificacion ?? {}) as Record<string, string>;
  const subir = Object.fromEntries((["identidad", "licencia", "antecedentes"] as const).filter((k) => res[k] === "verificado" && actual[k] !== "rechazado").map((k) => [k, "verificado"]));
  // "antecedentes" se marca pendiente si nunca se había evaluado, para que el panel lo muestre.
  await sql`update clientes set verificacion = jsonb_build_object('antecedentes', 'pendiente') || verificacion || ${sql.json(subir)}::jsonb where id = ${c.id}`;
  const hallazgos = res.consultas.filter((q) => q.resultado !== "ok");
  await sql`insert into auditoria (actor, accion) values (${actor}, ${`Verificación automática de ${c.nombre}: ${Object.keys(subir).join(", ") || "nada"} verificado${hallazgos.length ? `; ${hallazgos.length} punto(s) para revisión humana` : ""}`})`;
  if (hallazgos.length) await sql`insert into notificaciones (texto) values (${`Revisar verificación de ${c.nombre}: ${hallazgos.map((h) => h.fuente).join(", ")}`})`;
  return { ...res, verificados: Object.keys(subir), revisar: hallazgos.map((h) => h.fuente) };
}
