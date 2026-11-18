import { db } from "./db";
import { enviarLista, enviarPedirUbicacion, enviarTexto, type FilaLista } from "./whatsapp";

/**
 * Menú del bot en WhatsApp: las mismas opciones que el chat de la página.
 * Se abre escribiendo «menú», «opciones» o «/», y también con comandos directos (/cotizar, /cancelar…).
 * Como WhatsApp no tiene formularios sin configurar Flows en Meta, «Cotizar» y «Conductor» envían
 * una plantilla de texto que el cliente copia, completa y devuelve; el asistente la lee como un formulario.
 */

type Conv = { id: string; estado: string };
type Resultado = { hecho: true } | { hecho: false; texto: string } | null;

const OPCIONES: (FilaLista & { cmd: string })[] = [
  { cmd: "cotizar", id: "cmd:cotizar", titulo: "🚗 Cotizar o reservar", descripcion: "Fechas, personas y lugar en un solo mensaje" },
  { cmd: "conductor", id: "cmd:conductor", titulo: "🚕 Pedir un conductor", descripcion: "Te llevamos a donde vayas" },
  { cmd: "reservas", id: "cmd:reservas", titulo: "📋 Mis reservas", descripcion: "Consulta el estado de tus reservas" },
  { cmd: "cancelar", id: "cmd:cancelar", titulo: "❌ Cancelar una reserva", descripcion: "Si ya no la necesitas o te equivocaste" },
  { cmd: "ubicacion", id: "cmd:ubicacion", titulo: "📍 Enviar mi ubicación", descripcion: "Para la entrega o la recogida" },
  { cmd: "asesor", id: "cmd:asesor", titulo: "🙋 Hablar con un asesor", descripcion: "Te atiende una persona" },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ALIAS: Record<string, string> = {
  cotizar: "cotizar", reservar: "cotizar", cotizacion: "cotizar", conductor: "conductor", chofer: "conductor",
  reservas: "reservas", "mis reservas": "reservas", mireserva: "reservas", cancelar: "cancelar", ubicacion: "ubicacion",
  asesor: "asesor", humano: "asesor", menu: "menu", opciones: "menu", ayuda: "menu",
};

/** Qué comando pidió el cliente: por la lista («cmd:…»), con barra («/cancelar») o escribiendo «menú». */
export function comandoDe(texto: string | undefined, idLista?: string): string | null {
  if (idLista?.startsWith("cmd:")) return idLista.slice(4);
  if (!texto) return null;
  const t = sinTildes(texto);
  if (t === "/" || t === "menu" || t === "opciones" || t === "ver opciones") return "menu";
  const m = t.match(/^\/\s*([a-z ]+)$/);
  if (!m) return null;
  const k = m[1].trim();
  // Exacto («/cancelar») o el comienzo («/canc»); si no se reconoce, se muestra el menú.
  const parcial = k.length >= 3 ? Object.keys(ALIAS).find((a) => a.startsWith(k)) : undefined;
  return ALIAS[k] ?? ALIAS[k.replace(/\s+/g, "")] ?? (parcial ? ALIAS[parcial] : "menu");
}

const FORM_COTIZAR = `Para qué:
Personas:
Recogida (fecha y hora):
Devolución (fecha y hora):
Lugar (aeropuerto, terminal o domicilio):
Comentarios: `;

const FORM_CONDUCTOR = `Recoger en:
Destino:
Fecha y hora:
Pasajeros:
Solo ida o ida y vuelta:
Detalles: `;

/** Guarda lo que el bot envió fuera del asistente, para el panel y para que la IA sepa qué se le mostró. */
async function registrar(conv: Conv, cliente: string, enviado: string) {
  const sql = db();
  await sql`insert into mensajes (conversacion_id, emisor, texto) values (${conv.id}, 'cliente', ${cliente})`;
  await sql`insert into mensajes (conversacion_id, emisor, texto) values (${conv.id}, 'ia', ${enviado})`;
  const item = [{ role: "user", content: [{ type: "text", text: cliente }] }, { role: "assistant", content: [{ type: "text", text: enviado }] }];
  await sql`update conversaciones set historial_api = historial_api || ${sql.json(item as never)}::jsonb, ultima_actividad = now() where id = ${conv.id}`;
}

export async function enviarMenu(para: string, saludo = "¿En qué te ayudo? Elige una opción 👇") {
  await enviarLista(para, `${saludo}\n\nTambién puedes escribir tu mensaje normal, o un comando como */cotizar* o */cancelar*. Escribe *menú* cuando quieras volver a ver esto.`, "Ver opciones", OPCIONES);
}

/**
 * Ejecuta un comando. Devuelve:
 * - { hecho: true } si ya se respondió aquí;
 * - { hecho: false, texto } para que el asistente atienda ese texto;
 * - null si no es un comando.
 */
export async function ejecutarComandoWa(conv: Conv, para: string, cmd: string, original: string): Promise<Resultado> {
  // Con un asesor atendiendo, los comandos se dejan pasar como mensaje normal.
  if (conv.estado === "humano") return null;
  switch (cmd) {
    case "menu":
      await enviarMenu(para);
      await registrar(conv, original, "[Menú de opciones enviado]");
      return { hecho: true };
    case "cotizar": {
      const intro = "🚗 *Cotizar un vehículo*\nCopia el siguiente mensaje, complétalo y envíamelo. Con eso te muestro de una vez los carros disponibles y el precio 👇";
      await enviarTexto(para, intro);
      await enviarTexto(para, `🚗 Quiero cotizar un vehículo\n${FORM_COTIZAR}`);
      await registrar(conv, original, `${intro}\n\n🚗 Quiero cotizar un vehículo\n${FORM_COTIZAR}`);
      return { hecho: true };
    }
    case "conductor": {
      const intro = "🚕 *Servicio con conductor*\nCopia el siguiente mensaje, complétalo y envíamelo. Si te recogemos donde estás, después tócame el botón de ubicación 📍";
      await enviarTexto(para, intro);
      await enviarTexto(para, `🚕 Quiero un servicio con conductor\n${FORM_CONDUCTOR}`);
      await registrar(conv, original, `${intro}\n\n🚕 Quiero un servicio con conductor\n${FORM_CONDUCTOR}`);
      return { hecho: true };
    }
    case "ubicacion": {
      const texto = "📍 Toca *Enviar ubicación* y elige tu ubicación actual o busca el punto en el mapa. Si el punto no queda exacto, escríbeme también la dirección con el número (ej.: Carrera 24 # 3-45).";
      try { await enviarPedirUbicacion(para, texto); }
      catch { await enviarTexto(para, "📍 Toca el clip 📎 (o el +), elige *Ubicación* y luego *Enviar tu ubicación actual*. También puedes escribirme la dirección con el número (ej.: Carrera 24 # 3-45)."); }
      await registrar(conv, original, texto);
      return { hecho: true };
    }
    case "reservas": return { hecho: false, texto: "Quiero ver mis reservas" };
    case "cancelar": return { hecho: false, texto: "Quiero cancelar una reserva" };
    case "asesor": return { hecho: false, texto: "Quiero hablar con un asesor" };
  }
  return null;
}
