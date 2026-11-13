import { db, fmtFechaHora, soloDigitos } from "./db";
import { enviarBotones, enviarPlantilla, enviarTexto, plantillas, waConfig } from "./whatsapp";
import { normalizarTel } from "./repo";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * Servicios con conductor por WhatsApp.
 * El servicio se envía a cada conductor activo con el botón «Tomar servicio»; el primero que lo pulsa se lo queda.
 * Para escribirle a un conductor fuera de la ventana de 24 horas, WhatsApp exige la plantilla aprobada «servicio_conductor».
 */

export type DatosServicio = {
  nombre: string; telefono: string; origen: string; destino: string; fecha: string; pasajeros: number; notas?: string;
  conversacionId?: string | null; clienteId?: string | null; canal: "chat" | "whatsapp" | "manual";
};

const ultimos10 = (t: string) => soloDigitos(t).slice(-10);
const primerNombre = (n: string) => String(n || "").split(" ")[0];

/** Conductor activo registrado con ese celular. */
export async function conductorPorTelefono(tel: string) {
  const u = ultimos10(tel);
  if (u.length < 10) return null;
  const [c] = await db()`select * from conductores where activo and right(regexp_replace(telefono, '\\D', '', 'g'), 10) = ${u} limit 1`;
  return c ?? null;
}

/** Texto del servicio (para el mensaje con botones; la plantilla lleva los mismos datos como parámetros). */
const textoServicio = (s: Row) => [
  `🚗 *Nuevo servicio ${s.codigo}*`,
  `📍 Recoger en: ${s.origen}`,
  `🏁 Destino: ${s.destino}`,
  `🕒 Cuándo: ${fmtFechaHora(s.fecha)}`,
  `👥 Pasajeros: ${s.pasajeros}`,
  s.notas ? `📝 ${s.notas}` : "",
  "",
  "El primero que pulse *Tomar servicio* se lo queda.",
].filter((l, i) => l !== "" || i === 6).join("\n");

/** Envía el servicio a un conductor: plantilla aprobada y, si no se puede, mensaje con botones (ventana de 24 h). */
async function enviarAConductor(tel: string, s: Row) {
  try {
    await enviarPlantilla(tel, plantillas().servicio, [s.codigo, s.origen, s.destino, fmtFechaHora(s.fecha), String(s.pasajeros), s.notas || "Sin notas"], [`tomar:${s.id}`]);
    return "plantilla";
  } catch (e) {
    try { await enviarBotones(tel, textoServicio(s), [{ id: `tomar:${s.id}`, titulo: "Tomar servicio" }]); return "botones"; }
    catch { throw e; }
  }
}

/** Envía el servicio a todos los conductores activos (menos el que se indique). Devuelve cuántos lo recibieron. */
export async function publicarServicio(s: Row, excluirTel?: string | null): Promise<{ enviados: number; fallidos: string[] }> {
  if (!waConfig().activo) return { enviados: 0, fallidos: ["WhatsApp no está configurado"] };
  const conductores = await db()`select nombre, telefono from conductores where activo order by nombre`;
  let enviados = 0;
  const fallidos: string[] = [];
  for (const c of conductores) {
    if (excluirTel && ultimos10(c.telefono) === ultimos10(excluirTel)) continue;
    try { await enviarAConductor(c.telefono, s); enviados++; }
    catch (e) { fallidos.push(`${c.nombre}: ${e instanceof Error ? e.message : "error"}`); console.error(`[servicios] No llegó a ${c.nombre}:`, e instanceof Error ? e.message : e); }
  }
  await db()`update servicios set enviados = ${enviados} where id = ${s.id}`;
  return { enviados, fallidos };
}

