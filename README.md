# RodaRent

Aplicación web para gestionar alquiler de vehículos y servicios de transporte con conductor. Incluye catálogo público, solicitudes de reserva, asistente de IA, panel administrativo e integración opcional con WhatsApp Business.

## Funcionalidades actuales

- **Sitio público (`/`)**: catálogo de vehículos disponibles, consulta de disponibilidad, solicitudes de pre-reserva, chat con el asistente y aviso de privacidad.
- **Panel (`/admin`)**: inicio de sesión para administrador y operador; gestión de reservas, calendario, vehículos, clientes, conversaciones, conductores, servicios y ajustes.
- **Reservas**: las solicitudes quedan pendientes para revisión humana y vencen según el plazo configurado (24 horas por defecto). El asistente no aprueba reservas. La base de datos impide reservas activas que se crucen para el mismo vehículo.
- **Revisión de clientes**: los requisitos del cliente se revisan manualmente desde el panel. No hay integración automática con Verifik, RUNT u otras fuentes externas.
- **Asistente**: usa Claude para responder preguntas, consultar disponibilidad y registrar solicitudes. Si no se configura `ANTHROPIC_API_KEY`, el chat ofrece el formulario de reserva.
- **WhatsApp Business** (opcional): recibe mensajes, responde con el asistente y guarda las conversaciones. También permite enviar solicitudes a los conductores registrados; el primero que toma el servicio queda asignado.
- **Alertas de flota**: el panel muestra alertas de vencimientos, mantenimiento y pico y placa para vehículos en modalidad Uber. Se pueden enviar por WhatsApp si la integración está configurada.
- **Permisos y actividad**: administrador y operador tienen permisos distintos; las acciones administrativas quedan registradas.

La aplicación está en `web/`; el esquema de PostgreSQL, scripts y variables de entorno están en esa carpeta. `prototipo/` contiene un prototipo estático anterior.

## Desarrollo local

Requiere Node.js 22 y npm.

```bash
cd web
npm install
```

Copia `.env.example` como `.env.local` y configura, al menos, una `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. La clave del administrador debe tener mínimo 8 caracteres. Para la base local incluida (PGlite), agrega a `.env.local`:

```dotenv
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/postgres
DB_POOL_MAX=1
```

Inicia la base de datos en una terminal y déjala abierta:

```bash
npm run db:local
```

En otra terminal, desde `web/`, crea el esquema y el usuario administrador, y luego inicia la aplicación:

```bash
npm run db:setup
npm run dev
```

Abre <http://localhost:3000> y <http://localhost:3000/admin>. `db:setup` carga datos de ejemplo si la base está vacía. Para probar el asistente configura también `ANTHROPIC_API_KEY`.

Comandos útiles desde `web/`:

| Comando | Uso |
|---|---|
| `npm run typecheck` | Comprueba los tipos de TypeScript |
| `npm run build` | Compila la aplicación |
| `npm run secreto` | Genera un valor aleatorio para `SESSION_SECRET` |
| `npm run db:setup` | Crea o actualiza el esquema, datos iniciales y usuarios configurados |
| `npm run db:local` | Inicia PostgreSQL local con PGlite |

## Variables de entorno

Consulta [`web/.env.example`](web/.env.example) para la lista completa. Las principales son:

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `SESSION_SECRET` | Sí | Secreto para firmar las sesiones del panel; usa una cadena aleatoria |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Sí para crear el administrador | Credenciales del panel |
| `OPERADOR_EMAIL`, `OPERADOR_PASSWORD` | Opcional | Segundo usuario con permisos limitados |
| `ANTHROPIC_API_KEY` | Opcional | Habilita las respuestas del asistente con Claude |
| `CLAUDE_MODEL` | Opcional | Modelo de Claude; por defecto `claude-haiku-5-5` |
| `NEGOCIO_NOMBRE`, `NEGOCIO_CIUDAD`, `NEGOCIO_WHATSAPP` | Recomendadas | Información del negocio |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Opcional | Credenciales y verificación del webhook de Meta |
| `CRON_SECRET` | Opcional | Protege la ruta de revisión diaria de alertas |

No subas `.env.local` ni credenciales al repositorio. En producción, configura las variables en el panel de la plataforma.

### WhatsApp Business

Configura las variables `WHATSAPP_*` anteriores en Meta y en el servicio de alojamiento. La URL del webhook es:

```text
https://TU-DOMINIO/api/whatsapp
```

El webhook valida la firma de Meta y evita procesar dos veces el mismo mensaje. Los mensajes de texto se procesan con el asistente; fotos, audios y documentos no se leen automáticamente y requieren revisión de un asesor. Para enviar mensajes a conductores fuera de la ventana permitida por Meta, se necesitan plantillas aprobadas. Los conductores deben estar registrados y activos en el panel.

### Alertas programadas

El panel revisa las alertas al abrirse. Para hacer una revisión diaria externa, configura `CRON_SECRET` y llama a `GET /api/cron/alertas` con la cabecera `Authorization: Bearer <CRON_SECRET>`.

## Despliegue

La aplicación debe desplegarse usando `web/` como directorio raíz y una base de datos PostgreSQL accesible desde el servicio.

### Render

El archivo [`render.yaml`](render.yaml) configura el servicio con `web/` como raíz y ejecuta la preparación de la base de datos antes de compilar. En Render, crea un Blueprint desde este repositorio y proporciona la conexión PostgreSQL y las credenciales del administrador cuando te las solicite. `SESSION_SECRET` y `CRON_SECRET` se generan desde el Blueprint. Configura las variables `WHATSAPP_*` manualmente si vas a habilitar WhatsApp.

### Vercel

Importa el repositorio en Vercel y selecciona `web/` como **Root Directory**. Conecta una base PostgreSQL y configura las variables requeridas de la sección anterior. El script `vercel-build` prepara el esquema, carga datos de ejemplo si la base está vacía y crea o actualiza los usuarios configurados antes de compilar.

## Funciones que aún requieren trabajo o configuración externa

- WhatsApp requiere una cuenta de Meta, un número configurado y, para ciertos envíos, plantillas aprobadas.
- Las fotos, audios y documentos enviados por WhatsApp no se procesan automáticamente.
- No están integrados la carga privada de documentos, las notificaciones por correo ni Google Calendar.
- La revisión de documentos y requisitos de clientes es manual.
