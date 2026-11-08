import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { ajustes, expirar, mapCliente, mapReserva, mapVehiculo, negocio } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Estado completo del panel. Solo usuarios autenticados; el operador recibe documentos enmascarados. */
export async function GET() {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
  await expirar();
  const sql = db();
  const [veh, cli, res, hist, conv, msgs, aud, notif, a] = await Promise.all([
    sql`select * from vehiculos order by creado_en`,
    sql`select * from clientes order by creado_en desc`,
    sql`select * from reservas order by inicio`,
    sql`select * from reserva_historial order by fecha`,
    sql`select id, cliente_id, reserva_id, nombre, telefono, canal, estado, no_leidos, ultima_actividad from conversaciones order by ultima_actividad desc limit 200`,
    sql`select conversacion_id, emisor, texto, fecha from mensajes where conversacion_id in (select id from conversaciones order by ultima_actividad desc limit 200) order by id`,
    sql`select actor, accion, fecha from auditoria order by id desc limit 40`,
    sql`select id, texto, leida, fecha from notificaciones order by id desc limit 20`,
    ajustes(),
  ]);
  const histPor = new Map<string, Record<string, unknown>[]>();
  hist.forEach((h) => histPor.set(h.reserva_id, [...(histPor.get(h.reserva_id) ?? []), h]));
  const msgPor = new Map<string, { emisor: string; texto: string; fecha: string }[]>();
  msgs.forEach((m) => msgPor.set(m.conversacion_id, [...(msgPor.get(m.conversacion_id) ?? []), { emisor: m.emisor, texto: m.texto, fecha: new Date(m.fecha).toISOString() }]));

  return NextResponse.json({
    me: { nombre: u.nombre, rol: u.rol === "admin" ? "Administrador" : "Operador", key: u.rol },
    negocio: negocio(),
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
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
