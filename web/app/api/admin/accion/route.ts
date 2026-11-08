import { NextResponse } from "next/server";
import { z } from "zod";
import { db, dias, esCruce, fmtFecha } from "@/lib/db";
import { actorDe, usuarioActual, type Usuario } from "@/lib/auth";
import { crearReserva, upsertCliente } from "@/lib/repo";
import { enviarTexto, ErrorWhatsApp } from "@/lib/whatsapp";

const ETIQ: Record<string, string> = { pendiente: "Pendiente", aprobada: "Confirmada", en_curso: "En curso", finalizada: "Finalizada", rechazada: "Rechazada", vencida: "Vencida", cancelada: "Cancelada" };
const VERIF = z.enum(["verificado", "pendiente", "rechazado"]);
const REQ = ["identidad", "licencia", "edad", "contacto", "deposito"] as const;
const id = z.string().uuid();
const fecha = z.string().datetime({ offset: true });

const Accion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("aprobar"), id }),
  z.object({ tipo: z.literal("rechazar"), id, motivo: z.string().min(2).max(200) }),
  z.object({ tipo: z.literal("extender"), id }),
  z.object({ tipo: z.literal("entregar"), id }),
  z.object({ tipo: z.literal("devolver"), id }),
  z.object({ tipo: z.literal("cancelar"), id }),
  z.object({ tipo: z.literal("vista"), id }),
  z.object({ tipo: z.literal("fechas"), id, inicio: fecha, fin: fecha }),
  z.object({ tipo: z.literal("verificar"), clienteId: id, clave: z.enum(REQ), valor: VERIF }),
  z.object({
    tipo: z.literal("crear_reserva"), clienteId: id.optional(), vehiculoId: id, inicio: fecha, fin: fecha, lugar: z.string().min(2).max(120), notas: z.string().max(500).default(""),
    nuevo: z.object({ nombre: z.string().trim().min(5).max(120), documento: z.string().trim().min(5).max(20), telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/), email: z.string().trim().max(200).optional() }).optional(),
  }),
  z.object({
    tipo: z.literal("guardar_vehiculo"), id: id.optional(),
    data: z.object({
      marca: z.string().trim().min(1).max(40), modelo: z.string().trim().min(1).max(60), placa: z.string().trim().toUpperCase().regex(/^[A-Z]{3}-?\d{2}[0-9A-Z]$/, "Placa inválida (ABC-123)."),
      anio: z.number().int().min(1990).max(2100), tipo: z.enum(["sedan", "hatch", "suv", "pickup", "van"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      capacidad: z.number().int().min(1).max(30), maletas: z.number().int().min(0).max(20), transmision: z.string().max(20), combustible: z.string().max(20),
      precio: z.number().int().positive(), deposito: z.number().int().min(0), estado: z.enum(["disponible", "mantenimiento", "inactivo"]),
    }),
  }),
  z.object({ tipo: z.literal("tomar_conv"), id }),
  z.object({ tipo: z.literal("devolver_conv"), id }),
  z.object({ tipo: z.literal("leer_conv"), id }),
  z.object({ tipo: z.literal("responder_conv"), id, texto: z.string().trim().min(1).max(2000) }),
  z.object({ tipo: z.literal("leer_notifs") }),
  z.object({
    tipo: z.literal("ajustes"),
    data: z.object({
      edadMinima: z.number().int().min(18).max(30), licenciaVigente: z.boolean(), categorias: z.array(z.string()).min(1), depositoObligatorio: z.boolean(),
      experienciaActiva: z.boolean(), experienciaMin: z.number().int().min(0).max(15), docAdicional: z.boolean(),
      prereservaHoras: z.number().int().min(1).max(96), recordatorioHoras: z.number().int().min(1).max(72), retencionDias: z.number().int().min(7).max(365),
    }),
  }),
]);

const SOLO_ADMIN = new Set(["aprobar", "verificar", "guardar_vehiculo", "ajustes"]);

class Fallo extends Error { constructor(m: string, public status = 400) { super(m); } }

export async function POST(req: Request) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" ") }, { status: 400 });
  const a = parsed.data;
  if (SOLO_ADMIN.has(a.tipo) && u.rol !== "admin") return NextResponse.json({ error: "Solo el administrador puede hacer esto." }, { status: 403 });
  try {
    const out = await ejecutar(a, u);
    return NextResponse.json({ ok: true, ...(out ?? {}) });
  } catch (e) {
    if (e instanceof Fallo) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esCruce(e)) return NextResponse.json({ error: "Conflicto: el vehículo ya tiene otra reserva en esas fechas." }, { status: 409 });
    throw e;
  }
}

