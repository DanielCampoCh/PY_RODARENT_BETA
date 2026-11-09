import { db, dias, esCruce, soloDigitos } from "./db";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type Ajustes = {
  prereservaHoras: number; edadMinima: number; licenciaVigente: boolean; categorias: string[]; depositoObligatorio: boolean;
  experienciaMin: number; experienciaActiva: boolean; docAdicional: boolean; retencionDias: number; recordatorioHoras: number;
  lugares: string[]; horario: string; antecedentesActiva?: boolean;
};

export const negocio = () => ({
  nombre: process.env.NEGOCIO_NOMBRE || "Autos del Valle",
  ciudad: process.env.NEGOCIO_CIUDAD || "Medellín",
  whatsapp: process.env.NEGOCIO_WHATSAPP || "",
});

export async function ajustes(): Promise<Ajustes> {
  const [r] = await db()`select valor from configuracion where clave = 'ajustes'`;
  return r.valor as Ajustes;
}

/** Requisitos que deben estar verificados para aprobar una reserva. */
export const REQUISITOS_BASE = ["identidad", "licencia", "edad", "contacto", "deposito"] as const;
export const requisitosRequeridos = (a: Ajustes): string[] => [...REQUISITOS_BASE, ...(a.antecedentesActiva ? ["antecedentes"] : [])];

export const expirar = () => db()`select expirar_prereservas()`;

/* ---------- Mapeo a la forma que usa la interfaz ---------- */
export const mapVehiculo = (v: Row) => ({
  id: v.id, marca: v.marca, modelo: v.modelo, anio: v.anio, placa: v.placa, tipo: v.tipo, capacidad: v.capacidad, maletas: v.maletas,
  transmision: v.transmision, combustible: v.combustible, color: v.color, precio: v.precio_dia, deposito: v.deposito, estado: v.estado, destacado: v.destacado,
});

const edad = (nac: string | Date | null) => {
  if (!nac) return null;
  const d = new Date(nac);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
};
const iso = (d: any) => (d ? new Date(d).toISOString() : null);
const fechaCorta = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const mapCliente = (c: Row, enmascarar: boolean) => ({
  id: c.id, nombre: c.nombre,
  doc: enmascarar && c.documento ? c.documento.replace(/\d(?=\d{4})/g, "•") : c.documento,
  tel: c.telefono, email: c.email, edad: edad(c.fecha_nacimiento), licencia: c.licencia_categoria, licVence: fechaCorta(c.licencia_vence),
  origen: c.origen, creado: iso(c.creado_en), verif: c.verificacion, consent: { datos: iso(c.consentimiento_datos), marketing: c.consentimiento_marketing, antecedentes: iso(c.consentimiento_antecedentes) },
});

export const mapReserva = (r: Row, historial: Row[] = []) => ({
  id: r.id, codigo: r.codigo, cliente: r.cliente_id, vehiculo: r.vehiculo_id, inicio: iso(r.inicio), fin: iso(r.fin), lugar: r.lugar, devolucion: r.lugar,
  estado: r.estado, expira: iso(r.expira_en), origen: r.origen, precioDia: r.precio_dia, dias: r.dias, total: r.total, deposito: r.deposito,
  notas: r.notas, creado: iso(r.creado_en), nueva: r.nueva,
  historial: historial.map((h) => ({ fecha: iso(h.fecha), texto: h.texto, actor: h.actor })),
});

/** Bloques ocupados (sin datos personales) para el catálogo público. */
export async function ocupados() {
  const rows = await db()`select vehiculo_id, inicio, fin from reservas
    where estado in ('aprobada','en_curso') or (estado = 'pendiente' and (expira_en is null or expira_en > now()))`;
  return rows.map((r, i) => ({ id: `ocupado-${i}`, vehiculo: r.vehiculo_id, inicio: iso(r.inicio), fin: iso(r.fin), estado: "aprobada" }));
}

export async function vehiculosDisponibles(inicio: string, fin: string, pasajeros = 1) {
  await expirar();
  return db()`select v.* from vehiculos v
    where v.estado = 'disponible' and v.capacidad >= ${pasajeros}
      and not exists (select 1 from reservas r where r.vehiculo_id = v.id
        and r.estado in ('pendiente','aprobada','en_curso')
        and tstzrange(r.inicio, r.fin, '[)') && tstzrange(${inicio}::timestamptz, ${fin}::timestamptz, '[)'))
    order by v.precio_dia`;
}

