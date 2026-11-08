import { NextResponse } from "next/server";
import { z } from "zod";
import { ajustes, crearReserva, upsertCliente } from "@/lib/repo";

const Body = z.object({
  vehiculo: z.string().uuid(),
  inicio: z.string().datetime({ offset: true }),
  fin: z.string().datetime({ offset: true }),
  lugar: z.string().min(2).max(120),
  nombre: z.string().trim().min(5).max(120).refine((s) => s.split(/\s+/).length >= 2, "Escribe nombre y apellido."),
  documento: z.string().trim().regex(/^[0-9A-Za-z.\- ]{5,20}$/, "Documento inválido."),
  telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/, "Celular inválido."),
  email: z.string().trim().email("Correo inválido.").max(200),
  nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  licencia: z.string().max(10),
  licenciaVence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().max(500).optional().default(""),
  consentimiento: z.literal(true, { message: "Debes autorizar el tratamiento de datos." }),
  marketing: z.boolean().optional().default(false),
  documentosAdjuntos: z.array(z.string().max(120)).max(5).optional().default([]),
});

/** Solicitud de reserva desde el sitio público. Valida requisitos en el servidor. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" ") }, { status: 400 });
  const d = parsed.data;
  const a = await ajustes();

  const edad = Math.floor((Date.now() - new Date(d.nacimiento).getTime()) / (365.25 * 86400000));
  const errores: string[] = [];
  if (edad < a.edadMinima) errores.push(`La edad mínima para alquilar es ${a.edadMinima} años.`);
  if (a.licenciaVigente && new Date(d.licenciaVence) < new Date(d.fin)) errores.push("La licencia debe estar vigente durante todo el alquiler.");
  if (!a.categorias.includes(d.licencia)) errores.push(`Se requiere licencia ${a.categorias.join(", ")}.`);
  if (!a.lugares.includes(d.lugar)) errores.push("Lugar de recogida no válido.");
  if (errores.length) return NextResponse.json({ error: errores.join(" ") }, { status: 422 });

  const c = await upsertCliente({
    nombre: d.nombre, documento: d.documento, telefono: d.telefono, email: d.email, fechaNacimiento: d.nacimiento,
    licencia: d.licencia, licenciaVence: d.licenciaVence, origen: "web", consentimiento: true, marketing: d.marketing,
  });
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 409 });

  const notas = [d.notas, d.documentosAdjuntos.length ? `Adjuntos declarados: ${d.documentosAdjuntos.join(", ")} (pendientes de carga segura)` : ""].filter(Boolean).join(" · ");
  const r = await crearReserva({ clienteId: c.cliente.id, vehiculoId: d.vehiculo, inicio: d.inicio, fin: d.fin, lugar: d.lugar, origen: "web", notas, actor: "Cliente (web)" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  const res = r.reserva;
  return NextResponse.json({ codigo: res.codigo, inicio: res.inicio, fin: res.fin, total: res.total, expira: res.expira_en, estado: res.estado });
}
