import { NextResponse } from "next/server";
import { z } from "zod";
import { db, dias, esCruce, fmtFecha } from "@/lib/db";
import { actorDe, hashClave, usuarioActual, type Usuario } from "@/lib/auth";
import { ajustes, crearReserva, normalizarDoc, normalizarTel, requisitosRequeridos, upsertCliente } from "@/lib/repo";
import { enviarTexto, ErrorWhatsApp, probarConexion, waConfig } from "@/lib/whatsapp";
import { crearServicio, publicarServicio } from "@/lib/servicios";
import { esFotoGaleria } from "@/lib/fotos";

const ETIQ: Record<string, string> = { pendiente: "Pendiente", aprobada: "Confirmada", en_curso: "En curso", finalizada: "Finalizada", rechazada: "Rechazada", vencida: "Vencida", cancelada: "Cancelada" };
const VERIF = z.enum(["verificado", "pendiente", "rechazado"]);
const REQ = ["identidad", "licencia", "edad", "contacto", "deposito"] as const;
const id = z.string().uuid();
const fecha = z.string().datetime({ offset: true });
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).").nullable().optional();
const texto = (max: number) => z.string().trim().max(max).optional().default("");
const PLACA = /^[A-Z]{3}-?\d{2}[0-9A-Z]$/;

