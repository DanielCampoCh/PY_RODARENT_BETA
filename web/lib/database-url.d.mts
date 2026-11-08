export function limpiarDatabaseUrl(raw: string | undefined): { url: string; host: string; error?: undefined } | { error: string; url?: undefined; host?: undefined };
