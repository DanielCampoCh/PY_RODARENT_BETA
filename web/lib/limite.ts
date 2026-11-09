/** Límite simple de intentos por clave (en memoria de la instancia). */
const registros = new Map<string, number[]>();

export function excedeLimite(clave: string, max: number, ventanaMs: number) {
  const ahora = Date.now();
  const lista = (registros.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  lista.push(ahora);
  registros.set(clave, lista);
  if (registros.size > 5000) registros.clear();
  return lista.length > max;
}

export const ipDe = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
