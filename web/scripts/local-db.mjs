// Postgres local sin instalar nada (PGlite). Solo para desarrollo.
// Uso: npm run db:local   →  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/postgres  (otro puerto: PGLITE_PORT=...)
// Detenerla SIEMPRE con Ctrl+C: así guarda bien los datos. Si se cierra de golpe, la carpeta .pglite-data se puede dañar.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PGLITE_PORT || 5434);
let db, server;
try {
  db = await PGlite.create({ dataDir: "./.pglite-data", extensions: { btree_gist } });
  server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
} catch (e) {
  const puertoOcupado = /EADDRINUSE/.test(String(e?.code ?? e?.message));
  console.error(puertoOcupado
    ? `\nEl puerto ${port} ya está ocupado: probablemente la base local ya está abierta en otra terminal.\n`
    : `\nNo se pudo abrir la base local (la carpeta .pglite-data parece dañada, normalmente por cerrarla de golpe).\n` +
      `Solo tiene datos de prueba. Para empezar de cero, en PowerShell dentro de la carpeta web:\n` +
      `  Rename-Item .pglite-data .pglite-data-danada-$(new Date().toISOString().slice(0, 10))\n` +
      `  npm run db:local          (en esta terminal)\n` +
      `  npm run db:setup          (en otra terminal, con la web apagada)\n`);
  process.exit(1);
}
console.log(`Postgres local (PGlite) en postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log("Deja esta terminal abierta. Para detenerla, pulsa Ctrl+C.");

let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  console.log("\nCerrando la base local…");
  try { await server.stop(); await db.close(); } catch { /* ya estaba cerrada */ }
  process.exit(0);
}
// Ctrl+C, cerrar la terminal (Windows) o detener el proceso.
for (const s of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) process.on(s, cerrar);
