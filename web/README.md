# RodaRent · aplicación funcional (Etapa 4–5)

Sitio público + panel administrativo + asistente de IA, con base de datos real.

| Parte | Qué hace |
|---|---|
| `/` | Catálogo con disponibilidad real, formulario de reserva y chat con el asistente de IA |
| `/admin` | Panel con inicio de sesión (administrador / operador): reservas, calendario, vehículos, clientes, conversaciones, ajustes |
| `app/api/*` | API en el servidor: valida todo, aplica permisos y guarda en PostgreSQL |
| `lib/agent.ts` | Agente de IA (Claude) con herramientas: buscar disponibilidad, ver flota, identificar cliente, crear solicitud, pasar a un asesor |
| `db/schema.sql` | Tablas. La base **impide** dos reservas activas del mismo vehículo en fechas que se cruzan |

## Reglas que cumple el sistema

- Las solicitudes (web, chat o manuales sin verificar) quedan como **pre-reserva pendiente** y vencen solas (24 h por defecto, configurable).
- Solo el **administrador** aprueba, y solo si los 5 requisitos del cliente están **verificados** a mano. La IA nunca aprueba.
- El asistente solo muestra reservas de un cliente si da **documento y celular** que coinciden. Si un documento ya existe con otro celular, no se modifica y pasa a un asesor.
- El asistente pide **autorización de datos** antes de registrar, y transfiere a un asesor si piden descuento, hay quejas o condiciones especiales.
- El operador ve los documentos **enmascarados** y no puede aprobar, verificar, editar flota ni ajustes.
- Toda acción del panel queda en el **registro de actividad**.

## Probar en tu computador

```bash
cd web
npm install
```

Copia `.env.example` como `.env.local` y llena las variables. Para una base local sin instalar nada:

```bash
npm run db:local
```

(en otra terminal, con `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` y `DB_POOL_MAX=1` en `.env.local`)

```bash
npm run db:setup
```

```bash
npm run dev
```

Abre http://localhost:3000 y http://localhost:3000/admin (entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Publicar en Render (plan gratuito)

El archivo `render.yaml` (en la raíz del repositorio) configura todo: carpeta `web`, compilación, creación de tablas y usuarios, y una `SESSION_SECRET` aleatoria.

1. **Base de datos.** En https://neon.tech crea una cuenta y un proyecto (plan Free, región *AWS US East*). En *Connect* copia la cadena de conexión **pooled**.
2. **Render.** En https://render.com entra con GitHub → *New* → **Blueprint** → elige el repositorio. Render lee `render.yaml` y te pide los valores:
   `DATABASE_URL` (la de Neon), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ caracteres), `ADMIN_NOMBRE`, `ANTHROPIC_API_KEY`, `NEGOCIO_WHATSAPP`.
3. **Apply.** Render compila y publica en una dirección `…onrender.com`.

En el plan gratuito el servicio se duerme tras unos minutos sin visitas y la primera visita tarda cerca de un minuto en despertarlo: ábrelo un rato antes de cada demostración.

## Publicar en Vercel (plan gratuito)

Cada vez que Vercel publica, el script `vercel-build` crea las tablas que falten, carga los datos de ejemplo si la base está vacía y crea o actualiza los usuarios del panel con las variables `ADMIN_*` y `OPERADOR_*`. No hay que ejecutar nada en tu computador.

1. **Proyecto.** En vercel.com → *Add New → Project* → importa el repositorio. En **Root Directory** elige `web`. Antes de *Deploy*, abre *Environment Variables*.
2. **Variables** (los valores son tuyos; nunca los subas al repositorio):

   | Variable | Valor |
   |---|---|
   | `SESSION_SECRET` | 64 caracteres aleatorios (genera uno con `npm run secreto`) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NOMBRE` | Tu usuario del panel (clave de 8+ caracteres) |
   | `OPERADOR_EMAIL` / `OPERADOR_PASSWORD` / `OPERADOR_NOMBRE` | Opcional: segundo usuario con permisos limitados |
   | `ANTHROPIC_API_KEY` | Tu clave de https://console.anthropic.com |
   | `CLAUDE_MODEL` | `claude-haiku-5-5` |
   | `NEGOCIO_NOMBRE` / `NEGOCIO_CIUDAD` / `NEGOCIO_WHATSAPP` | Datos del negocio |

   No pongas `DB_POOL_MAX` (solo es para la base local).
3. **Base de datos.** En el proyecto → *Storage* → *Create Database* → **Neon** (plan Free) → conéctala al proyecto. Vercel agrega `DATABASE_URL` sola.
4. **Publicar.** *Deployments* → *Redeploy* (para que tome la base). Al terminar, abre la URL `…vercel.app`, prueba el chat y entra a `/admin`.

Si la compilación falla con "Falta DATABASE_URL", la base aún no está conectada al proyecto (paso 3).

### Costos de referencia
- Vercel Hobby y Neon Free: 0 USD. Sirven para la demostración; si el negocio lo usa en el día a día, Vercel pide el plan Pro (uso comercial).
- IA con `claude-haiku-5-5`: 0,10 USD por millón de tokens de entrada y 0,50 por millón de salida; una conversación de reserva típica cuesta una fracción de centavo. Anthropic pide cargar un saldo mínimo para activar la clave.

## Pendiente para las siguientes etapas
- **WhatsApp Business (Cloud API):** el agente ya está listo; falta el webhook y la cuenta verificada de Meta.
- **Carga segura de documentos** (cédula y licencia) con almacenamiento privado.
- **Notificaciones** por correo/WhatsApp y **Google Calendar**.
- Límite de mensajes por IP más robusto (hoy es en memoria por instancia).
- Revisión legal del texto de tratamiento de datos.