/** Registra un servicio de conductor y lo envía a los conductores. */
export async function crearServicio(d: DatosServicio, actor: string) {
  const sql = db();
  const [s] = await sql`insert into servicios (conversacion_id, cliente_id, nombre, telefono, origen, destino, fecha, pasajeros, notas, canal)
    values (${d.conversacionId ?? null}, ${d.clienteId ?? null}, ${d.nombre}, ${normalizarTel(d.telefono)}, ${d.origen}, ${d.destino}, ${d.fecha}, ${d.pasajeros}, ${d.notas ?? ""}, ${d.canal}) returning *`;
  let r = { enviados: 0, fallidos: [] as string[] };
  try { r = await publicarServicio(s); } catch (e) { console.error("[servicios] publicar", e instanceof Error ? e.message : e); }
  await sql`insert into notificaciones (texto) values (${`Servicio de conductor ${s.codigo}: ${d.origen} → ${d.destino}, ${fmtFechaHora(d.fecha)}${r.enviados ? ` · enviado a ${r.enviados} conductor(es) por WhatsApp` : " · NO llegó a ningún conductor: asígnalo desde Conductores"}`})`;
  await sql`insert into auditoria (actor, accion) values (${actor}, ${`Creó el servicio ${s.codigo} (${d.origen} → ${d.destino})`})`;
  return { servicio: s, publicado: r.enviados > 0, enviados: r.enviados };
}

/** Escribe al cliente por el canal donde pidió el servicio (chat web o WhatsApp). */
export async function avisarCliente(s: Row, texto: string) {
  if (!s.conversacion_id) return;
  const sql = db();
  const [k] = await sql`select id, canal, telefono from conversaciones where id = ${s.conversacion_id}`;
  if (!k) return;
  if (k.canal === "whatsapp" && k.telefono) {
    try { await enviarTexto(k.telefono, texto); } catch (e) { console.error("[servicios] WhatsApp al cliente", e instanceof Error ? e.message : e); }
  }
  await sql`insert into mensajes (conversacion_id, emisor, texto) values (${k.id}, 'ia', ${texto})`;
  // Se agrega al historial de la IA para que sepa qué se le dijo al cliente.
  const item = { role: "assistant", content: [{ type: "text", text: `[Aviso automático del sistema]: ${texto}` }] };
  await sql`update conversaciones set historial_api = historial_api || ${sql.json([item] as never)}::jsonb, ultima_actividad = now() where id = ${k.id}`;
}

/** Un conductor toma el servicio. Solo el primero lo consigue (actualización atómica). */
export async function tomarServicio(id: string, conductor: string, conductorTel: string | null) {
  const sql = db();
  const [s] = await sql`update servicios set estado = 'tomado', conductor = ${conductor}, conductor_tel = ${conductorTel}, tomado_en = now()
    where id = ${id} and estado = 'nuevo' returning *`;
  if (!s) { const [x] = await sql`select * from servicios where id = ${id}`; return { ok: false as const, servicio: x as Row | undefined }; }
  await sql`insert into notificaciones (texto) values (${`${conductor} tomó el servicio ${s.codigo} (${s.origen} → ${s.destino})`})`;
  await sql`insert into auditoria (actor, accion) values (${conductor + " (conductor)"}, ${`Tomó el servicio ${s.codigo}`})`;
  await avisarCliente(s, `¡Listo, ${primerNombre(s.nombre)}! 🚗 Tu servicio ${s.codigo} ya tiene conductor: ${conductor}. Te recogerá el ${fmtFechaHora(s.fecha)} en ${s.origen}. Él o un asesor te escribirán para coordinar los detalles.`);
  return { ok: true as const, servicio: s };
}

export async function soltarServicio(id: string, quien: string) {
  const sql = db();
  const [antes] = await sql`select conductor_tel from servicios where id = ${id}`;
  const [s] = await sql`update servicios set estado = 'nuevo', conductor = null, conductor_tel = null, tomado_en = null where id = ${id} and estado = 'tomado' returning *`;
  if (!s) return null;
  await sql`insert into notificaciones (texto) values (${`${quien} soltó el servicio ${s.codigo}: se envió de nuevo a los demás conductores`})`;
  try { await publicarServicio(s, antes?.conductor_tel); } catch (e) { console.error("[servicios] reenviar", e instanceof Error ? e.message : e); }
  return s;
}

