# Prototipo visual · RodaRent (Etapa 3)

Prototipo navegable para validar con el propietario y mostrar a clientes potenciales.
**Todo es demostrativo**: datos ficticios guardados en el navegador (localStorage). No hay servidor, base de datos, WhatsApp, IA ni Google Calendar conectados, y la interfaz lo indica.

## Cómo abrirlo

```bash
node prototipo/servidor.mjs
```

Luego abre http://localhost:5173 (sitio público) y http://localhost:5173/admin.html (panel).
También funciona abriendo `index.html` directamente con doble clic.

## Guion sugerido para la demo (5 minutos)

1. **Sitio público** → elegir fechas → "Ver disponibilidad". Mostrar que los vehículos ocupados aparecen bloqueados (anti doble reserva).
2. **Chat (botón verde)** → Turismo → 1 a 4 → Próxima semana → elegir vehículo → Continuar → nombre → cédula → "Sí, autorizo". Se crea una solicitud con pre-reserva de 24 h.
3. Abrir el **panel** (rol Administrador) → la solicitud aparece en *Resumen* con punto azul de "nueva".
4. Abrir la solicitud → intentar **Aprobar**: está bloqueado hasta verificar requisitos (la IA nunca aprueba). Marcar requisitos como *Verificado* → Aprobar.
5. **Calendario** semanal: la reserva aparece en la fila del vehículo. Clic en una celda vacía = reserva manual.
6. **Conversaciones**: abrir "Andrea Torres" (transferida por negociar precio) → *Tomar conversación* → responder como asesor.
7. Salir y entrar como **Operador**: no puede aprobar, ver documentos completos ni cambiar tarifas.
8. *Ajustes*: requisitos configurables, vencimiento de pre-reservas, estado honesto de integraciones y registro de auditoría.

"Reiniciar datos demo" (menú lateral) restaura los datos de ejemplo.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` + `assets/public.js` | Sitio público, cotizador, formulario de reserva y asistente simulado |
| `admin.html` + `assets/admin.js` | Panel: resumen, reservas, calendario, vehículos, clientes, conversaciones, ajustes |
| `assets/data.js` | Datos ficticios, reglas (disponibilidad, vencimiento, verificación) e ilustraciones SVG |
| `assets/styles.css` | Sistema de diseño compartido |

En la Etapa 4 estas pantallas se migran a Next.js + Supabase conservando el diseño y las reglas de negocio.
