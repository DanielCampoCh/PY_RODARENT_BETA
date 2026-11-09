import { NextResponse } from "next/server";
import { z } from "zod";
import { db, dias, esCruce, fmtFecha } from "@/lib/db";
import { actorDe, usuarioActual, type Usuario } from "@/lib/auth";
import { ajustes, crearReserva, requisitosRequeridos, upsertCliente } from "@/lib/repo";
import { verificarCliente, verifikActivo } from "@/lib/verifik";
import { leerCertificado } from "@/lib/procuraduria";
import { enviarTexto, ErrorWhatsApp, probarConexion } from "@/lib/whatsapp";

const ETIQ: Record<string, string> = { pendiente: "Pendiente", aprobada: "Confirmada", en_curso: "En curso", finalizada: "Finalizada", rechazada: "Rechazada", vencida: "Vencida", cancelada: "Cancelada" };
const VERIF = z.enum(["verificado", "pendiente", "rechazado"]);
const REQ = ["identidad", "licencia", "edad", "contacto", "deposito", "antecedentes"] as const;
const id = z.string().uuid();
const fecha = z.string().datetime({ offset: true });

const Accion = z.discriminatedUnion("tipo", [
  // forzar = el administrador aprueba aunque falten requisitos (con motivo, queda en la auditoría).
  z.object({ tipo: z.literal("aprobar"), id, forzar: z.boolean().optional(), motivo: z.string().trim().max(300).optional() }),
  z.object({ tipo: z.literal("verificar_todos"), clienteId: id }),
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
  z.object({ tipo: z.literal("probar_whatsapp") }),
  z.object({ tipo: z.literal("verificar_fuentes"), clienteId: id, autorizado: z.boolean().optional().default(false) }),
  // Antecedentes en la Procuraduría: la consulta la hace una persona en la página oficial; aquí se lee y guarda el resultado.
  z.object({ tipo: z.literal("guardar_personal"), id: id.optional(), nombre: z.string().trim().min(3).max(120), documento: z.string().trim().regex(/^[0-9.\s]{5,15}$/, "Cédula inválida."), cargo: z.string().trim().max(60).default(""), telefono: z.string().trim().max(20).optional() }),
  z.object({ tipo: z.literal("quitar_personal"), id }),
  z.object({ tipo: z.literal("importar_personal"), filas: z.array(z.object({ documento: z.string().trim().max(20), nombre: z.string().trim().max(120).optional(), cargo: z.string().trim().max(60).optional() })).min(1).max(500) }),
  z.object({ tipo: z.literal("leer_antecedentes"), sujeto: z.enum(["cliente", "personal"]), id, texto: z.string().min(10).max(60000) }),
  z.object({
    tipo: z.literal("guardar_antecedentes"), sujeto: z.enum(["cliente", "personal"]), id, texto: z.string().min(10).max(60000), autorizado: z.boolean().optional().default(false),
    archivo: z.object({ nombre: z.string().max(200), tipo: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]), base64: z.string().max(2_800_000, "El archivo supera 2 MB.") }).optional(),
  }),
  z.object({
    tipo: z.literal("ajustes"),
    data: z.object({
      edadMinima: z.number().int().min(18).max(30), licenciaVigente: z.boolean(), categorias: z.array(z.string()).min(1), depositoObligatorio: z.boolean(),
      experienciaActiva: z.boolean(), experienciaMin: z.number().int().min(0).max(15), docAdicional: z.boolean(),
      prereservaHoras: z.number().int().min(1).max(96), recordatorioHoras: z.number().int().min(1).max(72), retencionDias: z.number().int().min(7).max(365), antecedentesActiva: z.boolean().optional(),
    }),
  }),
]);

const SOLO_ADMIN = new Set(["aprobar", "verificar_todos", "verificar", "guardar_vehiculo", "ajustes", "probar_whatsapp", "verificar_fuentes",
  "guardar_personal", "quitar_personal", "importar_personal", "leer_antecedentes", "guardar_antecedentes"]);

