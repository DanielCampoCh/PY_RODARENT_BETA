import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { atender, type Conv } from "@/lib/agent";
import { enviarTexto, firmaValida, telDesdeWaId, waConfig } from "@/lib/whatsapp";
import { accionConductor, esAccionConductor } from "@/lib/servicios";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Verificación del webhook: Meta llama con hub.challenge al configurarlo. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const { verifyToken } = waConfig();
  if (verifyToken && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Token de verificación inválido", { status: 403 });
}

type WaMensaje = { id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string; payload?: string }; interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { title?: string } } };
type WaCambio = { value?: { messages?: WaMensaje[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } };

/** Mensajes entrantes. Responde 200 de inmediato y procesa después (Meta reintenta si tardamos). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!waConfig().activo) { console.warn("[whatsapp] Llegó un aviso pero faltan variables WHATSAPP_*"); return new NextResponse("WhatsApp no configurado", { status: 503 }); }
  if (!firmaValida(raw, req.headers.get("x-hub-signature-256"))) {
    console.warn(`[whatsapp] Firma inválida (cabecera ${req.headers.get("x-hub-signature-256") ? "presente" : "ausente"}). Revisa que WHATSAPP_APP_SECRET sea la clave secreta de ESTA app de Meta.`);
    return new NextResponse("Firma inválida", { status: 401 });
  }

  let body: { entry?: { changes?: (WaCambio & { field?: string })[] }[] };
  try { body = JSON.parse(raw); } catch { return new NextResponse("JSON inválido", { status: 400 }); }

  const pendientes: { msg: WaMensaje; nombre?: string }[] = [];
  let estados = 0;
  for (const e of body.entry ?? []) for (const ch of e.changes ?? []) {
    const contactos = ch.value?.contacts ?? [];
    estados += ((ch.value as { statuses?: unknown[] } | undefined)?.statuses ?? []).length;
    for (const m of ch.value?.messages ?? []) pendientes.push({ msg: m, nombre: contactos.find((c) => c.wa_id === m.from)?.profile?.name });
  }
  console.log(`[whatsapp] Aviso recibido: ${pendientes.length} mensaje(s)${pendientes.map((p) => ` de …${p.msg.from.slice(-4)} (${p.msg.type})`).join(",")}, ${estados} estado(s)`);
  if (pendientes.length) after(async () => { for (const p of pendientes) await enCola(p.msg.from, () => procesar(p.msg, p.nombre)); });
  return NextResponse.json({ ok: true });
}

// Procesa en orden los mensajes de un mismo número (si llegan varios seguidos).
const colas = new Map<string, Promise<void>>();
function enCola(clave: string, tarea: () => Promise<void>) {
  const previa = colas.get(clave) ?? Promise.resolve();
  const siguiente = previa.then(tarea, tarea).finally(() => { if (colas.get(clave) === siguiente) colas.delete(clave); });
  colas.set(clave, siguiente);
  return siguiente;
}

async function procesar(m: WaMensaje, nombrePerfil?: string) {
  const sql = db();
  // Evita procesar dos veces el mismo mensaje.
  const nuevo = await sql`insert into whatsapp_procesados (id) values (${m.id}) on conflict do nothing returning id`;
  if (!nuevo.length) return;

  const telefono = telDesdeWaId(m.from);
  const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;

  // Botón de un conductor (Tomar servicio, Terminado o Soltar): no pasa por el asistente.
  const payload = m.button?.payload ?? m.interactive?.button_reply?.id;
  if (esAccionConductor(payload)) {
    try { await accionConductor(telefono, payload!); } catch (e) { console.error("[whatsapp] Botón de conductor:", e instanceof Error ? e.message : e); }
    return;
  }

  let [conv] = await sql`select id, cliente_id, nombre, telefono, canal, estado, historial_api from conversaciones
    where canal = 'whatsapp' and telefono = ${telefono} and estado <> 'cerrada' limit 1`;
  if (!conv) {
    [conv] = await sql`insert into conversaciones (canal, telefono, nombre) values ('whatsapp', ${telefono}, ${nombrePerfil || telefono})
      on conflict do nothing returning id, cliente_id, nombre, telefono, canal, estado, historial_api`;
    if (!conv) [conv] = await sql`select id, cliente_id, nombre, telefono, canal, estado, historial_api from conversaciones where canal = 'whatsapp' and telefono = ${telefono} and estado <> 'cerrada' limit 1`;
  }

  try {
    if (!texto) {
      // Fotos, audios o documentos: por ahora no se procesan automáticamente.
      const aviso = m.type === "image" || m.type === "document"
        ? "Recibí tu archivo 📎 Un asesor lo revisará. Por ahora, si quieres cotizar o reservar, escríbeme en texto."
        : "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me escribes tu consulta?";
      await sql`insert into mensajes (conversacion_id, emisor, texto) values (${conv.id}, 'cliente', ${`[${m.type}]`})`;
      await sql`insert into mensajes (conversacion_id, emisor, texto) values (${conv.id}, 'ia', ${aviso})`;
      await sql`update conversaciones set ultima_actividad = now(), no_leidos = no_leidos + 1 where id = ${conv.id}`;
      await enviarTexto(m.from, aviso);
      return;
    }
    const r = await atender(conv as unknown as Conv, texto.slice(0, 1500));
    if (r.respuesta) {
      await enviarTexto(m.from, r.respuesta);
      console.log(`[whatsapp] Respuesta enviada a …${m.from.slice(-4)} (estado: ${r.estado})`);
    } else console.log(`[whatsapp] Sin respuesta automática para …${m.from.slice(-4)} (conversación con asesor)`);
  } catch (e) {
    console.error(`[whatsapp] Error con el mensaje de …${m.from.slice(-4)}:`, e instanceof Error ? e.message : e);
    await sql`insert into mensajes (conversacion_id, emisor, texto) values (${conv.id}, 'sistema', ${"No se pudo enviar la respuesta por WhatsApp: " + (e instanceof Error ? e.message : "error desconocido")})`;
    await sql`update conversaciones set estado = 'pendiente', no_leidos = no_leidos + 1 where id = ${conv.id}`;
  }
}
