import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verificarCliente, verifikActivo } from "@/lib/verifik";
import { z } from "zod";
import { ajustes, clientePorDocYTel, crearReserva, upsertCliente } from "@/lib/repo";
import { excedeLimite, ipDe } from "@/lib/limite";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  habitual: z.boolean().optional().default(false),
  vehiculo: z.string().uuid(),
  inicio: z.string().datetime({ offset: true }),
  fin: z.string().datetime({ offset: true }),
  lugar: z.string().min(2).max(120),
  documento: z.string().trim().regex(/^[0-9A-Za-z.\- ]{5,20}$/, "Documento inválido."),
  telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, "Celular inválido."),
  // Obligatorios para clientes nuevos; para habituales solo si faltan en la base.
  nombre: z.string().trim().min(5).max(120).refine((s) => s.split(/\s+/).length >= 2, "Escribe nombre y apellido.").optional(),
  email: z.string().trim().email("Correo inválido.").max(200).optional(),
  nacimiento: fecha.optional(),
  licencia: z.string().max(10).optional(),
  licenciaVence: fecha.optional(),
  notas: z.string().max(500).optional().default(""),
  consentimiento: z.literal(true, { message: "Debes autorizar el tratamiento de datos." }),
  marketing: z.boolean().optional().default(false),
  // Autorización aparte para consultar licencia (RUNT) y antecedentes (Policía, Procuraduría).
  verificar: z.boolean().optional().default(false),
});

/** Solicitud de reserva desde el sitio público. Valida requisitos en el servidor. */
export async function POST(req: Request) {
  if (excedeLimite("reservas:" + ipDe(req), 10, 10 * 60000)) return NextResponse.json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" ") }, { status: 400 });
  const d = parsed.data;
  const a = await ajustes();

  // Cliente habitual: completa con lo que ya tenemos guardado.
  let datos = { nombre: d.nombre, email: d.email, nacimiento: d.nacimiento, licencia: d.licencia, licenciaVence: d.licenciaVence };
  if (d.habitual) {
    const c = await clientePorDocYTel(d.documento, d.telefono);
    if (!c) return NextResponse.json({ error: "No encontramos un cliente con ese documento y celular. Revisa los datos o continúa como cliente nuevo." }, { status: 404 });
    const iso = (x: unknown) => (x ? new Date(x as string).toISOString().slice(0, 10) : undefined);
    datos = {
      nombre: c.nombre,
      email: d.email ?? c.email ?? undefined,
      nacimiento: d.nacimiento ?? iso(c.fecha_nacimiento),
      licencia: d.licencia ?? c.licencia_categoria ?? undefined,
      licenciaVence: d.licenciaVence ?? iso(c.licencia_vence),
    };
  }
  const faltan = Object.entries({ nombre: "nombre completo", email: "correo", nacimiento: "fecha de nacimiento", licencia: "categoría de licencia", licenciaVence: "vencimiento de la licencia" })
    .filter(([k]) => !datos[k as keyof typeof datos]).map(([, l]) => l);
  if (faltan.length) return NextResponse.json({ error: `Falta: ${faltan.join(", ")}.`, faltan }, { status: 400 });

  const edad = Math.floor((Date.now() - new Date(datos.nacimiento!).getTime()) / (365.25 * 86400000));
  const errores: string[] = [];
  if (edad < a.edadMinima) errores.push(`La edad mínima para alquilar es ${a.edadMinima} años.`);
  if (a.licenciaVigente && new Date(datos.licenciaVence!) < new Date(d.fin)) errores.push("La licencia debe estar vigente durante todo el alquiler. Si ya la renovaste, escribe la nueva fecha de vencimiento.");
  if (!a.categorias.includes(datos.licencia!)) errores.push(`Se requiere licencia ${a.categorias.join(", ")}.`);
  if (!a.lugares.includes(d.lugar)) errores.push("Lugar de recogida no válido.");
  if (errores.length) return NextResponse.json({ error: errores.join(" ") }, { status: 422 });

  const c = await upsertCliente({
    nombre: datos.nombre!, documento: d.documento, telefono: d.telefono, email: datos.email, fechaNacimiento: datos.nacimiento,
    licencia: datos.licencia, licenciaVence: datos.licenciaVence, origen: "web", consentimiento: true, marketing: d.marketing,
  });
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 409 });

  const r = await crearReserva({ clienteId: c.cliente.id, vehiculoId: d.vehiculo, inicio: d.inicio, fin: d.fin, lugar: d.lugar, origen: "web", notas: [d.notas, c.alerta].filter(Boolean).join(" · "), actor: d.habitual ? "Cliente habitual (web)" : "Cliente (web)" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  const res = r.reserva;
  if (d.verificar && verifikActivo()) {
    await db()`update clientes set consentimiento_antecedentes = coalesce(consentimiento_antecedentes, now()) where id = ${c.cliente.id}`;
    const clienteId = c.cliente.id as string, fin = new Date(res.fin).toISOString();
    after(async () => { try { await verificarCliente(clienteId, "Verificación automática (web)", fin); } catch (e) { console.error("[verifik]", e instanceof Error ? e.message : e); } });
  }
  return NextResponse.json({ codigo: res.codigo, inicio: res.inicio, fin: res.fin, total: res.total, expira: res.expira_en, estado: res.estado, // Con celular distinto no se revela el nombre registrado: se usa el que escribió quien reserva.
    nombre: String(c.alerta ? datos.nombre : c.cliente.nombre).split(" ")[0] });
}