async function ejecutar(a: z.infer<typeof Accion>, u: Usuario): Promise<Record<string, unknown> | void> {
  const sql = db();
  const actor = actorDe(u);
  const log = (accion: string) => sql`insert into auditoria (actor, accion) values (${actor}, ${accion})`;
  const reserva = async (rid: string) => { const [r] = await sql`select * from reservas where id = ${rid}`; if (!r) throw new Fallo("Reserva no encontrada", 404); return r; };
  const cambiar = async (rid: string, desde: string[], hacia: string, nota?: string) => {
    const r = await reserva(rid);
    if (!desde.includes(r.estado)) throw new Fallo(`No se puede pasar de ${ETIQ[r.estado]} a ${ETIQ[hacia]}.`, 409);
    await sql`update reservas set estado = ${hacia}, expira_en = ${hacia === "pendiente" ? r.expira_en : null}, nueva = false where id = ${rid}`;
    const texto = `${ETIQ[r.estado]} → ${ETIQ[hacia]}${nota ? " · " + nota : ""}`;
    await sql`insert into reserva_historial (reserva_id, texto, actor) values (${rid}, ${texto}, ${actor})`;
    await log(`${ETIQ[hacia]}: ${r.codigo}${nota ? " · " + nota : ""}`);
    return r;
  };

  switch (a.tipo) {
    case "aprobar": {
      const r = await reserva(a.id);
      const [c] = await sql`select nombre, verificacion from clientes where id = ${r.cliente_id}`;
      const pendientes = REQ.filter((k) => c.verificacion?.[k] !== "verificado");
      if (pendientes.length) throw new Fallo(`No se puede aprobar: requisitos sin verificar (${pendientes.join(", ")}).`, 409);
      if (r.expira_en && new Date(r.expira_en) < new Date()) throw new Fallo("La pre-reserva ya venció.", 409);
      await cambiar(a.id, ["pendiente"], "aprobada", "Requisitos verificados");
      await sql`insert into notificaciones (texto) values (${`Confirmación de ${r.codigo} lista para enviar a ${c.nombre} (envío por WhatsApp/correo aún no conectado)`})`;
      return;
    }
    case "rechazar": await cambiar(a.id, ["pendiente"], "rechazada", a.motivo); return;
    case "entregar": await cambiar(a.id, ["aprobada"], "en_curso", "Vehículo entregado"); return;
    case "devolver": await cambiar(a.id, ["en_curso"], "finalizada", "Vehículo devuelto"); return;
    case "cancelar": await cambiar(a.id, ["pendiente", "aprobada"], "cancelada"); return;
    case "vista": await sql`update reservas set nueva = false where id = ${a.id}`; return;
    case "extender": {
      const r = await reserva(a.id);
      if (r.estado !== "pendiente") throw new Fallo("Solo se extienden pre-reservas pendientes.", 409);
      await sql`update reservas set expira_en = greatest(expira_en, now()) + interval '24 hours' where id = ${a.id}`;
      await sql`insert into reserva_historial (reserva_id, texto, actor) values (${a.id}, 'Plazo de pre-reserva extendido 24 h', ${actor})`;
      await log(`Extendió plazo de ${r.codigo}`);
      return;
    }
    case "fechas": {
      const r = await reserva(a.id);
      if (!["pendiente", "aprobada", "en_curso"].includes(r.estado)) throw new Fallo("Esta reserva ya está cerrada.", 409);
      if (new Date(a.fin) <= new Date(a.inicio)) throw new Fallo("La devolución debe ser posterior a la recogida.");
      const n = dias(a.inicio, a.fin);
      await sql`update reservas set inicio = ${a.inicio}, fin = ${a.fin}, dias = ${n}, total = ${n * r.precio_dia} where id = ${a.id}`;
      await sql`insert into reserva_historial (reserva_id, texto, actor) values (${a.id}, ${`Fechas: ${fmtFecha(r.inicio)}→${fmtFecha(r.fin)} cambiadas a ${fmtFecha(a.inicio)}→${fmtFecha(a.fin)}`}, ${actor})`;
      await log(`Modificó fechas de ${r.codigo}`);
      return;
    }
    case "verificar": {
      const [c] = await sql`select nombre, verificacion from clientes where id = ${a.clienteId}`;
      if (!c) throw new Fallo("Cliente no encontrado", 404);
      const antes = c.verificacion?.[a.clave] ?? "pendiente";
      await sql`update clientes set verificacion = jsonb_set(verificacion, ${[a.clave]}, ${sql.json(a.valor)}) where id = ${a.clienteId}`;
      await log(`Verificación "${a.clave}" de ${c.nombre}: ${antes} → ${a.valor} (manual)`);
      return;
    }
    case "crear_reserva": {
      let clienteId = a.clienteId;
      if (!clienteId) {
        if (!a.nuevo) throw new Fallo("Elige un cliente o registra uno nuevo.");
        const c = await upsertCliente({ ...a.nuevo, origen: "manual", consentimiento: true });
        if (!c.ok) throw new Fallo(c.error, 409);
        clienteId = c.cliente.id as string;
      }
      const [c] = await sql`select verificacion from clientes where id = ${clienteId}`;
      const verificado = REQ.every((k) => c?.verificacion?.[k] === "verificado");
      const r = await crearReserva({ clienteId, vehiculoId: a.vehiculoId, inicio: a.inicio, fin: a.fin, lugar: a.lugar, origen: "manual", estado: verificado ? "aprobada" : "pendiente", notas: a.notas, actor });
      if (!r.ok) throw new Fallo(r.error, 409);
      return { id: r.reserva.id, codigo: r.reserva.codigo };
    }
    case "guardar_vehiculo": {
      const d = a.data;
      const placa = d.placa.includes("-") ? d.placa : `${d.placa.slice(0, 3)}-${d.placa.slice(3)}`;
      const [dup] = await sql`select id from vehiculos where replace(placa, '-', '') = ${placa.replace("-", "")} and id <> ${a.id ?? "00000000-0000-0000-0000-000000000000"}`;
      if (dup) throw new Fallo("Ya existe un vehículo con esa placa.", 409);
      if (a.id) {
        await sql`update vehiculos set marca=${d.marca}, modelo=${d.modelo}, placa=${placa}, anio=${d.anio}, tipo=${d.tipo}, color=${d.color}, capacidad=${d.capacidad},
          maletas=${d.maletas}, transmision=${d.transmision}, combustible=${d.combustible}, precio_dia=${d.precio}, deposito=${d.deposito}, estado=${d.estado}, actualizado_en=now() where id=${a.id}`;
        await log(`Editó ${d.marca} ${d.modelo} (${placa})`);
      } else {
        await sql`insert into vehiculos (marca, modelo, placa, anio, tipo, color, capacidad, maletas, transmision, combustible, precio_dia, deposito, estado)
          values (${d.marca}, ${d.modelo}, ${placa}, ${d.anio}, ${d.tipo}, ${d.color}, ${d.capacidad}, ${d.maletas}, ${d.transmision}, ${d.combustible}, ${d.precio}, ${d.deposito}, ${d.estado})`;
        await log(`Agregó ${d.marca} ${d.modelo} (${placa})`);
      }
      return;
    }
    case "tomar_conv": {
      const [k] = await sql`update conversaciones set estado = 'humano', no_leidos = 0 where id = ${a.id} returning nombre`;
      if (!k) throw new Fallo("Conversación no encontrada", 404);
      await sql`insert into mensajes (conversacion_id, emisor, texto) values (${a.id}, 'sistema', ${`${u.nombre.split(" ")[0]} tomó la conversación`})`;
      await log(`Tomó la conversación con ${k.nombre}`);
      return;
    }
    case "devolver_conv": {
      await sql`update conversaciones set estado = 'ia' where id = ${a.id}`;
      await sql`insert into mensajes (conversacion_id, emisor, texto) values (${a.id}, 'sistema', 'Conversación devuelta al asistente IA')`;
      return;
    }
    case "leer_conv": await sql`update conversaciones set no_leidos = 0 where id = ${a.id}`; return;
    case "responder_conv": {
      const [k] = await sql`select estado, canal, telefono from conversaciones where id = ${a.id}`;
      if (!k) throw new Fallo("Conversación no encontrada", 404);
      if (k.estado !== "humano") throw new Fallo("Toma la conversación antes de responder.", 409);
      // En WhatsApp se envía primero; si Meta lo rechaza, no se guarda como enviado.
      if (k.canal === "whatsapp") {
        try { await enviarTexto(k.telefono, a.texto); }
        catch (e) { throw new Fallo(e instanceof ErrorWhatsApp ? e.message : "No se pudo enviar por WhatsApp.", 502); }
      }
      await sql`insert into mensajes (conversacion_id, emisor, texto) values (${a.id}, 'humano', ${a.texto})`;
      // Se agrega al historial de la IA (solo se agrega, nunca se edita) para que tenga contexto si retoma.
      const item = { role: "assistant", content: [{ type: "text", text: `[Mensaje del asesor ${u.nombre.split(" ")[0]}]: ${a.texto}` }] };
      await sql`update conversaciones set historial_api = historial_api || ${sql.json([item])}::jsonb, ultima_actividad = now() where id = ${a.id}`;
      return;
    }
    case "leer_notifs": await sql`update notificaciones set leida = true where not leida`; return;
    case "ajustes": {
      await sql`update configuracion set valor = valor || ${sql.json(a.data)}::jsonb where clave = 'ajustes'`;
      await log("Actualizó la configuración de requisitos y pre-reservas");
      return;
    }
  }
}
