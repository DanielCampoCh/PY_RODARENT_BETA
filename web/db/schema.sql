-- RodaRent · esquema PostgreSQL (Neon, Supabase o cualquier Postgres 14+)
create extension if not exists btree_gist;

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nombre text not null,
  rol text not null check (rol in ('admin', 'operador')),
  password_hash text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists configuracion (
  clave text primary key,
  valor jsonb not null
);

create table if not exists vehiculos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  modelo text not null,
  anio int not null check (anio between 1990 and 2100),
  placa text not null unique,
  tipo text not null check (tipo in ('sedan', 'hatch', 'suv', 'pickup', 'van')),
  capacidad int not null check (capacidad between 1 and 30),
  maletas int not null default 2,
  transmision text not null,
  combustible text not null,
  color text not null default '#3b4a63',
  precio_dia int not null check (precio_dia > 0),
  deposito int not null default 0 check (deposito >= 0),
  estado text not null default 'disponible' check (estado in ('disponible', 'mantenimiento', 'inactivo')),
  destacado text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  documento text unique,
  telefono text,
  email text,
  fecha_nacimiento date,
  licencia_categoria text,
  licencia_vence date,
  origen text not null default 'web' check (origen in ('web', 'whatsapp', 'manual', 'chat')),
  verificacion jsonb not null default '{"identidad":"pendiente","licencia":"pendiente","edad":"pendiente","contacto":"pendiente","deposito":"pendiente"}',
  consentimiento_datos timestamptz,
  consentimiento_marketing boolean not null default false,
  creado_en timestamptz not null default now()
);
create index if not exists clientes_telefono_idx on clientes (telefono);

create sequence if not exists reserva_codigo_seq start 1040;

create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('RR-' || nextval('reserva_codigo_seq')),
  cliente_id uuid not null references clientes (id),
  vehiculo_id uuid not null references vehiculos (id),
  inicio timestamptz not null,
  fin timestamptz not null,
  lugar text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'en_curso', 'finalizada', 'rechazada', 'vencida', 'cancelada')),
  expira_en timestamptz,
  origen text not null check (origen in ('web', 'whatsapp', 'manual', 'chat')),
  precio_dia int not null,
  dias int not null,
  total int not null,
  deposito int not null,
  notas text not null default '',
  nueva boolean not null default true,
  creado_en timestamptz not null default now(),
  check (fin > inicio),
  -- Anti doble reserva: un vehículo no puede tener dos reservas activas que se crucen.
  constraint reservas_sin_cruce exclude using gist (
    vehiculo_id with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado in ('pendiente', 'aprobada', 'en_curso'))
);
create index if not exists reservas_estado_idx on reservas (estado);

create table if not exists reserva_historial (
  id bigserial primary key,
  reserva_id uuid not null references reservas (id) on delete cascade,
  texto text not null,
  actor text not null,
  fecha timestamptz not null default now()
);

create table if not exists conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes (id),
  reserva_id uuid references reservas (id),
  nombre text not null default 'Visitante web',
  telefono text,
  canal text not null default 'web' check (canal in ('web', 'whatsapp')),
  estado text not null default 'ia' check (estado in ('ia', 'humano', 'pendiente', 'cerrada')),
  no_leidos int not null default 0,
  -- Historial exacto enviado a la API de IA (solo se agrega, nunca se edita).
  historial_api jsonb not null default '[]',
  ultima_actividad timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

create table if not exists mensajes (
  id bigserial primary key,
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  emisor text not null check (emisor in ('cliente', 'ia', 'humano', 'sistema')),
  texto text not null,
  fecha timestamptz not null default now()
);
create index if not exists mensajes_conv_idx on mensajes (conversacion_id, id);

-- Mensajes de WhatsApp ya procesados (Meta puede reenviar el mismo aviso).
create table if not exists whatsapp_procesados (
  id text primary key,
  fecha timestamptz not null default now()
);
create unique index if not exists conversaciones_whatsapp_tel on conversaciones (telefono) where canal = 'whatsapp' and estado <> 'cerrada';

create table if not exists auditoria (
  id bigserial primary key,
  actor text not null,
  accion text not null,
  fecha timestamptz not null default now()
);

create table if not exists notificaciones (
  id bigserial primary key,
  texto text not null,
  leida boolean not null default false,
  fecha timestamptz not null default now()
);

