// Borra todos los datos de operación y deja solo la flota, la configuración y los usuarios del panel.
// Uso: npm run db:limpiar              → muestra qué se borraría (no borra nada)
//      npm run db:limpiar -- --confirmar → borra de verdad (no se puede deshacer)
import { config } from "dotenv";
import postgres from "postgres";
import { limpiarDatabaseUrl } from "../lib/database-url.mjs";

config({ path: ".env.local" });
config();
const { url, host, error } = limpiarDatabaseUrl(process.env.DATABASE_URL);
if (!url) { console.error(error); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

// Orden: primero lo que depende de otras tablas.
const BORRAR = [
  ["reserva_historial", "historial de reservas"],
  ["mensajes", "mensajes de chat y WhatsApp"],
  ["conversaciones", "conversaciones"],
  ["whatsapp_procesados", "control de mensajes de WhatsApp"],
  ["servicios", "servicios de conductor"],
  ["reservas", "reservas"],
  ["clientes", "clientes"],
  ["notificaciones", "notificaciones"],
  ["auditoria", "registro de actividad"],
  ["alertas_avisadas", "alertas de la flota ya avisadas"],
];
const confirmar = process.argv.includes("--confirmar");

try {
  const [{ n: carros }] = await sql`select count(*)::int as n from vehiculos`;
  const [{ n: usuarios }] = await sql`select count(*)::int as n from usuarios`;
  console.log(`Base de datos: ${host}`);
  console.log(`Se conservan: ${carros} vehículo(s), la configuración y ${usuarios} usuario(s) del panel.\n`);
  for (const [t, etiqueta] of BORRAR) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`  ${confirmar ? "Borrando" : "Se borraría"}: ${String(n).padStart(5)} · ${etiqueta}`);
  }
  if (!confirmar) {
    console.log("\nNo se borró nada. Para borrar de verdad: npm run db:limpiar -- --confirmar");
  } else {
    await sql.begin(async (tx) => {
      await tx`truncate ${tx(BORRAR.map(([t]) => t))} restart identity`;
      await tx`alter sequence reserva_codigo_seq restart with 1001`;
    });
    console.log("\nListo: datos borrados. Las nuevas reservas empiezan en RR-1001.");
  }
} finally {
  await sql.end();
}