/* ---------- Clientes ---------- */
export type DatosCliente = {
  nombre: string; documento: string; telefono: string; email?: string | null; fechaNacimiento?: string | null;
  licencia?: string | null; licenciaVence?: string | null; origen: "web" | "chat" | "manual" | "whatsapp"; marketing?: boolean; consentimiento?: boolean;
};

export const normalizarDoc = (d: string) => {
  const t = d.trim().toUpperCase();
  const m = t.match(/^(CC|CE|PA|PAS|TI|NIT)\s*/);
  const tipo = m ? (m[1] === "PAS" ? "PA" : m[1]) : "CC";
  const num = t.replace(/^(CC|CE|PA|PAS|TI|NIT)\s*/, "").replace(/[.\s-]/g, "");
  return `${tipo} ${num}`;
};
export const normalizarTel = (t: string) => {
  const d = soloDigitos(t);
  if (d.length === 10) return `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 12 && d.startsWith("57")) return `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return t.trim();
};
/** Compara teléfonos por sus últimos 10 dígitos. */
export const mismoTel = (a?: string | null, b?: string | null) => !!a && !!b && soloDigitos(a).slice(-10) === soloDigitos(b).slice(-10);

/**
 * Crea o reutiliza un cliente por documento. Si el documento ya existe con otro teléfono,
 * no se modifica (podría ser suplantación) y se devuelve conflicto.
 */
export async function upsertCliente(d: DatosCliente): Promise<{ ok: true; cliente: Row } | { ok: false; error: string }> {
  const documento = normalizarDoc(d.documento);
  const telefono = normalizarTel(d.telefono);
  const [existe] = await db()`select * from clientes where documento = ${documento}`;
  if (existe) {
    if (existe.telefono && !mismoTel(existe.telefono, telefono)) {
      return { ok: false, error: "Ese documento ya está registrado con otro número de teléfono. Un asesor debe validarlo." };
    }
    // Si cambian los datos de la licencia, ese requisito debe verificarse de nuevo.
    const fechaLic = existe.licencia_vence ? new Date(existe.licencia_vence).toISOString().slice(0, 10) : null;
    const licCambio = (!!d.licenciaVence && d.licenciaVence !== fechaLic) || (!!d.licencia && d.licencia !== existe.licencia_categoria);
    const [c] = await db()`update clientes set
        verificacion = case when ${licCambio} then jsonb_set(verificacion, '{licencia}', '"pendiente"') else verificacion end,
        email = coalesce(${d.email || null}, email),
        fecha_nacimiento = coalesce(${d.fechaNacimiento || null}::date, fecha_nacimiento),
        licencia_categoria = coalesce(${d.licencia || null}, licencia_categoria),
        licencia_vence = coalesce(${d.licenciaVence || null}::date, licencia_vence),
        telefono = coalesce(telefono, ${telefono}),
        consentimiento_datos = coalesce(consentimiento_datos, ${d.consentimiento ? new Date() : null}),
        consentimiento_marketing = consentimiento_marketing or ${!!d.marketing}
      where id = ${existe.id} returning *`;
    return { ok: true, cliente: c };
  }
  const verif = { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: d.origen === "whatsapp" ? "verificado" : "pendiente", deposito: "pendiente" };
  const [c] = await db()`insert into clientes (nombre, documento, telefono, email, fecha_nacimiento, licencia_categoria, licencia_vence, origen, verificacion, consentimiento_datos, consentimiento_marketing)
    values (${d.nombre.trim()}, ${documento}, ${telefono}, ${d.email || null}, ${d.fechaNacimiento || null}, ${d.licencia || null}, ${d.licenciaVence || null}, ${d.origen},
      ${db().json(verif)}, ${d.consentimiento ? new Date() : null}, ${!!d.marketing}) returning *`;
  return { ok: true, cliente: c };
}

/* ---------- Clientes habituales ---------- */
/** Cliente cuyo documento Y celular coinciden (para que nadie consulte datos ajenos con solo un documento). */
export async function clientePorDocYTel(documento: string, telefono: string) {
  const doc = normalizarDoc(documento);
  const [c] = await db()`select * from clientes where replace(documento, ' ', '') = ${doc.replace(" ", "")}
    or regexp_replace(documento, '\\D', '', 'g') = ${soloDigitos(documento)} order by creado_en limit 1`;
  return c && mismoTel(c.telefono, telefono) ? c : null;
}

