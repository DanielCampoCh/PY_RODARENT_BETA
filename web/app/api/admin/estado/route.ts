import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { waConfig } from "@/lib/whatsapp";
import { verifikActivo } from "@/lib/verifik";
import { ajustes, expirar, mapCliente, mapReserva, mapVehiculo, negocio } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Estado completo del panel. Solo usuarios autenticados; el operador recibe documentos enmascarados. */
export async function GET() {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
  await expirar();
  const sql = db();
  const esAdmin = u.rol === "admin";
  const [veh, cli, res, hist, conv, msgs, aud, notif, a, vext, pers, cons] = await Promise.all([
    sql`select * from vehiculos order by creado_en`,
    sql`select * from clientes order by creado_en desc`,
    sql`select * from reservas order by inicio`,
    sql`select * from reserva_historial order by fecha`,
    sql`select id, cliente_id, reserva_id, nombre, telefono, canal, estado, no_leidos, ultima_actividad from conversaciones order by ultima_actividad desc limit 200`,
    sql`select conversacion_id, emisor, texto, fecha from mensajes where conversacion_id in (select id from conversaciones order by ultima_actividad desc limit 200) order by id`,
    sql`select actor, accion, fecha from auditoria order by id desc limit 40`,
    sql`select id, texto, leida, fecha from notificaciones order by id desc limit 20`,
    ajustes(),
    sql`select cliente_id, fuente, resultado, detalle, actor, fecha from verificaciones_externas order by fecha desc limit 400`,
    esAdmin ? sql`select id, nombre, documento, cargo, telefono, creado_en from personal where activo order by nombre` : [],
    esAdmin ? sql`select id, cliente_id, personal_id, documento, nombre_certificado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, estado,
      coincide_documento, coincide_nombre, detalle, archivo_tipo, archivo_nombre, actor, fecha from consultas_antecedentes order by fecha desc limit 1000` : [],
  ]);
  const histPor = new Map<string, Record<string, unknown>[]>();
  hist.forEach((h) => histPor.set(h.reserva_id, [...(histPor.get(h.reserva_id) ?? []), h]));
  const msgPor = new Map<string, { emisor: string; texto: string; fecha: string }[]>();
  msgs.forEach((m) => msgPor.set(m.conversacion_id, [...(msgPor.get(m.conversacion_id) ?? []), { emisor: m.emisor, texto: m.texto, fecha: new Date(m.fecha).toISOString() }]));

  return NextResponse.json({
    me: { nombre: u.nombre, rol: u.rol === "admin" ? "Administrador" : "Operador", key: u.rol },
    negocio: negocio(),
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
    whatsappActivo: waConfig().activo,
    verifikActivo: verifikActivo(),
    // Los resultados de antecedentes solo los ve el administrador.
    verificaciones: (u.rol === "admin" ? vext : []).map((x) => ({ cliente: x.cliente_id, fuente: x.fuente, resultado: x.resultado, detalle: x.detalle, actor: x.actor, fecha: new Date(x.fecha).toISOString() })),
    // Personal y consultas de antecedentes en la Procuraduría: solo el administrador.
    personal: pers.map((p) => ({ id: p.id, nombre: p.nombre, doc: p.documento, cargo: p.cargo, tel: p.telefono, creado: new Date(p.creado_en).toISOString() })),
    consultas: cons.map((c) => ({
      id: String(c.id), cliente: c.cliente_id, personal: c.personal_id, doc: c.documento, nombre: c.nombre_certificado,
      nombres: [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido], estado: c.estado, coincideDoc: c.coincide_documento, coincideNombre: c.coincide_nombre,
      detalle: c.detalle, archivo: c.archivo_tipo ? { tipo: c.archivo_tipo, nombre: c.archivo_nombre } : null, actor: c.actor, fecha: new Date(c.fecha).toISOString(),
    })),
    vehicles: veh.map(mapVehiculo),
    customers: cli.map((c) => mapCliente(c, u.rol !== "admin")),
    reservations: res.map((r) => mapReserva(r, histPor.get(r.id))),
    conversations: conv.map((c) => ({
      id: c.id, cliente: c.cliente_id, reserva: c.reserva_id, nombre: c.nombre, tel: c.telefono, canal: c.canal, estado: c.estado,
      noLeidos: c.no_leidos, ultima: new Date(c.ultima_actividad).toISOString(), mensajes: msgPor.get(c.id) ?? [],
    })),
    audit: aud.map((x) => ({ actor: x.actor, accion: x.accion, fecha: new Date(x.fecha).toISOString() })),
    notifications: notif.map((x) => ({ id: x.id, texto: x.texto, leida: x.leida, fecha: new Date(x.fecha).toISOString() })),
    settings: a,
  });
}