const soloDigitos = (s: string) => s.replace(/\D/g, "");
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const RESULTADO_EXT = { limpio: "ok", con_antecedentes: "hallazgo", no_encontrado: "no_encontrado" } as const;

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
      const pendientes = requisitosRequeridos(await ajustes()).filter((k) => c.verificacion?.[k] !== "verificado");
      const rechazados = pendientes.filter((k) => c.verificacion?.[k] === "rechazado");
      if (pendientes.length && !a.forzar) throw new Fallo(`No se puede aprobar: requisitos sin verificar (${pendientes.join(", ")}).`, 409);
      if (rechazados.length) throw new Fallo(`Hay requisitos rechazados (${rechazados.join(", ")}). Cámbialos primero si ya los revisaste.`, 409);
      if (pendientes.length && (a.motivo ?? "").length < 5) throw new Fallo("Escribe el motivo para aprobar sin completar los requisitos.");
      if (r.expira_en && new Date(r.expira_en) < new Date()) throw new Fallo("La pre-reserva ya venció.", 409);
      await cambiar(a.id, ["pendiente"], "aprobada", pendientes.length ? `Aprobada sin completar requisitos (${pendientes.join(", ")}) · Motivo: ${a.motivo}` : "Requisitos verificados");
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
    case "verificar_todos": {
      const [c] = await sql`select nombre, verificacion from clientes where id = ${a.clienteId}`;
      if (!c) throw new Fallo("Cliente no encontrado", 404);
      // Solo los pendientes: un "rechazado" se cambia a mano, uno por uno.
      const marcar = requisitosRequeridos(await ajustes()).filter((k) => (c.verificacion?.[k] ?? "pendiente") === "pendiente");
      if (!marcar.length) return { marcados: [] };
      const nuevos = Object.fromEntries(marcar.map((k) => [k, "verificado"]));
      await sql`update clientes set verificacion = verificacion || ${sql.json(nuevos)}::jsonb where id = ${a.clienteId}`;
      await log(`Marcó como verificados (manual) los requisitos de ${c.nombre}: ${marcar.join(", ")}`);
      return { marcados: marcar };
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
      let alerta: string | undefined;
      if (!clienteId) {
        if (!a.nuevo) throw new Fallo("Elige un cliente o registra uno nuevo.");
        const c = await upsertCliente({ ...a.nuevo, origen: "manual", consentimiento: true });
        if (!c.ok) throw new Fallo(c.error, 409);
        clienteId = c.cliente.id as string;
        alerta = c.alerta;
      }
      const [c] = await sql`select verificacion from clientes where id = ${clienteId}`;
      const req = requisitosRequeridos(await ajustes());
      const verificado = req.every((k) => c?.verificacion?.[k] === "verificado");
      const r = await crearReserva({ clienteId, vehiculoId: a.vehiculoId, inicio: a.inicio, fin: a.fin, lugar: a.lugar, origen: "manual", estado: verificado && !alerta ? "aprobada" : "pendiente", notas: [a.notas, alerta].filter(Boolean).join(" · "), actor });
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
    case "verificar_fuentes": {
      if (!verifikActivo()) throw new Fallo("La verificación automática no está configurada (falta VERIFIK_TOKEN).", 409);
      const [c] = await sql`select nombre, consentimiento_antecedentes from clientes where id = ${a.clienteId}`;
      if (!c) throw new Fallo("Cliente no encontrado", 404);
      if (!c.consentimiento_antecedentes) {
        if (!a.autorizado) throw new Fallo("Primero confirma que el cliente autorizó la consulta de antecedentes y licencia.", 409);
        await sql`update clientes set consentimiento_antecedentes = now() where id = ${a.clienteId}`;
        await log(`Registró autorización de consulta de antecedentes de ${c.nombre} (dada al equipo)`);
      }
      const [r] = await sql`select fin from reservas where cliente_id = ${a.clienteId} and estado in ('pendiente', 'aprobada') order by inicio limit 1`;
      const res = await verificarCliente(a.clienteId, actor, r ? new Date(r.fin).toISOString() : undefined);
      return { verificados: res.verificados, revisar: res.revisar };
    }
    case "guardar_personal": {
      const doc = soloDigitos(a.documento);
      try {
        if (a.id) await sql`update personal set nombre = ${a.nombre}, documento = ${doc}, cargo = ${a.cargo}, telefono = ${a.telefono || null} where id = ${a.id}`;
        else await sql`insert into personal (nombre, documento, cargo, telefono) values (${a.nombre}, ${doc}, ${a.cargo}, ${a.telefono || null})
          on conflict (documento) do update set nombre = excluded.nombre, cargo = excluded.cargo, telefono = excluded.telefono, activo = true`;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new Fallo("Ya hay otra persona del personal con esa cédula.", 409);
        throw e;
      }
      await log(`${a.id ? "Editó" : "Registró"} a ${a.nombre} en el personal`);
      return;
    }
    case "quitar_personal": {
      const [p] = await sql`update personal set activo = false where id = ${a.id} returning nombre`;
      if (!p) throw new Fallo("No encontrado", 404);
      await log(`Quitó a ${p.nombre} del personal`);
      return;
    }
    case "importar_personal": {
      const filas = a.filas.map((f) => ({ ...f, documento: soloDigitos(f.documento) })).filter((f) => f.documento.length >= 5 && f.documento.length <= 15);
      let nuevos = 0;
      for (const f of filas) {
        const r = await sql`insert into personal (nombre, documento, cargo) values (${f.nombre || "Por identificar"}, ${f.documento}, ${f.cargo || "Importado"})
          on conflict (documento) do update set activo = true returning (xmax = 0) as nuevo`;
        if (r[0]?.nuevo) nuevos++;
      }
      await log(`Importó una lista de ${filas.length} cédula(s) para consultar antecedentes`);
      return { nuevos, total: filas.length, descartadas: a.filas.length - filas.length };
    }
    case "leer_antecedentes":
    case "guardar_antecedentes": {
      const [s] = a.sujeto === "cliente"
        ? await sql`select id, nombre, documento, verificacion, consentimiento_antecedentes from clientes where id = ${a.id}`
        : await sql`select id, nombre, documento from personal where id = ${a.id}`;
      if (!s) throw new Fallo("No encontrado", 404);
      const lectura = leerCertificado(a.texto, s.documento, s.nombre);
      if (a.tipo === "leer_antecedentes") return { lectura };
      if (!lectura.coincide_documento) throw new Fallo(lectura.documento ? `Ese resultado es de la cédula ${lectura.documento}, no de ${soloDigitos(s.documento)}. Revisa que consultaste la cédula correcta.` : "No se encontró la cédula en el resultado. Copia la página de resultados completa (Ctrl+A, Ctrl+C) o sube el certificado.", 409);
      // Ley 1581: la consulta requiere autorización expresa de la persona.
      if (a.sujeto === "cliente" && !s.consentimiento_antecedentes) {
        if (!a.autorizado) throw new Fallo("Primero confirma que el cliente autorizó la consulta de sus antecedentes.", 409);
        await sql`update clientes set consentimiento_antecedentes = now() where id = ${s.id}`;
        await log(`Registró autorización de consulta de antecedentes de ${s.nombre} (dada al equipo)`);
      }
      if (a.sujeto === "personal" && !a.autorizado) throw new Fallo("Primero confirma que la persona autorizó la consulta de sus antecedentes.", 409);
      const archivo = a.archivo ? Buffer.from(a.archivo.base64, "base64") : null;
      if (archivo && archivo.length > 2_000_000) throw new Fallo("El archivo supera 2 MB.");
      const [c] = await sql`insert into consultas_antecedentes (cliente_id, personal_id, documento, nombre_certificado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
          estado, coincide_documento, coincide_nombre, detalle, texto, archivo, archivo_tipo, archivo_nombre, actor)
        values (${a.sujeto === "cliente" ? s.id : null}, ${a.sujeto === "personal" ? s.id : null}, ${lectura.documento}, ${lectura.nombre_completo}, ${lectura.primer_nombre}, ${lectura.segundo_nombre},
          ${lectura.primer_apellido}, ${lectura.segundo_apellido}, ${lectura.estado}, ${lectura.coincide_documento}, ${lectura.coincide_nombre}, ${lectura.detalle},
          ${a.texto.slice(0, 8000)}, ${archivo}, ${a.archivo?.tipo ?? null}, ${a.archivo?.nombre ?? null}, ${actor}) returning id`;
      const etiqueta = { limpio: "sin antecedentes", con_antecedentes: "CON antecedentes", no_encontrado: "no encontrado", revisar: "por revisar" }[lectura.estado];
      let marcado = false;
      if (a.sujeto === "cliente") {
        if (lectura.estado !== "revisar") await sql`insert into verificaciones_externas (cliente_id, fuente, resultado, detalle, referencia, actor)
          values (${s.id}, 'Procuraduría (consulta en la página oficial)', ${RESULTADO_EXT[lectura.estado]}, ${lectura.detalle}, ${String(c.id)}, ${actor})`;
        // Solo se marca como verificado si no hay antecedentes y la cédula y el nombre coinciden. Nunca se rechaza automáticamente.
        if (lectura.estado === "limpio" && lectura.coincide_nombre !== false && s.verificacion?.antecedentes !== "rechazado") {
          await sql`update clientes set verificacion = jsonb_set(verificacion, '{antecedentes}', '"verificado"') where id = ${s.id}`;
          marcado = true;
        }
      } else if (/^por identificar$/i.test(s.nombre) && lectura.nombre_completo) {
        await sql`update personal set nombre = ${titulo(lectura.nombre_completo)} where id = ${s.id}`;
      }
      if (lectura.estado === "con_antecedentes" || lectura.coincide_nombre === false)
        await sql`insert into notificaciones (texto) values (${`Antecedentes de ${s.nombre} (${a.sujeto}): ${lectura.detalle}`})`;
      await log(`Consultó antecedentes en la Procuraduría de ${s.nombre} (${a.sujeto}): ${etiqueta}`);
      return { lectura, marcado, consulta: String(c.id) };
    }
    case "probar_whatsapp": return { prueba: await probarConexion() };
    case "leer_notifs": await sql`update notificaciones set leida = true where not leida`; return;
    case "ajustes": {
      await sql`update configuracion set valor = valor || ${sql.json(a.data)}::jsonb where clave = 'ajustes'`;
      await log("Actualizó la configuración de requisitos y pre-reservas");
      return;
    }
  }
}
