import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { plantillas, waConfig } from "@/lib/whatsapp";
import { alertasFlota, avisarAlertas } from "@/lib/alertas";
import { fotosParaMostrar, fotosPorVehiculo, galeria } from "@/lib/fotos";
import { ajustes, expirar, mapCliente, mapReserva, mapVehiculoPanel, negocio } from "@/lib/repo";

export const dynamic = "force-dynamic";

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

/** Estado completo del panel. Solo usuarios autenticados; el operador recibe documentos enmascarados. */
export async function GET() {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sesión no válida" }, { status: 401 });
  await expirar();
  const sql = db();
  const esAdmin = u.rol === "admin";
  const [veh, cli, res, hist, conv, msgs, aud, a, serv, usuarios, cond] = await Promise.all([
    sql`select * from vehiculos order by modalidad, codigo, creado_en`,
    sql`select * from clientes order by creado_en desc`,
    sql`select * from reservas order by inicio`,
    sql`select * from reserva_historial order by fecha`,
    sql`select id, cliente_id, reserva_id, nombre, telefono, canal, estado, no_leidos, ultima_actividad from conversaciones order by ultima_actividad desc limit 200`,
    sql`select conversacion_id, emisor, texto, fecha from mensajes where conversacion_id in (select id from conversaciones order by ultima_actividad desc limit 200) order by id`,
    sql`select actor, accion, fecha from auditoria order by id desc limit 60`,
    ajustes(),
    sql`select * from servicios order by fecha desc limit 300`,
    esAdmin ? sql`select id, email, nombre, rol, activo, creado_en from usuarios order by creado_en` : [],
    sql`select * from conductores order by activo desc, nombre`,
  ]);
  const fotos = await fotosPorVehiculo();
  const g = galeria();
  // Alertas de la flota: se calculan al abrir el panel y las nuevas quedan como notificación (una sola vez).
  const alertas = alertasFlota(veh, a);
  try { await avisarAlertas(alertas, a); } catch (e) { console.error("[alertas]", e instanceof Error ? e.message : e); }
  const notif = await sql`select id, texto, leida, fecha from notificaciones order by id desc limit 40`;

  const histPor = new Map<string, Record<string, unknown>[]>();
  hist.forEach((h) => histPor.set(h.reserva_id, [...(histPor.get(h.reserva_id) ?? []), h]));
  const msgPor = new Map<string, { emisor: string; texto: string; fecha: string }[]>();
  msgs.forEach((m) => msgPor.set(m.conversacion_id, [...(msgPor.get(m.conversacion_id) ?? []), { emisor: m.emisor, texto: m.texto, fecha: new Date(m.fecha).toISOString() }]));

  return NextResponse.json({
    me: { id: u.id, nombre: u.nombre, rol: u.rol === "admin" ? "Administrador" : "Operador", key: u.rol },
    negocio: negocio(),
    iaDisponible: !!process.env.ANTHROPIC_API_KEY,
    whatsappActivo: waConfig().activo,
    plantillas: plantillas(),
    conductores: cond.map((c) => ({ id: c.id, nombre: c.nombre, tel: c.telefono, activo: c.activo, notas: c.notas })),
    vehicles: veh.map((v) => mapVehiculoPanel(v, fotosParaMostrar(v, fotos.get(v.id)), fotos.get(v.id) ?? [])),
    galeria: g.fotos.map(({ url, titulo, detalle }) => ({ url, titulo, detalle })),
    alertasFlota: alertas,
    customers: cli.map((c) => mapCliente(c, u.rol !== "admin")),
    reservations: res.map((r) => mapReserva(r, histPor.get(r.id))),
    conversations: conv.map((c) => ({
      id: c.id, cliente: c.cliente_id, reserva: c.reserva_id, nombre: c.nombre, tel: c.telefono, canal: c.canal, estado: c.estado,
      noLeidos: c.no_leidos, ultima: new Date(c.ultima_actividad).toISOString(), mensajes: msgPor.get(c.id) ?? [],
    })),
    servicios: serv.map((s) => ({
      id: s.id, codigo: s.codigo, conversacion: s.conversacion_id, cliente: s.cliente_id, nombre: s.nombre, tel: s.telefono, origen: s.origen, destino: s.destino,
      fecha: iso(s.fecha), pasajeros: s.pasajeros, notas: s.notas, estado: s.estado, conductor: s.conductor, tomado: iso(s.tomado_en), enviados: s.enviados ?? 0, canal: s.canal, creado: iso(s.creado_en),
    })),
    usuarios: usuarios.map((x) => ({ id: x.id, email: x.email, nombre: x.nombre, rol: x.rol, activo: x.activo, creado: iso(x.creado_en) })),
    audit: aud.map((x) => ({ actor: x.actor, accion: x.accion, fecha: new Date(x.fecha).toISOString() })),
    notifications: notif.map((x) => ({ id: x.id, texto: x.texto, leida: x.leida, fecha: new Date(x.fecha).toISOString() })),
    settings: a,
  });
}