/** Cliente registrado con ese celular (en WhatsApp el número lo verifica WhatsApp). */
export async function clientePorTelefono(telefono: string) {
  const ult = soloDigitos(telefono).slice(-10);
  if (ult.length < 10) return null;
  const [c] = await db()`select * from clientes where right(regexp_replace(coalesce(telefono, ''), '\\D', '', 'g'), 10) = ${ult} order by creado_en desc limit 1`;
  return c ?? null;
}

/** Resumen del cliente: si es habitual y qué datos faltan para reservar sin volver a escribirlos. */
export async function perfilCliente(c: Row, finReserva?: string) {
  const [{ n }] = await db()`select count(*)::int as n from reservas where cliente_id = ${c.id} and estado in ('en_curso', 'finalizada')`;
  const licVencida = !c.licencia_vence || (finReserva ? new Date(c.licencia_vence) < new Date(finReserva) : new Date(c.licencia_vence) < new Date());
  const faltan: string[] = [];
  if (!c.email) faltan.push("email");
  if (!c.fecha_nacimiento) faltan.push("nacimiento");
  if (!c.licencia_categoria) faltan.push("licencia");
  if (licVencida) faltan.push("licenciaVence");
  const verif = (c.verificacion ?? {}) as Record<string, string>;
  return {
    nombre: c.nombre as string,
    primerNombre: String(c.nombre).split(" ")[0],
    alquileres: n,
    habitual: n > 0,
    requisitosVerificados: Object.values(verif).length > 0 && Object.values(verif).every((v) => v === "verificado"),
    consentimiento: !!c.consentimiento_datos,
    faltan,
  };
}

/* ---------- Reservas ---------- */
export async function crearReserva(p: {
  clienteId: string; vehiculoId: string; inicio: string; fin: string; lugar: string; origen: "web" | "chat" | "manual" | "whatsapp";
  estado?: "pendiente" | "aprobada"; notas?: string; actor: string;
}): Promise<{ ok: true; reserva: Row } | { ok: false; error: string }> {
  await expirar();
  const [v] = await db()`select * from vehiculos where id = ${p.vehiculoId}`;
  if (!v) return { ok: false, error: "Vehículo no encontrado." };
  if (v.estado !== "disponible") return { ok: false, error: `El ${v.marca} ${v.modelo} no está disponible (${v.estado}).` };
  if (new Date(p.fin) <= new Date(p.inicio)) return { ok: false, error: "La devolución debe ser posterior a la recogida." };
  if (new Date(p.inicio).getTime() < Date.now() - 3600000) return { ok: false, error: "La fecha de recogida ya pasó." };
  const { prereservaHoras } = await ajustes();
  const estado = p.estado ?? "pendiente";
  const n = dias(p.inicio, p.fin);
  try {
    const [r] = await db()`insert into reservas (cliente_id, vehiculo_id, inicio, fin, lugar, estado, expira_en, origen, precio_dia, dias, total, deposito, notas, nueva)
      values (${p.clienteId}, ${v.id}, ${p.inicio}, ${p.fin}, ${p.lugar}, ${estado},
        ${estado === "pendiente" ? new Date(Date.now() + prereservaHoras * 3600000) : null}, ${p.origen},
        ${v.precio_dia}, ${n}, ${n * v.precio_dia}, ${v.deposito}, ${p.notas ?? ""}, ${p.origen !== "manual"}) returning *`;
    const etiqueta = { web: "Web", chat: "Chat web", manual: "Manual", whatsapp: "WhatsApp" }[p.origen];
    await db()`insert into reserva_historial (reserva_id, texto, actor) values (${r.id}, ${`Solicitud creada (${etiqueta})`}, ${p.actor})`;
    await db()`insert into auditoria (actor, accion) values (${p.actor}, ${`Creó ${r.codigo} (${v.marca} ${v.modelo})`})`;
    if (p.origen !== "manual") await db()`insert into notificaciones (texto) values (${`Nueva solicitud ${r.codigo} desde ${etiqueta}`})`;
    return { ok: true, reserva: { ...r, vehiculo: v } };
  } catch (e) {
    if (esCruce(e)) return { ok: false, error: "Ese vehículo ya está reservado en esas fechas." };
    throw e;
  }
}
