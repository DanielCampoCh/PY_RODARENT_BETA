// Crea las tablas, carga datos de ejemplo (si la base está vacía) y crea/actualiza los usuarios del panel.
// Uso: npm run db:setup   (o npm run db:reset para borrar todo y empezar de cero)
import { config } from "dotenv";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import { limpiarDatabaseUrl } from "../lib/database-url.mjs";

config({ path: ".env.local" });
config();

const { url, host, error } = limpiarDatabaseUrl(process.env.DATABASE_URL);
if (!url) { console.error(error); process.exit(1); }
console.log(`Base de datos: ${host}`);
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const reset = process.argv.includes("--reset");

const hash = (pw) => { const salt = randomBytes(16).toString("hex"); return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString("hex")}`; };

// Fechas relativas a hoy en hora de Colombia (UTC-5, sin horario de verano)
const OFFSET = -5;
function at(day, hour, min = 0) {
  const now = new Date(Date.now() + OFFSET * 3600000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, hour - OFFSET, min));
  return d.toISOString();
}
const fromNow = (h) => new Date(Date.now() + h * 3600000).toISOString();

async function main() {
  if (reset) {
    console.log("Borrando tablas…");
    await sql.unsafe(`drop table if exists notificaciones, auditoria, mensajes, conversaciones, reserva_historial, reservas, clientes, vehiculos, configuracion, usuarios cascade;
      drop sequence if exists reserva_codigo_seq; drop function if exists expirar_prereservas();`);
  }
  console.log("Creando esquema…");
  await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

  await sql`insert into configuracion (clave, valor) values ('ajustes', ${sql.json({
    prereservaHoras: 24, edadMinima: 21, licenciaVigente: true, categorias: ["B1", "B2", "C1"], depositoObligatorio: true,
    experienciaMin: 2, experienciaActiva: false, docAdicional: false, retencionDias: 90, recordatorioHoras: 24,
    lugares: ["Oficina principal (El Poblado)", "Aeropuerto José María Córdova", "Terminal del Sur", "Domicilio (costo adicional)"],
    horario: "Lun a Sáb · 7:00 a. m. – 7:00 p. m.",
  })}) on conflict (clave) do nothing`;

  const [{ n }] = await sql`select count(*)::int as n from vehiculos`;
  if (process.argv.includes("--sin-ejemplos")) console.log("Sin datos de ejemplo (--sin-ejemplos).");
  else if (n === 0) await seed();
  else console.log("La base ya tiene datos: no se cargan ejemplos.");

  for (const [email, pw, nombre, rol] of [
    [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, process.env.ADMIN_NOMBRE || "Administrador", "admin"],
    [process.env.OPERADOR_EMAIL, process.env.OPERADOR_PASSWORD, process.env.OPERADOR_NOMBRE || "Operador", "operador"],
  ]) {
    if (!email || !pw) continue;
    if (pw.length < 8) { console.warn(`Clave de ${email} muy corta (mínimo 8). Usuario no creado.`); continue; }
    await sql`insert into usuarios (email, nombre, rol, password_hash) values (${email.toLowerCase()}, ${nombre}, ${rol}, ${hash(pw)})
      on conflict (email) do update set password_hash = excluded.password_hash, rol = excluded.rol, nombre = excluded.nombre, activo = true`;
    console.log(`Usuario ${rol}: ${email}`);
  }
  console.log("Listo.");
  await sql.end();
}

async function seed() {
  console.log("Cargando datos de ejemplo…");
  const V = [
    ["Kia", "Picanto", 2024, "JKM-482", "hatch", 5, 1, "Mecánica", "Gasolina", "#e5484d", 140000, 600000, "disponible", "Económico"],
    ["Chevrolet", "Onix", 2024, "LQT-215", "sedan", 5, 2, "Automática", "Gasolina", "#f1f3f5", 165000, 700000, "disponible", "Más pedido"],
    ["Mazda", "2 Sedán", 2023, "HZR-907", "sedan", 5, 2, "Automática", "Gasolina", "#8e1b2c", 180000, 800000, "disponible", null],
    ["Renault", "Duster 4x4", 2022, "GTP-330", "suv", 5, 3, "Mecánica", "Gasolina", "#6b7a4b", 230000, 1000000, "mantenimiento", null],
    ["Kia", "Sportage", 2024, "NBV-118", "suv", 5, 3, "Automática", "Híbrido", "#3b4a63", 280000, 1200000, "disponible", "Híbrido"],
    ["Toyota", "Fortuner", 2023, "KYD-764", "suv", 7, 4, "Automática", "Diésel", "#1f2937", 380000, 1800000, "disponible", "7 puestos"],
    ["Toyota", "Hilux", 2023, "MRS-551", "pickup", 5, 4, "Mecánica", "Diésel", "#9aa3ad", 350000, 1600000, "disponible", null],
    ["Hyundai", "H1 Van", 2022, "PLX-209", "van", 12, 8, "Mecánica", "Diésel", "#f8f9fa", 420000, 2000000, "disponible", "Grupos"],
  ];
  const veh = {};
  for (const v of V) {
    const [r] = await sql`insert into vehiculos (marca, modelo, anio, placa, tipo, capacidad, maletas, transmision, combustible, color, precio_dia, deposito, estado, destacado)
      values (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}, ${v[8]}, ${v[9]}, ${v[10]}, ${v[11]}, ${v[12]}, ${v[13]}) returning id, precio_dia, deposito`;
    veh[v[3]] = r;
  }
  const ok = { identidad: "verificado", licencia: "verificado", edad: "verificado", contacto: "verificado", deposito: "verificado" };
  const C = [
    ["laura", "Laura Gómez Restrepo", "CC 1036552781", "+57 310 555 0142", "laura.gomez@ejemplo.com", "1992-04-11", "B1", "2029-03-14", "web", at(-20, 9), ok],
    ["mateo", "Mateo Castaño", "CC 98765443", "+57 301 555 0199", "mateo.c@ejemplo.com", "1985-02-03", "B2", "2028-11-02", "whatsapp", at(-15, 11), ok],
    ["daniela", "Daniela Ospina", "CC 1152330908", "+57 315 555 0110", "dani.ospina@ejemplo.com", "1999-08-20", "B1", "2030-06-21", "web", at(-6, 16), ok],
    ["santiago", "Santiago Vélez", "CC 71234889", "+57 320 555 0177", "svelez@ejemplo.com", "1988-01-30", "B1", "2027-08-30", "manual", at(-30, 10), ok],
    ["carlos", "Carlos Ramírez", "CC 1017889214", "+57 304 555 0163", "carlos.ramirez@ejemplo.com", "1997-06-15", "B1", "2028-01-15", "whatsapp", fromNow(-7), { identidad: "verificado", licencia: "pendiente", edad: "verificado", contacto: "verificado", deposito: "pendiente" }],
    ["mariana", "Mariana López", "CC 1040778120", "+57 311 555 0128", "mariana.lopez@ejemplo.com", "2002-03-09", "B1", "2029-09-09", "web", at(-1, 19), { identidad: "verificado", licencia: "verificado", edad: "verificado", contacto: "pendiente", deposito: "pendiente" }],
    ["valentina", "Valentina Mejía", "CC 43998201", "+57 300 555 0185", "vale.mejia@ejemplo.com", "1990-12-01", "B2", "2031-02-01", "whatsapp", fromNow(-3), { identidad: "pendiente", licencia: "pendiente", edad: "pendiente", contacto: "verificado", deposito: "pendiente" }],
    ["felipe", "Felipe Arango", "CC 1128441662", "+57 312 555 0136", "farango@ejemplo.com", "2006-02-10", "B1", "2025-04-10", "web", at(-3, 12), { identidad: "verificado", licencia: "rechazado", edad: "rechazado", contacto: "verificado", deposito: "pendiente" }],
  ];
  const cli = {};
  for (const c of C) {
    const [r] = await sql`insert into clientes (nombre, documento, telefono, email, fecha_nacimiento, licencia_categoria, licencia_vence, origen, creado_en, verificacion, consentimiento_datos)
      values (${c[1]}, ${c[2]}, ${c[3]}, ${c[4]}, ${c[5]}, ${c[6]}, ${c[7]}, ${c[8]}, ${c[9]}, ${sql.json(c[10])}, ${c[9]}) returning id`;
    cli[c[0]] = r.id;
  }
  const R = [
    ["daniela", "HZR-907", at(-12, 9), at(-9, 9), "finalizada", "web", at(-15, 10), ""],
    ["santiago", "NBV-118", at(-9, 8), at(-6, 18), "finalizada", "manual", at(-12, 10), ""],
    ["laura", "LQT-215", at(-2, 10), at(1, 10), "en_curso", "web", at(-5, 15), ""],
    ["mateo", "KYD-764", at(-1, 8), at(3, 18), "en_curso", "whatsapp", at(-4, 9), ""],
    ["daniela", "JKM-482", at(0, 15), at(2, 15), "aprobada", "web", at(-2, 11), ""],
    ["santiago", "NBV-118", at(1, 9), at(4, 9), "aprobada", "manual", at(-3, 17), ""],
    ["carlos", "MRS-551", at(3, 7), at(6, 19), "pendiente", "whatsapp", fromNow(-6), "Viaje de trabajo a Urabá. Pidió confirmar si puede recoger 6:30 a. m."],
    ["mariana", "HZR-907", at(5, 10), at(8, 10), "pendiente", "web", fromNow(-21), ""],
    ["valentina", "PLX-209", at(10, 6), at(12, 20), "pendiente", "whatsapp", fromNow(-2), "Paseo familiar, 10 personas."],
    ["felipe", "LQT-215", at(6, 9), at(8, 9), "rechazada", "web", at(-3, 12), "Licencia vencida y no cumple edad mínima (21)."],
    ["laura", "LQT-215", at(8, 9), at(11, 9), "aprobada", "web", at(-1, 13), ""],
    ["mateo", "JKM-482", at(4, 9), at(5, 18), "vencida", "whatsapp", at(-2, 9), "El cliente no completó documentos en 24 h."],
    ["santiago", "PLX-209", at(15, 7), at(18, 19), "aprobada", "manual", at(-1, 9), ""],
  ];
  const expiraPorCliente = { carlos: fromNow(18), mariana: fromNow(3), valentina: fromNow(22) };
  const res = {};
  for (const r of R) {
    const v = veh[r[1]];
    const dias = Math.max(1, Math.ceil((new Date(r[3]) - new Date(r[2])) / 86400000));
    const [row] = await sql`insert into reservas (cliente_id, vehiculo_id, inicio, fin, lugar, estado, expira_en, origen, precio_dia, dias, total, deposito, notas, creado_en, nueva)
      values (${cli[r[0]]}, ${v.id}, ${r[2]}, ${r[3]}, 'Oficina principal (El Poblado)', ${r[4]}, ${r[4] === "pendiente" ? expiraPorCliente[r[0]] : null}, ${r[5]},
        ${v.precio_dia}, ${dias}, ${dias * v.precio_dia}, ${v.deposito}, ${r[7]}, ${r[6]}, false) returning id, codigo`;
    await sql`insert into reserva_historial (reserva_id, texto, actor, fecha) values (${row.id}, ${"Solicitud creada (" + ({ web: "Web", whatsapp: "WhatsApp", manual: "Manual" })[r[5]] + ")"}, ${r[5] === "manual" ? "Administrador" : r[5] === "whatsapp" ? "Asistente IA" : "Cliente (web)"}, ${r[6]})`;
    res[r[0] + r[1]] = row;
  }

  const conv = async (cliente, nombre, tel, estado, reserva, msgs, noLeidos = 0) => {
    const last = msgs[msgs.length - 1][2];
    const [k] = await sql`insert into conversaciones (cliente_id, reserva_id, nombre, telefono, canal, estado, no_leidos, ultima_actividad, creado_en)
      values (${cliente ? cli[cliente] : null}, ${reserva ? res[reserva].id : null}, ${nombre}, ${tel}, 'whatsapp', ${estado}, ${noLeidos}, ${fromNow(last)}, ${fromNow(msgs[0][2])}) returning id`;
    for (const [emisor, texto, h] of msgs) await sql`insert into mensajes (conversacion_id, emisor, texto, fecha) values (${k.id}, ${emisor}, ${texto}, ${fromNow(h)})`;
  };
  const fd = (iso) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
  await conv("carlos", "Carlos Ramírez", "+57 304 555 0163", "ia", "carlosMRS-551", [
    ["cliente", "Hola, buenas. Necesito una camioneta para la otra semana", -6.4],
    ["ia", "¡Hola Carlos! 👋 Soy el asistente de Autos del Valle. ¿Qué días la necesitas y dónde la recogerías?", -6.4],
    ["cliente", `Del ${fd(at(3, 7))} al ${fd(at(6, 19))}, en la oficina. Es para ir a Urabá por trabajo`, -6.3],
    ["ia", "Para carretera te recomiendo la Toyota Hilux 4x4 (diésel): $350.000/día. Por 4 días serían $1.400.000 + depósito reembolsable de $1.600.000. ¿Te la aparto?", -6.3],
    ["cliente", "Sí, de una", -6.2],
    ["ia", "Listo ✅ Te la dejo pre-reservada por 24 h mientras revisamos tus documentos.", -6.2],
  ]);
  await conv(null, "Andrea Torres", "+57 318 555 0151", "pendiente", null, [
    ["cliente", "Hola, quiero alquilar un carro por 2 semanas, ¿me hacen descuento?", -1.5],
    ["ia", "¡Hola Andrea! Los descuentos por larga duración los aprueba directamente el propietario. Te comunico con un asesor para darte el mejor precio 🙌", -1.4],
    ["sistema", "Conversación transferida a un asesor · Motivo: negociación de tarifa", -1.4],
    ["cliente", "Ok, quedo atenta", -1.2],
  ], 2);
  await conv("valentina", "Valentina Mejía", "+57 300 555 0185", "ia", "valentinaPLX-209", [
    ["cliente", "Hola! Somos 10 personas para un paseo, ¿tienen algo?", -2.3],
    ["ia", "¡Hola Valentina! Para 10 personas tenemos la Hyundai H1 Van de 12 puestos 🚐 a $420.000/día. ¿Qué fechas tienes en mente?", -2.3],
    ["cliente", `Del ${fd(at(10, 6))} al ${fd(at(12, 20))}`, -2.1],
    ["ia", "¡Está disponible! Serían 3 días: $1.260.000 + depósito de $2.000.000. Te la aparté; falta que envíes los documentos.", -2],
  ]);
  await conv("mateo", "Mateo Castaño", "+57 301 555 0199", "humano", "mateoKYD-764", [
    ["cliente", "Hola, ¿puedo devolver la Fortuner un día después?", -20.5],
    ["ia", "Déjame confirmar con el equipo la disponibilidad para extender tu reserva.", -20.5],
    ["humano", "Hola Mateo, sí te la extendemos un día sin problema. Te actualizo la reserva 👍", -20],
  ]);
  await sql`insert into auditoria (actor, accion, fecha) values ('Sistema', 'Datos de ejemplo cargados', now())`;
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