-- Libera pre-reservas vencidas y deja traza.
create or replace function expirar_prereservas() returns int language plpgsql as $$
declare n int;
begin
  with v as (
    update reservas set estado = 'vencida', expira_en = null
    where estado = 'pendiente' and expira_en < now()
    returning id, codigo
  ), h as (
    insert into reserva_historial (reserva_id, texto, actor)
    select id, 'Pre-reserva vencida automáticamente', 'Sistema' from v
  )
  insert into auditoria (actor, accion) select 'Sistema', codigo || ' vencida automáticamente' from v;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Flota: datos de la hoja "Registro de vehículos" del negocio ----------
-- modalidad: alquiler (catálogo y reservas), uber (solo control interno y alertas), agencia (catálogo aliado con comisión).
alter table vehiculos add column if not exists modalidad text not null default 'alquiler';
alter table vehiculos drop constraint if exists vehiculos_modalidad_check;
alter table vehiculos add constraint vehiculos_modalidad_check check (modalidad in ('alquiler', 'uber', 'agencia'));
-- Los carros de Uber y los recién importados pueden no tener tarifa (0 = no se ofrecen en el catálogo).
alter table vehiculos drop constraint if exists vehiculos_precio_dia_check;
alter table vehiculos add constraint vehiculos_precio_dia_check check (precio_dia >= 0);
alter table vehiculos add column if not exists codigo text not null default '';
alter table vehiculos add column if not exists color_nombre text not null default '';
alter table vehiculos add column if not exists responsable text not null default '';
alter table vehiculos add column if not exists responsable_tel text not null default '';
alter table vehiculos add column if not exists gps text not null default '';
alter table vehiculos add column if not exists gps_recarga date;
alter table vehiculos add column if not exists soat_vence date;
alter table vehiculos add column if not exists tecno_vence date;
alter table vehiculos add column if not exists seguro_vence date;
alter table vehiculos add column if not exists aseguradora text not null default '';
alter table vehiculos add column if not exists extintor_vence date;
alter table vehiculos add column if not exists impuesto_vence date;
alter table vehiculos add column if not exists km_actual int;
alter table vehiculos add column if not exists km_aceite int;
alter table vehiculos add column if not exists agencia text not null default '';
alter table vehiculos add column if not exists comision_pct numeric(5, 2);
alter table vehiculos add column if not exists notas text not null default '';

-- Alertas de la flota ya avisadas (para no repetir la misma notificación).
create table if not exists alertas_avisadas (
  clave text primary key,
  fecha timestamptz not null default now()
);

-- ---------- Conductores: reciben los servicios por WhatsApp y el primero que pulsa «Tomar servicio» se lo queda ----------
create table if not exists conductores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null unique,
  activo boolean not null default true,
  notas text not null default '',
  creado_en timestamptz not null default now()
);

-- ---------- Servicios de conductor ----------
create sequence if not exists servicio_codigo_seq start 101;
create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('SC-' || nextval('servicio_codigo_seq')),
  conversacion_id uuid references conversaciones (id) on delete set null,
  cliente_id uuid references clientes (id) on delete set null,
  nombre text not null,
  telefono text not null,
  origen text not null,
  destino text not null,
  fecha timestamptz not null,
  pasajeros int not null default 1 check (pasajeros between 1 and 50),
  notas text not null default '',
  estado text not null default 'nuevo' check (estado in ('nuevo', 'tomado', 'completado', 'cancelado')),
  conductor text,
  conductor_tel text,
  tomado_en timestamptz,
  enviados int not null default 0,
  canal text not null default 'chat' check (canal in ('chat', 'whatsapp', 'manual')),
  creado_en timestamptz not null default now()
);
create index if not exists servicios_fecha_idx on servicios (fecha desc);
alter table servicios add column if not exists conductor_tel text;
alter table servicios add column if not exists enviados int not null default 0;

-- ---------- Fotos de los vehículos ----------
-- Fotos subidas desde el panel (datos) o tomadas de la galería del negocio en /public/fotos (url). La de orden menor es la principal.
create table if not exists vehiculo_fotos (
  id bigserial primary key,
  vehiculo_id uuid not null references vehiculos (id) on delete cascade,
  orden int not null default 0,
  url text,
  datos bytea,
  tipo text not null default 'image/jpeg',
  creado_en timestamptz not null default now(),
  check ((url is null) <> (datos is null))
);
create index if not exists vehiculo_fotos_veh_idx on vehiculo_fotos (vehiculo_id, orden);