const Vehiculo = z.object({
  marca: z.string().trim().min(1).max(40), modelo: z.string().trim().min(1).max(60), placa: z.string().trim().toUpperCase().regex(PLACA, "Placa inválida (ABC-123)."),
  anio: z.number().int().min(1990).max(2100), tipo: z.enum(["sedan", "hatch", "suv", "pickup", "van"]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  capacidad: z.number().int().min(1).max(30), maletas: z.number().int().min(0).max(20), transmision: z.string().max(20), combustible: z.string().max(20),
  precio: z.number().int().min(0), deposito: z.number().int().min(0), estado: z.enum(["disponible", "mantenimiento", "inactivo"]),
  modalidad: z.enum(["alquiler", "uber", "agencia"]).default("alquiler"), destacado: z.string().trim().max(30).nullable().optional(),
  codigo: texto(20), colorNombre: texto(40), responsable: texto(80), responsableTel: texto(25), gps: texto(80), gpsRecarga: dia,
  soat: dia, tecno: dia, seguro: dia, aseguradora: texto(60), extintor: dia, impuesto: dia,
  km: z.number().int().min(0).max(3_000_000).nullable().optional(), kmAceite: z.number().int().min(0).max(3_000_000).nullable().optional(),
  agencia: texto(80), comision: z.number().min(0).max(100).nullable().optional(), notas: texto(500),
});
type DatosVehiculo = z.infer<typeof Vehiculo>;
// Importación desde Excel: solo se actualizan las columnas que traiga la hoja (sin valores por defecto que borren datos).
const op = <T extends z.ZodTypeAny>(s: T) => s.optional();
const VehiculoImport = z.object({
  placa: z.string().trim().toUpperCase().regex(PLACA, "Placa inválida (ABC-123)."),
  marca: op(z.string().trim().min(1).max(40)), modelo: op(z.string().trim().min(1).max(60)), anio: op(z.number().int().min(1990).max(2100)),
  tipo: op(z.enum(["sedan", "hatch", "suv", "pickup", "van"])), modalidad: op(z.enum(["alquiler", "uber", "agencia"])),
  capacidad: op(z.number().int().min(1).max(30)), precio: op(z.number().int().min(0)), deposito: op(z.number().int().min(0)),
  codigo: op(z.string().trim().max(20)), colorNombre: op(z.string().trim().max(40)), responsable: op(z.string().trim().max(80)), responsableTel: op(z.string().trim().max(25)),
  gps: op(z.string().trim().max(80)), gpsRecarga: dia, soat: dia, tecno: dia, seguro: dia, aseguradora: op(z.string().trim().max(60)), extintor: dia, impuesto: dia,
  km: op(z.number().int().min(0).max(3_000_000).nullable()), kmAceite: op(z.number().int().min(0).max(3_000_000).nullable()),
});

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
  // Edición completa de una reserva (vehículo, fechas, lugar, tarifa y notas).
  z.object({
    tipo: z.literal("editar_reserva"), id, vehiculoId: id, inicio: fecha, fin: fecha, lugar: z.string().trim().min(2).max(120), notas: z.string().max(1000).default(""),
    precioDia: z.number().int().min(0), deposito: z.number().int().min(0), estado: z.enum(["pendiente", "aprobada", "en_curso", "finalizada", "rechazada", "vencida", "cancelada"]).optional(),
  }),
  z.object({ tipo: z.literal("borrar_reserva"), id }),
  z.object({ tipo: z.literal("guardar_vehiculo"), id: id.optional(), data: Vehiculo }),
  z.object({ tipo: z.literal("borrar_vehiculo"), id }),
  // Fotos del vehículo: subida (ya reducida en el navegador) o elegida de la galería del Instagram del negocio.
  z.object({ tipo: z.literal("subir_foto"), vehiculoId: id, formato: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(100).max(2_800_000, "La foto supera 2 MB.") }),
  z.object({ tipo: z.literal("agregar_foto_galeria"), vehiculoId: id, url: z.string().max(200) }),
  z.object({ tipo: z.literal("borrar_foto"), id: z.string().regex(/^\d{1,18}$/) }),
  z.object({ tipo: z.literal("foto_principal"), id: z.string().regex(/^\d{1,18}$/) }),
  z.object({ tipo: z.literal("importar_vehiculos"), filas: z.array(VehiculoImport).min(1).max(300) }),
  z.object({
    tipo: z.literal("guardar_cliente"), id: id.optional(), nombre: z.string().trim().min(3).max(120), documento: z.string().trim().min(5).max(20),
    telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, "Celular inválido."), email: z.string().trim().max(200).optional().default(""),
    fechaNac: dia, licencia: z.string().trim().max(10).optional().default(""), licVence: dia,
  }),
  z.object({ tipo: z.literal("borrar_cliente"), id, conHistorial: z.boolean().optional().default(false) }),
  z.object({ tipo: z.literal("tomar_conv"), id }),
  z.object({ tipo: z.literal("devolver_conv"), id }),
  z.object({ tipo: z.literal("leer_conv"), id }),
  z.object({ tipo: z.literal("borrar_conv"), id }),
  z.object({ tipo: z.literal("responder_conv"), id, texto: z.string().trim().min(1).max(2000) }),
  z.object({ tipo: z.literal("leer_notifs") }),
  z.object({ tipo: z.literal("borrar_notifs") }),
  z.object({ tipo: z.literal("probar_whatsapp") }),
  // Usuarios del panel
  z.object({
    tipo: z.literal("guardar_usuario"), id: id.optional(), nombre: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email("Correo inválido.").max(200),
    rol: z.enum(["admin", "operador"]), activo: z.boolean().default(true), clave: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200).optional(),
  }),
  z.object({ tipo: z.literal("borrar_usuario"), id }),
  // Servicios de conductor
  z.object({
    tipo: z.literal("guardar_servicio"), id: id.optional(), nombre: z.string().trim().min(2).max(120), telefono: z.string().trim().min(7).max(25),
    origen: z.string().trim().min(2).max(200), destino: z.string().trim().min(2).max(200), fecha, pasajeros: z.number().int().min(1).max(50), notas: z.string().trim().max(500).default(""),
    estado: z.enum(["nuevo", "tomado", "completado", "cancelado"]).optional(), conductor: z.string().trim().max(80).optional(),
  }),
  z.object({ tipo: z.literal("borrar_servicio"), id }),
  z.object({ tipo: z.literal("publicar_servicio"), id }),
  // Conductores (reciben los servicios por WhatsApp)
  z.object({ tipo: z.literal("guardar_conductor"), id: id.optional(), nombre: z.string().trim().min(2).max(80), telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, "Celular inválido (10 dígitos)."), activo: z.boolean().default(true), notas: z.string().trim().max(300).default("") }),
  z.object({ tipo: z.literal("borrar_conductor"), id }),
  z.object({ tipo: z.literal("probar_conductor"), id }),
  z.object({
    tipo: z.literal("ajustes"),
    data: z.object({
      edadMinima: z.number().int().min(18).max(30), licenciaVigente: z.boolean(), categorias: z.array(z.string()).min(1), depositoObligatorio: z.boolean(),
      experienciaActiva: z.boolean(), experienciaMin: z.number().int().min(0).max(15), docAdicional: z.boolean(),
      prereservaHoras: z.number().int().min(1).max(96), recordatorioHoras: z.number().int().min(1).max(72), retencionDias: z.number().int().min(7).max(365),
      lugares: z.array(z.string().trim().min(2).max(120)).min(1).max(15).optional(), horario: z.string().trim().min(2).max(120).optional(),
      picoPlaca: z.record(z.string().regex(/^[1-5]$/), z.array(z.number().int().min(0).max(9)).max(5)).optional(),
      alertasWhatsapp: z.array(z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, "Celular de alertas inválido.")).max(5).optional(),
    }),
  }),
]);

