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

-- Verificación con fuentes oficiales (Verifik): autorización aparte y traza de cada consulta.
alter table clientes add column if not exists consentimiento_antecedentes timestamptz;
create table if not exists verificaciones_externas (
  id bigserial primary key,
  cliente_id uuid not null references clientes (id) on delete cascade,
  fuente text not null,
  resultado text not null check (resultado in ('ok', 'hallazgo', 'no_encontrado', 'error', 'no_aplica')),
  detalle text not null,
  referencia text,
  actor text not null,
  fecha timestamptz not null default now()
);
create index if not exists verificaciones_cliente_idx on verificaciones_externas (cliente_id, fecha desc);

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
