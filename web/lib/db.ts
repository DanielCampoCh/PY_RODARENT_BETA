import postgres from "postgres";
import { limpiarDatabaseUrl } from "./database-url.mjs";

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __rrSql?: Sql };

function connect(): Sql {
  const { url, error } = limpiarDatabaseUrl(process.env.DATABASE_URL);
  if (!url) throw new Error(error);
  // prepare:false para funcionar con poolers en modo transacción (Supabase/Neon) desde funciones serverless.
  return postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX) || 5, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
}

/** Cliente Postgres compartido (se crea en el primer uso). */
export function db(): Sql {
  if (!g.__rrSql) g.__rrSql = connect();
  return g.__rrSql;
}

export const TZ = "America/Bogota";
export const fmtFecha = (d: string | Date) => new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: TZ });
export const fmtFechaHora = (d: string | Date) =>
  new Date(d).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });
export const dias = (a: string | Date, b: string | Date) => Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
export const soloDigitos = (s: string) => (s || "").replace(/\D/g, "");

/** Error de base de datos por cruce de reservas (restricción EXCLUDE). */
export const esCruce = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "23P01";