export async function terminarServicio(id: string, quien: string) {
  const sql = db();
  const [s] = await sql`update servicios set estado = 'completado' where id = ${id} and estado = 'tomado' returning *`;
  if (!s) return null;
  await sql`insert into auditoria (actor, accion) values (${quien}, ${`Completó el servicio ${s.codigo}`})`;
  return s;
}

/** Botón pulsado por un conductor en WhatsApp («tomar:<id>», «fin:<id>» o «soltar:<id>»). */
export const esAccionConductor = (payload?: string | null) => !!payload && /^(tomar|fin|soltar):[0-9a-f-]{36}$/.test(payload);

export async function accionConductor(telefono: string, payload: string) {
  const responder = (t: string) => enviarTexto(telefono, t).catch((e) => console.error("[servicios] responder conductor", e instanceof Error ? e.message : e));
  const c = await conductorPorTelefono(telefono);
  if (!c) { await responder("Este número no está registrado como conductor activo. Pídele al administrador que te agregue en el panel."); return; }
  const [accion, id] = payload.split(":");
  const [s] = await db()`select * from servicios where id = ${id}`;
  if (!s) { await responder("Ese servicio ya no existe."); return; }
  const esSuyo = s.conductor_tel && ultimos10(s.conductor_tel) === ultimos10(c.telefono);

  if (accion === "tomar") {
    if (s.estado === "tomado" && esSuyo) { await responder(`El servicio ${s.codigo} ya es tuyo.`); return; }
    const r = await tomarServicio(s.id, c.nombre, c.telefono);
    if (!r.ok) {
      await responder(r.servicio?.estado === "tomado" ? `Gracias, ${primerNombre(c.nombre)}. El servicio ${s.codigo} ya lo tomó ${r.servicio.conductor}.` : `El servicio ${s.codigo} ya no está disponible.`);
      return;
    }
    const x = r.servicio;
    await enviarBotones(c.telefono, [
      `✅ *El servicio ${x.codigo} es tuyo.*`,
      `👤 Cliente: ${x.nombre} · 📞 ${x.telefono}`,
      `📍 Recoger en: ${x.origen}`,
      `🏁 Destino: ${x.destino}`,
      `🕒 ${fmtFechaHora(x.fecha)} · 👥 ${x.pasajeros} pasajero(s)`,
      x.notas ? `📝 ${x.notas}` : "",
      "",
      "Escríbele al cliente para coordinar. Cuando termines, pulsa *Terminado*. Si no puedes hacerlo, pulsa *Soltar* y se le envía a los demás.",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"), [{ id: `fin:${x.id}`, titulo: "Terminado" }, { id: `soltar:${x.id}`, titulo: "Soltar" }])
      .catch(() => responder(`✅ El servicio ${x.codigo} es tuyo. Cliente: ${x.nombre} · ${x.telefono}. Recoger en ${x.origen} el ${fmtFechaHora(x.fecha)}.`));
    return;
  }
  if (!esSuyo) { await responder(`Solo ${s.conductor ?? "el conductor asignado"} puede cambiar el servicio ${s.codigo}.`); return; }
  if (accion === "fin") {
    const r = await terminarServicio(s.id, `${c.nombre} (conductor)`);
    await responder(r ? `🏁 Servicio ${s.codigo} terminado. ¡Gracias, ${primerNombre(c.nombre)}!` : "El servicio ya cambió de estado.");
  } else {
    const r = await soltarServicio(s.id, c.nombre);
    await responder(r ? `Soltaste el servicio ${s.codigo}. Se lo enviamos a los demás conductores.` : "El servicio ya cambió de estado.");
  }
}
