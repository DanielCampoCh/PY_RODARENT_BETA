// Postgres local sin instalar nada (PGlite). Solo para desarrollo.
// Uso: npm run db:local   →  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/postgres  (otro puerto: PGLITE_PORT=...)
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create({ dataDir: "./.pglite-data", extensions: { btree_gist } });
const port = Number(process.env.PGLITE_PORT || 5434);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
await server.start();
console.log(`Postgres local (PGlite) en postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
process.on("SIGINT", async () => { await server.stop(); await db.close(); process.exit(0); });
