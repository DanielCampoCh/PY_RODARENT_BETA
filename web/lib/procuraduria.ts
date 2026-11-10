/**
 * Lectura del resultado de la consulta de antecedentes de la Procuraduría General de la Nación.
 *
 * La consulta la hace una persona del equipo en la página oficial (responde ella misma la pregunta
 * de verificación del sitio). Aquí solo se interpreta el texto que pega o el del certificado PDF.
 */

export const URL_PROCURADURIA = "https://apps.procuraduria.gov.co/webcert/inicio.aspx";

export type EstadoAntecedentes = "limpio" | "con_antecedentes" | "no_encontrado" | "revisar";

export type LecturaCertificado = {
  nombre_completo: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  documento: string;
  estado: EstadoAntecedentes;
  coincide_documento: boolean;
  coincide_nombre: boolean | null;
  fecha_consulta: string;
  detalle: string;
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Separa un nombre colombiano en nombres y apellidos, uniendo conectores (DE, DEL, LA…). */
export function separarNombre(nombre: string) {
  const texto = nombre.replace(/\s+/g, " ").trim();
  const vacio = { nombre_completo: texto, primer_nombre: "", segundo_nombre: "", primer_apellido: "", segundo_apellido: "" };
  if (!texto) return vacio;
  const conectores = new Set(["DE", "DEL", "LA", "LAS", "LOS", "SAN", "SANTA", "VON", "VAN", "DI"]);
  const tokens = texto.split(" ");
  const t: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let parte = tokens[i];
    while (conectores.has(sinTildes(tokens[i])) && i + 1 < tokens.length) { i++; parte += " " + tokens[i]; }
    t.push(parte);
  }
  if (t.length === 1) return { ...vacio, primer_nombre: t[0] };
  if (t.length === 2) return { ...vacio, primer_nombre: t[0], primer_apellido: t[1] };
  if (t.length === 3) return { ...vacio, primer_nombre: t[0], primer_apellido: t[1], segundo_apellido: t[2] };
  return { ...vacio, primer_nombre: t[0], segundo_nombre: t.slice(1, -2).join(" "), primer_apellido: t[t.length - 2], segundo_apellido: t[t.length - 1] };
}

/** Separa un nombre sin espacios ("DANIELCAMPOCHAGUENDO") con las palabras del nombre registrado ("Daniel Campo"). */
export function separarPegado(pegado: string, registrado: string) {
  const up = sinTildes(pegado.normalize("NFC"));
  if (up.length !== pegado.normalize("NFC").length) return pegado;
  const palabras = [...new Set(sinTildes(registrado).split(/\s+/).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let pos = 0, suelto = "", usadas = 0;
  while (pos < up.length) {
    const w = palabras.find((p) => up.startsWith(p, pos));
    if (w) {
      if (suelto) { out.push(suelto); suelto = ""; }
      out.push(pegado.slice(pos, pos + w.length)); pos += w.length; usadas++;
    } else { suelto += pegado[pos]; pos++; }
  }
  if (suelto) out.push(suelto);
  return usadas ? out.join(" ") : pegado;
}

/** ¿El nombre registrado coincide con el del certificado? (primer nombre y al menos un apellido). */
export function nombreCoincide(registrado: string, certificado: string) {
  const a = sinTildes(registrado).split(/\s+/).filter((x) => x.length > 1);
  const b = new Set(sinTildes(certificado).split(/\s+/));
  return a.length > 0 && b.has(a[0]) && a.filter((x) => b.has(x)).length >= Math.min(2, a.length);
}

function clasificar(t: string): EstadoAntecedentes {
  // \b evita confundir "ciudada-no presenta" con "no presenta".
  if (/\bno\s+presenta\s+antecedentes|\bno\s+registra\s+sanciones\s+ni\s+inhabilidades/.test(t)) return "limpio";
  if (/\bno\s+se\s+encontr|\bno\s+se\s+encuentra\s+registrad|\bno\s+existe|\bno\s+(est[aá]\s+)?registrad|\bno\s+encontrad/.test(t)) return "no_encontrado";
  if (/(?<!\bno\s)presenta\s+antecedentes|(?<!\bno\s)registra\s+(las\s+siguientes\s+)?(sanciones|inhabilidades|anotaciones)/.test(t)) return "con_antecedentes";
  return "revisar";
}

/**
 * Interpreta el texto copiado de la página de resultados (Ctrl+A, Ctrl+C) o extraído del PDF.
 * documentoEsperado: la cédula que se iba a consultar; nombreRegistrado: el nombre que tenemos guardado.
 */
export function leerCertificado(texto: string, documentoEsperado: string, nombreRegistrado?: string): LecturaCertificado {
  const plano = texto.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const m = plano.match(/se[ñn]or\s*\(a\)\s+([^:\n]{3,120}?)\s+identificad[oa]\s*(?:\(a\))?\s+con\s+[^\n]{0,60}?n[úu]mero\s*:?\s*([\d.,\s]{4,20}\d)/i);
  let nombre = m ? m[1].replace(/\s+/g, " ").trim() : "";
  // La página oficial pinta cada palabra en una etiqueta aparte y al copiarla salen pegadas
  // (ANDRESFELIPECAMPO…): se separan usando el nombre registrado como guía.
  if (nombre && !nombre.includes(" ") && nombre.length >= 8 && nombreRegistrado) nombre = separarPegado(nombre, nombreRegistrado);
  const documento = m ? soloDigitos(m[2]) : "";
  const fecha = plano.match(/fecha\s+de\s+consulta\s*:?\s*([^\n]+?)(?:\s+-\s+hora\s+de\s+consulta\s*:?\s*([\d:]+))?\s*(?:\n|$)/i);
  const t = plano.toLowerCase();
  let estado = clasificar(t);
  if (!m && estado !== "no_encontrado") estado = "revisar";
  const coincide_documento = !!documento && documento === soloDigitos(documentoEsperado);
  const coincide_nombre: boolean | null = nombre && nombreRegistrado && !/^por identificar$/i.test(nombreRegistrado) ? nombreCoincide(nombreRegistrado, nombre) : null;

  const partes: string[] = [];
  if (!m) partes.push("No se encontró el bloque «Señor(a) … identificado(a) con … Número …». Revisa que copiaste la página de resultados completa.");
  else if (!coincide_documento) partes.push(`El certificado es de la cédula ${documento}, no de ${soloDigitos(documentoEsperado)}.`);
  if (coincide_nombre === false) partes.push(`El nombre del certificado (${nombre}) no coincide con el registrado (${nombreRegistrado}).`);
  partes.push({ limpio: "El ciudadano no presenta antecedentes.", con_antecedentes: "El certificado registra antecedentes: revísalo antes de decidir.", no_encontrado: "La Procuraduría no encontró el documento.", revisar: "No se pudo interpretar el resultado: revísalo manualmente." }[estado]);

  return {
    ...separarNombre(nombre),
    documento,
    estado,
    coincide_documento,
    coincide_nombre,
    fecha_consulta: fecha ? `${fecha[1].trim()}${fecha[2] ? ` ${fecha[2]}` : ""}` : "",
    detalle: partes.join(" "),
  };
}
