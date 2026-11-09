import { NextResponse } from "next/server";
import { z } from "zod";
import { clientePorDocYTel, perfilCliente } from "@/lib/repo";
import { excedeLimite, ipDe } from "@/lib/limite";

const Body = z.object({
  documento: z.string().trim().regex(/^[0-9A-Za-z.\- ]{5,20}$/),
  telefono: z.string().trim().regex(/^\+?[0-9 ]{10,16}$/),
  fin: z.string().datetime({ offset: true }).optional(),
});

/**
 * Cliente habitual: con documento + celular devuelve solo el primer nombre y qué datos faltan.
 * No devuelve documento, correo ni fechas, para no exponer datos si alguien adivina un documento.
 */
export async function POST(req: Request) {
  if (excedeLimite("identificar:" + ipDe(req), 8, 10 * 60000)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos o continúa como cliente nuevo." }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe un documento y un celular válidos." }, { status: 400 });
  const c = await clientePorDocYTel(parsed.data.documento, parsed.data.telefono);
  if (!c) return NextResponse.json({ encontrado: false });
  const p = await perfilCliente(c, parsed.data.fin);
  return NextResponse.json({ encontrado: true, primerNombre: p.primerNombre, habitual: p.habitual, faltan: p.faltan });
}
