-- Contrato front office ↔ motor ↔ backoffice (docs/2026-10-09-contrato-backoffice.md, §2 y §4)
-- Capa de operación financiera: el hecho económico, separado de la transferencia onchain.
-- v1: no se crea ninguna operación por defecto (matching 1:1 movimiento ↔ factura en F3).
-- La agrupación explícita de N movimientos llega en v2 desde la excepción `unsupported_partial`.

-- ---------- audit: quién emite el evento ----------
alter table public.audit_events
  add column actor_kind text not null default 'user'
  check (actor_kind in ('user', 'system', 'internal'));
comment on column public.audit_events.actor_kind is
  'user = miembro de la organización; system = motor (actor_id null); internal = usuario interno de Web3Rails';

-- ---------- financial_operations ----------
create table public.financial_operations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  kind text not null check (kind in ('payment_in', 'payment_out', 'internal_transfer', 'fee', 'refund', 'treasury', 'other')),
  status text not null default 'open' check (status in ('open', 'settled', 'void')),
  counterparty_name text,
  reference text,
  note text,
  version int not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger financial_operations_updated_at before update on public.financial_operations
  for each row execute function public.set_updated_at();
create index financial_operations_org_idx on public.financial_operations(org_id, created_at desc);
comment on table public.financial_operations is
  'Hecho económico (cobro, pago, transferencia interna). Puede componerse de varios movimientos. Nunca se borra: se anula con status=void y motivo.';

-- ---------- operation_movements ----------
create table public.operation_movements (
  operation_id uuid not null references public.financial_operations(id) on delete restrict,
  movement_id uuid not null references public.movements(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (operation_id, movement_id),
  -- Un movimiento pertenece como mucho a una operación.
  unique (movement_id)
);
create index operation_movements_org_idx on public.operation_movements(org_id);

-- Una operación no mezcla organizaciones.
create or replace function public.check_operation_movement_org()
returns trigger language plpgsql as $$
declare v_op_org uuid; v_mv_org uuid;
begin
  select org_id into v_op_org from public.financial_operations where id = new.operation_id;
  select org_id into v_mv_org from public.movements where id = new.movement_id;
  if v_op_org is null or v_mv_org is null or v_op_org <> new.org_id or v_mv_org <> new.org_id then
    raise exception 'INVALID: operation, movement and link must belong to the same organization';
  end if;
  return new;
end $$;
create trigger operation_movements_same_org before insert or update on public.operation_movements
  for each row execute function public.check_operation_movement_org();

-- ---------- RLS: lectura por organización; escritura solo por funciones (F3 / v2) ----------
alter table public.financial_operations enable row level security;
alter table public.operation_movements enable row level security;
create policy "members read operations" on public.financial_operations for select using (public.is_member(org_id));
create policy "members read operation links" on public.operation_movements for select using (public.is_member(org_id));
