// Limpia la cadena de conexión tal como suele copiarse desde Neon o Supabase.
// Acepta: postgresql://..., 'postgresql://...', psql 'postgresql://...', DATABASE_URL=postgresql://...
export function limpiarDatabaseUrl(raw) {
  if (!raw) return { error: "Falta la variable DATABASE_URL." };
  let s = String(raw).trim();
  s = s.replace(/^DATABASE_URL\s*=\s*/i, "").replace(/^psql\s+/i, "").trim();
  s = s.replace(/^['"]+|['"]+$/g, "").trim();
  // Prefijo duplicado al pegar, p. ej. "postgres:postgresql://..."
  s = s.replace(/^postgres(ql)?:(?=postgres(ql)?:\/\/)/i, "");
  if (!/^postgres(ql)?:\/\//i.test(s)) {
    return { error: "DATABASE_URL no es válida: debe empezar con postgresql:// (cópiala desde Neon → Connect, sin 'psql' ni comillas)." };
  }
  let url;
  try { url = new URL(s); } catch { return { error: "DATABASE_URL tiene un formato inválido. Cópiala de nuevo desde Neon → Connect." }; }
  if (!url.hostname) return { error: "DATABASE_URL no tiene servidor (host). Cópiala de nuevo desde Neon → Connect." };
  // El cliente postgres envía los parámetros desconocidos al servidor; channel_binding no es uno de ellos.
  url.searchParams.delete("channel_binding");
  return { url: url.toString(), host: url.hostname };
}
