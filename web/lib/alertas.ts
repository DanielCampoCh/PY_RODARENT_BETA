import { db, TZ } from "./db";
import type { Ajustes } from "./repo";
import { enviarPlantilla, enviarTexto, plantillas, waConfig } from "./whatsapp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type NivelAlerta = "vencido" | "urgente" | "proximo" | "info";
export type AlertaFlota = { clave: string; vehiculo: string; tipo: string; nivel: NivelAlerta; texto: string; dias?: number; fecha?: string };

/** Mismas reglas de la hoja del negocio: vencido (< 0 días), urgente (≤ 15), próximo (≤ 30). */
export const URGENTE_DIAS = 15;
export const PROXIMO_DIAS = 30;
/** Cambio de aceite: urgente a 500 km o menos, próximo a 1.000 km o menos. */
const ACEITE_URGENTE = 500;
const ACEITE_PROXIMO = 1000;

const DOCS: [campo: string, tipo: string, nombre: string][] = [
  ["soat_vence", "soat", "SOAT"],
  ["tecno_vence", "tecno", "Revisión tecnomecánica"],
  ["seguro_vence", "seguro", "Seguro todo riesgo"],
  ["extintor_vence", "extintor", "Extintor"],
  ["impuesto_vence", "impuesto", "Impuesto vehicular"],
  ["gps_recarga", "gps", "Recarga de la SIM del GPS"],
];
export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Fecha de hoy en Colombia (YYYY-MM-DD). */
export const hoyColombia = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
const fechaTexto = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const nombreVehiculo = (v: Row) => `${v.codigo ? v.codigo + " · " : ""}${v.marca} ${v.modelo} (${v.placa})`;
const ultimoDigito = (placa: string) => { const d = (placa || "").replace(/\D/g, ""); return d ? Number(d[d.length - 1]) : null; };

const nivelPorDias = (d: number): NivelAlerta | null => (d < 0 ? "vencido" : d <= URGENTE_DIAS ? "urgente" : d <= PROXIMO_DIAS ? "proximo" : null);

/** Calcula las alertas de la flota (documentos, aceite y pico y placa de mañana para los carros de Uber). */
export function alertasFlota(vehiculos: Row[], a: Ajustes, ahora = new Date()): AlertaFlota[] {
  const hoy = hoyColombia(ahora);
  const manana = hoyColombia(new Date(ahora.getTime() + 86400000));
  const diaManana = new Date(manana + "T12:00:00Z").getUTCDay();
  const out: AlertaFlota[] = [];
  for (const v of vehiculos) {
    if (v.estado === "inactivo") continue;
    const nombre = nombreVehiculo(v);
    for (const [campo, tipo, doc] of DOCS) {
      if (!v[campo]) continue;
      const fecha = new Date(v[campo]).toISOString().slice(0, 10);
      const d = diasEntre(hoy, fecha);
      const nivel = nivelPorDias(d);
      if (!nivel) continue;
      const cuando = d < 0 ? `venció hace ${-d} día(s) (${fechaTexto(fecha)})` : d === 0 ? "vence HOY" : `vence en ${d} día(s) (${fechaTexto(fecha)})`;
      out.push({ clave: `${tipo}:${v.id}:${fecha}:${nivel}`, vehiculo: v.id, tipo, nivel, dias: d, fecha, texto: `${doc} de ${nombre} ${cuando}.` });
    }
    if (v.km_actual != null && v.km_aceite != null) {
      const resta = v.km_aceite - v.km_actual;
      const nivel: NivelAlerta | null = resta <= 0 ? "vencido" : resta <= ACEITE_URGENTE ? "urgente" : resta <= ACEITE_PROXIMO ? "proximo" : null;
      if (nivel) out.push({
        clave: `aceite:${v.id}:${v.km_aceite}:${nivel}`, vehiculo: v.id, tipo: "aceite", nivel,
        texto: resta <= 0 ? `Cambio de aceite de ${nombre} atrasado ${(-resta).toLocaleString("es-CO")} km (tocaba a los ${v.km_aceite.toLocaleString("es-CO")} km).` : `Cambio de aceite de ${nombre} en ${resta.toLocaleString("es-CO")} km (a los ${v.km_aceite.toLocaleString("es-CO")} km).`,
      });
    }
    // Pico y placa (Cali, lunes a viernes): aviso el día anterior para los carros de Uber, para programar el mantenimiento.
    if (v.modalidad === "uber") {
      const digitos = a.picoPlaca?.[String(diaManana)] ?? [];
      const u = ultimoDigito(v.placa);
      if (u != null && digitos.includes(u)) out.push({
        clave: `pico:${v.id}:${manana}`, vehiculo: v.id, tipo: "pico_placa", nivel: "info", fecha: manana,
        texto: `Mañana ${DIAS_SEMANA[diaManana]} ${nombre} tiene pico y placa (placas terminadas en ${digitos.join(" y ")}): buen día para el mantenimiento.`,
      });
    }
  }
  const orden = { vencido: 0, urgente: 1, info: 2, proximo: 3 };
  return out.sort((x, y) => orden[x.nivel] - orden[y.nivel] || (x.dias ?? 0) - (y.dias ?? 0));
}

/**
 * Convierte en notificación las alertas que aún no se habían avisado (una sola vez por alerta y nivel)
 * y, si hay celulares de alertas en Ajustes, las envía por WhatsApp.
 */
export async function avisarAlertas(alertas: AlertaFlota[], a?: Ajustes) {
  if (!alertas.length) return 0;
  const sql = db();
  const nuevas: AlertaFlota[] = [];
  for (const al of alertas) {
    const r = await sql`insert into alertas_avisadas (clave) values (${al.clave}) on conflict do nothing returning clave`;
    if (r.length) nuevas.push(al);
  }
  for (const al of nuevas) await sql`insert into notificaciones (texto) values (${(al.nivel === "info" ? "🚦 " : al.nivel === "vencido" ? "⛔ " : "⚠️ ") + al.texto})`;
  if (nuevas.length) {
    await sql`delete from alertas_avisadas where fecha < now() - interval '180 days'`;
    try { await enviarAlertasWhatsApp(nuevas.map((x) => x.texto), a?.alertasWhatsapp ?? []); } catch (e) { console.error("[alertas] WhatsApp", e instanceof Error ? e.message : e); }
  }
  return nuevas.length;
}

/** Revisa la flota y avisa lo nuevo. */
export async function revisarAlertas(a: Ajustes) {
  const vs = await db()`select * from vehiculos where estado <> 'inactivo'`;
  const alertas = alertasFlota(vs, a);
  await avisarAlertas(alertas, a);
  return alertas;
}

/** Envía un resumen de las alertas nuevas a los celulares de Ajustes (plantilla «alerta_flota»; si no está aprobada, texto normal dentro de la ventana de 24 h). */
export async function enviarAlertasWhatsApp(textos: string[], celulares: string[]) {
  if (!textos.length || !celulares.length || !waConfig().activo) return;
  const resumen = textos.length === 1 ? textos[0] : `${textos.length} alertas: ${textos.join(" · ")}`;
  for (const tel of celulares) {
    try { await enviarPlantilla(tel, plantillas().alerta, [resumen.slice(0, 900)]); }
    catch {
      try { await enviarTexto(tel, `🔔 *Alertas de la flota*\n\n${textos.slice(0, 20).map((t) => "• " + t).join("\n")}`); }
      catch (e) { console.error(`[alertas] No llegó a …${tel.slice(-4)}:`, e instanceof Error ? e.message : e); }
    }
  }
}
