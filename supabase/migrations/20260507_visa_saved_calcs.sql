-- Tabel untuk menyimpan hitungan kalkulator visa per user
create table if not exists public.visa_saved_calcs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  visa_type   text not null check (visa_type in ('voa', 'student')),
  state       jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists visa_saved_calcs_agency_idx on public.visa_saved_calcs(agency_id);
create index if not exists visa_saved_calcs_user_idx   on public.visa_saved_calcs(user_id);

-- RLS
alter table public.visa_saved_calcs enable row level security;

create policy "Users can view own saved calcs"
  on public.visa_saved_calcs for select
  using (user_id = auth.uid());

create policy "Users can insert own saved calcs"
  on public.visa_saved_calcs for insert
  with check (user_id = auth.uid());

create policy "Users can delete own saved calcs"
  on public.visa_saved_calcs for delete
  using (user_id = auth.uid());
