import { createHmac, timingSafeEqual } from "node:crypto";

/** Configuración de WhatsApp Business (Cloud API de Meta). */
export function waConfig() {
  // trim(): los paneles de hosting a veces guardan espacios o saltos de línea al pegar.
  const env = (k: string) => process.env[k]?.trim() || undefined;
  const token = env("WHATSAPP_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const appSecret = env("WHATSAPP_APP_SECRET");
  const verifyToken = env("WHATSAPP_VERIFY_TOKEN");
  return {
    activo: !!(token && phoneId && appSecret && verifyToken),
    token, phoneId, appSecret, verifyToken,
    version: env("WHATSAPP_API_VERSION") || "v27.0",
    base: process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com",
  };
}

/** Comprueba que el webhook viene de Meta (firma HMAC-SHA256 con el App Secret). */
export function firmaValida(raw: string, header: string | null) {
  const { appSecret } = waConfig();
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const esperado = Buffer.from("sha256=" + createHmac("sha256", appSecret).update(raw, "utf8").digest("hex"));
  const recibido = Buffer.from(header);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/** WhatsApp usa *negrita* con un asterisco. */
export const formatoWhatsApp = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "*$1*").slice(0, 4000);

/** Número en formato internacional con espacios, a partir del wa_id (solo dígitos). */
export const telDesdeWaId = (waId: string) =>
  waId.startsWith("57") && waId.length === 12 ? `+57 ${waId.slice(2, 5)} ${waId.slice(5, 8)} ${waId.slice(8)}` : `+${waId}`;

export class ErrorWhatsApp extends Error {
  constructor(m: string, public codigo?: number) { super(m); }
}

/** Diagnóstico: comprueba con Meta que el token y el número funcionan (sin enviar mensajes). */
export async function probarConexion() {
  const c = waConfig();
  const tokenInfo = c.token ? { fin: c.token.slice(-4), largo: c.token.length } : null;
  if (!c.token || !c.phoneId) return { ok: false, error: "Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en el servidor.", tokenInfo, phoneId: c.phoneId ?? null };
  const res = await fetch(`${c.base}/${c.version}/${c.phoneId}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${c.token}` } });
  const j = (await res.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string; error?: { message?: string; code?: number } } | null;
  if (!res.ok) return { ok: false, error: `Meta rechazó el token${j?.error?.code ? ` (código ${j.error.code})` : ""}: ${j?.error?.message ?? res.statusText}`, tokenInfo, phoneId: c.phoneId };
  return { ok: true, numero: j?.display_phone_number, nombre: j?.verified_name, tokenInfo, phoneId: c.phoneId };
}

/** Envía un mensaje de texto. Lanza ErrorWhatsApp si Meta lo rechaza. */
export async function enviarTexto(para: string, texto: string) {
  const c = waConfig();
  if (!c.token || !c.phoneId) throw new ErrorWhatsApp("WhatsApp no está configurado en el servidor.");
  const res = await fetch(`${c.base}/${c.version}/${c.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para.replace(/\D/g, ""), type: "text", text: { preview_url: false, body: formatoWhatsApp(texto) } }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    const codigo = j?.error?.code;
    const msg = codigo === 190
      ? "El token de WhatsApp venció o no es válido (código 190). Genera uno nuevo en Meta y actualiza WHATSAPP_TOKEN en el servidor."
      : codigo === 131047
      ? "Pasaron más de 24 horas desde el último mensaje del cliente; WhatsApp solo permite escribirle con una plantilla aprobada."
      : codigo === 131030
        ? "Ese número no está en la lista de destinatarios permitidos del número de prueba de Meta."
        : `WhatsApp rechazó el mensaje${codigo ? ` (código ${codigo})` : ""}: ${j?.error?.message ?? res.statusText}`;
    throw new ErrorWhatsApp(msg, codigo);
  }
}