const SOLO_ADMIN = new Set(["aprobar", "verificar_todos", "verificar", "guardar_vehiculo", "borrar_vehiculo", "subir_foto", "agregar_foto_galeria", "borrar_foto", "foto_principal", "importar_vehiculos", "ajustes", "probar_whatsapp",
  "borrar_cliente", "borrar_reserva", "editar_reserva", "borrar_conv", "guardar_usuario", "borrar_usuario", "borrar_servicio", "guardar_conductor", "borrar_conductor", "probar_conductor", "borrar_notifs"]);

const MAX_FOTOS = 8;

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
    if (e instanceof ErrorWhatsApp) return NextResponse.json({ error: e.message }, { status: 502 });
    if (esCruce(e)) return NextResponse.json({ error: "Conflicto: el vehículo ya tiene otra reserva en esas fechas." }, { status: 409 });
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "Ya existe un registro con ese dato (placa, documento o correo repetido)." }, { status: 409 });
    throw e;
  }
}

/** Placa con guion: ABC-123. */
const placaFmt = (p: string) => (p.includes("-") ? p : `${p.slice(0, 3)}-${p.slice(3)}`);

/** Columnas de la tabla vehiculos a partir de los datos del formulario o de la importación. */
function columnasVehiculo(d: Partial<DatosVehiculo>) {
  const c: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined) c[k] = v; };
  set("marca", d.marca); set("modelo", d.modelo); set("placa", d.placa ? placaFmt(d.placa) : undefined); set("anio", d.anio); set("tipo", d.tipo); set("color", d.color);
  set("capacidad", d.capacidad); set("maletas", d.maletas); set("transmision", d.transmision); set("combustible", d.combustible);
  set("precio_dia", d.precio); set("deposito", d.deposito); set("estado", d.estado); set("modalidad", d.modalidad); set("destacado", d.destacado === undefined ? undefined : d.destacado || null);
  set("codigo", d.codigo); set("color_nombre", d.colorNombre); set("responsable", d.responsable); set("responsable_tel", d.responsableTel); set("gps", d.gps);
  set("gps_recarga", d.gpsRecarga); set("soat_vence", d.soat); set("tecno_vence", d.tecno); set("seguro_vence", d.seguro); set("aseguradora", d.aseguradora);
  set("extintor_vence", d.extintor); set("impuesto_vence", d.impuesto); set("km_actual", d.km); set("km_aceite", d.kmAceite);
  set("agencia", d.agencia); set("comision_pct", d.comision); set("notas", d.notas);
  return c;
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
    /* ---------- Reservas ---------- */
    case "aprobar": {
      const r = await reserva(a.id);
      const [c] = await sql`select nombre, verificacion from clientes where id = ${r.cliente_id}`;
      const pendientes = requisitosRequeridos().filter((k) => c.verificacion?.[k] !== "verificado");
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
    case "editar_reserva": {
      const r = await reserva(a.id);
      if (new Date(a.fin) <= new Date(a.inicio)) throw new Fallo("La devolución debe ser posterior a la recogida.");
      const [v] = await sql`select marca, modelo, modalidad from vehiculos where id = ${a.vehiculoId}`;
      if (!v) throw new Fallo("Vehículo no encontrado", 404);
      if (v.modalidad === "uber") throw new Fallo("Ese vehículo es de Uber: no se puede reservar.", 409);
      const n = dias(a.inicio, a.fin);
      const estado = a.estado ?? r.estado;
      await sql`update reservas set vehiculo_id = ${a.vehiculoId}, inicio = ${a.inicio}, fin = ${a.fin}, lugar = ${a.lugar}, notas = ${a.notas},
        precio_dia = ${a.precioDia}, deposito = ${a.deposito}, dias = ${n}, total = ${n * a.precioDia}, estado = ${estado},
        expira_en = case when ${estado} = 'pendiente' then expira_en else null end where id = ${a.id}`;
      const cambios = [
        r.vehiculo_id !== a.vehiculoId && `vehículo → ${v.marca} ${v.modelo}`,
        (new Date(r.inicio).getTime() !== new Date(a.inicio).getTime() || new Date(r.fin).getTime() !== new Date(a.fin).getTime()) && `fechas → ${fmtFecha(a.inicio)}–${fmtFecha(a.fin)}`,
        r.lugar !== a.lugar && `lugar → ${a.lugar}`, r.precio_dia !== a.precioDia && `tarifa → ${a.precioDia}/día`, r.deposito !== a.deposito && `depósito → ${a.deposito}`,
        r.notas !== a.notas && "notas", estado !== r.estado && `estado → ${ETIQ[estado]}`,
      ].filter(Boolean).join(", ");
      await sql`insert into reserva_historial (reserva_id, texto, actor) values (${a.id}, ${`Editada: ${cambios || "sin cambios"}`}, ${actor})`;
      await log(`Editó ${r.codigo}: ${cambios || "sin cambios"}`);
      return;
    }
    case "borrar_reserva": {
      const r = await reserva(a.id);
      await sql.begin(async (tx) => {
        await tx`update conversaciones set reserva_id = null where reserva_id = ${a.id}`;
        await tx`delete from reservas where id = ${a.id}`;
      });
      await log(`Eliminó la reserva ${r.codigo}`);
      return;
    }
    case "verificar_todos": {
      const [c] = await sql`select nombre, verificacion from clientes where id = ${a.clienteId}`;
      if (!c) throw new Fallo("Cliente no encontrado", 404);
      // Solo los pendientes: un "rechazado" se cambia a mano, uno por uno.
      const marcar = requisitosRequeridos().filter((k) => (c.verificacion?.[k] ?? "pendiente") === "pendiente");
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
      const verificado = requisitosRequeridos(await ajustes()).every((k) => c?.verificacion?.[k] === "verificado");
      const r = await crearReserva({ clienteId, vehiculoId: a.vehiculoId, inicio: a.inicio, fin: a.fin, lugar: a.lugar, origen: "manual", estado: verificado && !alerta ? "aprobada" : "pendiente", notas: [a.notas, alerta].filter(Boolean).join(" · "), actor });
      if (!r.ok) throw new Fallo(r.error, 409);
      return { id: r.reserva.id, codigo: r.reserva.codigo };
    }

    /* ---------- Vehículos ---------- */
    case "guardar_vehiculo": {
      const d = a.data;
      if (d.modalidad !== "uber" && d.estado === "disponible" && !(d.precio > 0)) throw new Fallo("Para alquilarlo, el precio por día debe ser mayor a 0 (o márcalo como Uber o Inactivo).");
      const placa = placaFmt(d.placa);
      const [dup] = await sql`select id from vehiculos where replace(placa, '-', '') = ${placa.replace("-", "")} and id <> ${a.id ?? "00000000-0000-0000-0000-000000000000"}`;
      if (dup) throw new Fallo("Ya existe un vehículo con esa placa.", 409);
      const cols = { ...columnasVehiculo(d), actualizado_en: new Date() };
      if (a.id) {
        const r = await sql`update vehiculos set ${sql(cols)} where id = ${a.id} returning id`;
        if (!r.length) throw new Fallo("Vehículo no encontrado", 404);
        await log(`Editó ${d.marca} ${d.modelo} (${placa})`);
      } else {
        await sql`insert into vehiculos ${sql(cols)}`;
        await log(`Agregó ${d.marca} ${d.modelo} (${placa})`);
      }
      return;
    }
    case "borrar_vehiculo": {
      const [v] = await sql`select marca, modelo, placa from vehiculos where id = ${a.id}`;
      if (!v) throw new Fallo("Vehículo no encontrado", 404);
      const [{ n }] = await sql`select count(*)::int as n from reservas where vehiculo_id = ${a.id}`;
      // El historial de quién tuvo el carro sirve para las fotomultas: no se borra.
      if (n) throw new Fallo(`${v.marca} ${v.modelo} tiene ${n} reserva(s) en su historial (sirve para saber quién lo tenía si llega una fotomulta). Cámbialo a «Inactivo» en vez de eliminarlo, o elimina primero esas reservas.`, 409);
      await sql`delete from vehiculos where id = ${a.id}`;
      await log(`Eliminó el vehículo ${v.marca} ${v.modelo} (${v.placa})`);
      return;
    }
    case "subir_foto":
    case "agregar_foto_galeria": {
      const [v] = await sql`select marca, modelo, placa from vehiculos where id = ${a.vehiculoId}`;
      if (!v) throw new Fallo("Vehículo no encontrado", 404);
      const [{ n }] = await sql`select count(*)::int as n from vehiculo_fotos where vehiculo_id = ${a.vehiculoId}`;
      if (n >= MAX_FOTOS) throw new Fallo(`Máximo ${MAX_FOTOS} fotos por vehículo. Borra alguna para agregar otra.`, 409);
      if (a.tipo === "subir_foto") {
        const datos = Buffer.from(a.base64, "base64");
        // Se revisa que de verdad sea una imagen (JPEG, PNG o WebP) y no otro tipo de archivo.
        const firma = datos.subarray(0, 12);
        const esImagen = (firma[0] === 0xff && firma[1] === 0xd8) || firma.subarray(0, 4).toString("hex") === "89504e47" || (firma.subarray(0, 4).toString() === "RIFF" && firma.subarray(8, 12).toString() === "WEBP");
        if (!esImagen || datos.length > 2_000_000) throw new Fallo("El archivo no es una imagen válida (JPG, PNG o WebP de máximo 2 MB).");
        await sql`insert into vehiculo_fotos (vehiculo_id, orden, datos, tipo) values (${a.vehiculoId}, ${n}, ${datos}, ${a.formato})`;
      } else {
        if (!esFotoGaleria(a.url)) throw new Fallo("Esa foto no está en la galería del negocio.");
        const [dup] = await sql`select 1 from vehiculo_fotos where vehiculo_id = ${a.vehiculoId} and url = ${a.url}`;
        if (dup) throw new Fallo("Esa foto ya está en este vehículo.", 409);
        await sql`insert into vehiculo_fotos (vehiculo_id, orden, url) values (${a.vehiculoId}, ${n}, ${a.url})`;
      }
      await log(`Agregó una foto a ${v.marca} ${v.modelo} (${v.placa})`);
      return;
    }
    case "borrar_foto": {
      const [f] = await sql`delete from vehiculo_fotos where id = ${a.id} returning vehiculo_id`;
      if (!f) throw new Fallo("Foto no encontrada", 404);
      await log("Borró una foto de un vehículo");
      return;
    }
    case "foto_principal": {
      const [f] = await sql`select vehiculo_id from vehiculo_fotos where id = ${a.id}`;
      if (!f) throw new Fallo("Foto no encontrada", 404);
      // La elegida queda de primera y las demás conservan su orden.
      await sql`update vehiculo_fotos set orden = case when id = ${a.id} then 0 else orden + 1 end where vehiculo_id = ${f.vehiculo_id}`;
      return;
    }
    case "importar_vehiculos": {
      let nuevos = 0, actualizados = 0;
      const errores: string[] = [];
      for (const f of a.filas) {
        const placa = placaFmt(f.placa);
        const [ex] = await sql`select id from vehiculos where replace(placa, '-', '') = ${placa.replace("-", "")}`;
        try {
          if (ex) {
            const cols = columnasVehiculo({ ...f, placa });
            await sql`update vehiculos set ${sql({ ...cols, actualizado_en: new Date() })} where id = ${ex.id}`;
            actualizados++;
          } else {
            const base: Partial<DatosVehiculo> = { marca: "Sin marca", modelo: "Sin línea", anio: new Date().getFullYear(), tipo: "sedan", color: "#3b4a63", capacidad: 5, maletas: 2, transmision: "Mecánica", combustible: "Gasolina", precio: 0, deposito: 0 };
            const d = { ...base, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "")), placa } as Partial<DatosVehiculo>;
            // Sin tarifa no se puede ofrecer en el catálogo: queda inactivo hasta que se le ponga precio.
            if (!d.estado) d.estado = d.modalidad === "uber" || (d.precio ?? 0) > 0 ? "disponible" : "inactivo";
            await sql`insert into vehiculos ${sql(columnasVehiculo(d))}`;
            nuevos++;
          }
        } catch (e) { errores.push(`${placa}: ${e instanceof Error ? e.message : "error"}`); }
      }
      await log(`Importó vehículos desde Excel: ${nuevos} nuevo(s), ${actualizados} actualizado(s)`);
      return { nuevos, actualizados, errores };
    }

    /* ---------- Clientes ---------- */
    case "guardar_cliente": {
      // El operador ve los documentos enmascarados: puede registrar clientes, pero solo el administrador edita.
      if (a.id && u.rol !== "admin") throw new Fallo("Solo el administrador puede editar los datos de un cliente.", 403);
      const documento = normalizarDoc(a.documento), telefono = normalizarTel(a.telefono);
      const datos = { nombre: a.nombre, documento, telefono, email: a.email || null, fecha_nacimiento: a.fechaNac || null, licencia_categoria: a.licencia || null, licencia_vence: a.licVence || null };
      if (a.id) {
        const [antes] = await sql`select licencia_categoria, licencia_vence from clientes where id = ${a.id}`;
        if (!antes) throw new Fallo("Cliente no encontrado", 404);
        await sql`update clientes set ${sql(datos)} where id = ${a.id}`;
        await log(`Editó los datos del cliente ${a.nombre}`);
        return { id: a.id };
      }
      const verif = { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: "pendiente", deposito: "pendiente" };
      const [c] = await sql`insert into clientes ${sql({ ...datos, origen: "manual", verificacion: sql.json(verif) as never, consentimiento_datos: new Date() })} returning id`;
      await log(`Registró al cliente ${a.nombre}`);
      return { id: c.id };
    }
    case "borrar_cliente": {
      const [c] = await sql`select nombre from clientes where id = ${a.id}`;
      if (!c) throw new Fallo("Cliente no encontrado", 404);
      const rs = await sql`select estado from reservas where cliente_id = ${a.id}`;
      if (rs.some((r) => ["pendiente", "aprobada", "en_curso"].includes(r.estado))) throw new Fallo(`${c.nombre} tiene reservas activas. Ciérralas o cancélalas antes de eliminarlo.`, 409);
      if (rs.length && !a.conHistorial) throw new Fallo(`${c.nombre} tiene ${rs.length} reserva(s) en el historial. Confirma que también quieres borrarlas.`, 409);
      await sql.begin(async (tx) => {
        await tx`update conversaciones set cliente_id = null, reserva_id = null where cliente_id = ${a.id} or reserva_id in (select id from reservas where cliente_id = ${a.id})`;
        await tx`delete from reservas where cliente_id = ${a.id}`;
        await tx`delete from clientes where id = ${a.id}`;
      });
      await log(`Eliminó al cliente ${c.nombre}${rs.length ? ` y ${rs.length} reserva(s) de su historial` : ""}`);
      return;
    }

    /* ---------- Conversaciones ---------- */
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
    case "borrar_conv": {
      const [k] = await sql`delete from conversaciones where id = ${a.id} returning nombre`;
      if (!k) throw new Fallo("Conversación no encontrada", 404);
      await log(`Eliminó la conversación con ${k.nombre}`);
      return;
    }
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
    case "probar_whatsapp": return { prueba: await probarConexion() };
    case "leer_notifs": await sql`update notificaciones set leida = true where not leida`; return;
    case "borrar_notifs": await sql`delete from notificaciones`; await log("Vació las notificaciones"); return;

    /* ---------- Usuarios del panel ---------- */
    case "guardar_usuario": {
      if (a.id === u.id && (a.rol !== "admin" || !a.activo)) throw new Fallo("No puedes quitarte el rol de administrador ni desactivarte a ti mismo.", 409);
      if (!a.id && !a.clave) throw new Fallo("Escribe una contraseña para el usuario nuevo (mínimo 8 caracteres).");
      try {
        if (a.id) {
          const r = await sql`update usuarios set nombre = ${a.nombre}, email = ${a.email}, rol = ${a.rol}, activo = ${a.activo} where id = ${a.id} returning id`;
          if (!r.length) throw new Fallo("Usuario no encontrado", 404);
          if (a.clave) await sql`update usuarios set password_hash = ${hashClave(a.clave)} where id = ${a.id}`;
        } else await sql`insert into usuarios (email, nombre, rol, password_hash) values (${a.email}, ${a.nombre}, ${a.rol}, ${hashClave(a.clave!)})`;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new Fallo("Ya hay un usuario con ese correo.", 409);
        throw e;
      }
      await log(`${a.id ? "Editó" : "Creó"} el usuario ${a.email} (${a.rol}${a.activo ? "" : ", inactivo"})${a.clave && a.id ? " · cambió su contraseña" : ""}`);
      return;
    }
    case "borrar_usuario": {
      if (a.id === u.id) throw new Fallo("No puedes eliminar tu propio usuario.", 409);
      const [x] = await sql`delete from usuarios where id = ${a.id} returning email`;
      if (!x) throw new Fallo("Usuario no encontrado", 404);
      await log(`Eliminó el usuario ${x.email}`);
      return;
    }

    /* ---------- Servicios de conductor ---------- */
    case "guardar_servicio": {
      if (!a.id) {
        const { servicio, publicado, enviados } = await crearServicio({ nombre: a.nombre, telefono: normalizarTel(a.telefono), origen: a.origen, destino: a.destino, fecha: a.fecha, pasajeros: a.pasajeros, notas: a.notas, canal: "manual" }, actor);
        return { id: servicio.id, codigo: servicio.codigo, publicado, enviados };
      }
      const estado = a.estado ?? "nuevo";
      const [s] = await sql`update servicios set nombre = ${a.nombre}, telefono = ${normalizarTel(a.telefono)}, origen = ${a.origen}, destino = ${a.destino}, fecha = ${a.fecha},
        pasajeros = ${a.pasajeros}, notas = ${a.notas}, estado = ${estado},
        conductor = ${estado === "nuevo" ? null : a.conductor || null}, conductor_tel = case when ${estado} = 'nuevo' then null else conductor_tel end,
        tomado_en = case when ${estado} = 'nuevo' then null else coalesce(tomado_en, now()) end
        where id = ${a.id} returning *`;
      if (!s) throw new Fallo("Servicio no encontrado", 404);
      await log(`Editó el servicio ${s.codigo}`);
      return;
    }
    case "borrar_servicio": {
      const [s] = await sql`delete from servicios where id = ${a.id} returning codigo`;
      if (!s) throw new Fallo("Servicio no encontrado", 404);
      await log(`Eliminó el servicio ${s.codigo}`);
      return;
    }
    case "publicar_servicio": {
      const [s] = await sql`select * from servicios where id = ${a.id}`;
      if (!s) throw new Fallo("Servicio no encontrado", 404);
      if (s.estado !== "nuevo") throw new Fallo("Ese servicio ya tiene conductor o está cerrado.", 409);
      if (!waConfig().activo) throw new Fallo("WhatsApp no está configurado en el servidor.", 409);
      const r = await publicarServicio(s);
      if (!r.enviados) throw new Fallo(r.fallidos.length ? `No llegó a ningún conductor. ${r.fallidos.slice(0, 3).join(" · ")}` : "No hay conductores activos. Agrégalos en Conductores.", 409);
      await log(`Envió el servicio ${s.codigo} a ${r.enviados} conductor(es)`);
      return { enviados: r.enviados, fallidos: r.fallidos };
    }

    /* ---------- Conductores ---------- */
    case "guardar_conductor": {
      const telefono = normalizarTel(a.telefono);
      const [dup] = await sql`select id from conductores where right(regexp_replace(telefono, '\\D', '', 'g'), 10) = ${telefono.replace(/\D/g, "").slice(-10)} and id <> ${a.id ?? "00000000-0000-0000-0000-000000000000"}`;
      if (dup) throw new Fallo("Ya hay un conductor con ese celular.", 409);
      if (a.id) {
        const r = await sql`update conductores set nombre = ${a.nombre}, telefono = ${telefono}, activo = ${a.activo}, notas = ${a.notas} where id = ${a.id} returning id`;
        if (!r.length) throw new Fallo("Conductor no encontrado", 404);
      } else await sql`insert into conductores (nombre, telefono, activo, notas) values (${a.nombre}, ${telefono}, ${a.activo}, ${a.notas})`;
      await log(`${a.id ? "Editó" : "Agregó"} al conductor ${a.nombre} (${telefono})${a.activo ? "" : " · inactivo"}`);
      return;
    }
    case "borrar_conductor": {
      const [c] = await sql`delete from conductores where id = ${a.id} returning nombre`;
      if (!c) throw new Fallo("Conductor no encontrado", 404);
      await log(`Eliminó al conductor ${c.nombre}`);
      return;
    }
    case "probar_conductor": {
      const [c] = await sql`select nombre, telefono from conductores where id = ${a.id}`;
      if (!c) throw new Fallo("Conductor no encontrado", 404);
      await enviarTexto(c.telefono, `Hola, ${c.nombre.split(" ")[0]} 👋 Este es un mensaje de prueba de ${process.env.NEGOCIO_NOMBRE || "Alquiler de Vehículos BP"}. Por este chat te llegarán los servicios con conductor: el primero que pulse «Tomar servicio» se lo queda.`);
      await log(`Envió un mensaje de prueba al conductor ${c.nombre}`);
      return;
    }

    case "ajustes": {
      await sql`update configuracion set valor = valor || ${sql.json(a.data)}::jsonb where clave = 'ajustes'`;
      await log("Actualizó la configuración");
      return;
    }
  }
}
