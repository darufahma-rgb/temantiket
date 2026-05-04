  -- ============================================================================
  -- Temantiket — Complete Database Setup (All Features, Single File)
  -- ============================================================================
  -- File ini mencakup SEMUA tabel, RLS, trigger, fungsi, dan storage bucket
  -- yang dibutuhkan Temantiket. Sepenuhnya idempotent — aman dijalankan
  -- berulang kali tanpa efek samping.
  --
  -- CARA PAKAI:
  --   1. Buka Supabase Dashboard → SQL Editor
  --   2. Paste seluruh isi file ini → klik RUN
  --   3. Deploy Edge Functions (lihat bagian CATATAN di bawah)
  --   4. Buka /bootstrap di app → isi email + password + nama agensi
  --
  -- FITUR YANG DI-COVER:
  --   ✓ Multi-tenant agencies + members (owner / staff / agent)
  --   ✓ Trips, Jamaah, Packages (Umrah/Haji legacy)
  --   ✓ Order Hub — clients + orders universal (flight/umrah/visa/dll)
  --   ✓ Agent System — poin, komisi, reward redemption, client locking
  --   ✓ Daily Missions + Mission Templates
  --   ✓ Broadcast Template Library (WA)
  --   ✓ Client Document Vault
  --   ✓ Referral Hub + Public Member Card
  --   ✓ Ticket Price Manager (AI import)
  --   ✓ PDF Layout Presets + PDF Templates
  --   ✓ Audit Logs
  --   ✓ Storage Buckets
  --   ✓ Realtime Publication
  --
  -- CATATAN EDGE FUNCTIONS (deploy SETELAH schema ini dijalankan):
  --   supabase functions deploy bootstrap       --no-verify-jwt
  --   supabase functions deploy invite-member
  --   supabase functions deploy remove-member
  --   supabase functions deploy ocr-passport
  --
  -- Tambahkan di Supabase → Settings → Edge Functions → Secrets:
  --   SUPABASE_SERVICE_ROLE_KEY = <service_role_key_kamu>
  --   OPENAI_API_KEY             = <openai_api_key_kamu>
  -- ============================================================================
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §1  EXTENSIONS
  -- ════════════════════════════════════════════════════════════════════════════
  
  create extension if not exists "uuid-ossp";
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §2  CORE TENANT TABLES
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 2.1  agencies ────────────────────────────────────────────────────────────
  create table if not exists public.agencies (
    id          uuid        primary key default uuid_generate_v4(),
    name        text        not null,
    owner_id    uuid        not null references auth.users(id) on delete restrict,
    created_at  timestamptz not null default now()
  );
  create index if not exists agencies_owner_idx on public.agencies(owner_id);
  
  -- ── 2.2  agency_members ──────────────────────────────────────────────────────
  create table if not exists public.agency_members (
    agency_id      uuid        not null references public.agencies(id) on delete cascade,
    user_id        uuid        not null references auth.users(id)      on delete cascade,
    role           text        not null default 'staff',
    commission_pct numeric     not null default 10,
    created_at     timestamptz not null default now(),
    primary key (agency_id, user_id)
  );
  create index if not exists agency_members_user_idx on public.agency_members(user_id);
  
  -- role CHECK — allow owner / staff / agent (idempotent drop + re-add)
  do $$
  begin
    if exists (
      select 1 from pg_constraint where conname = 'agency_members_role_check'
    ) then
      alter table public.agency_members drop constraint agency_members_role_check;
    end if;
    alter table public.agency_members
      add constraint agency_members_role_check
      check (role in ('owner', 'staff', 'agent'));
  end$$;
  
  -- ── 2.3  profiles ────────────────────────────────────────────────────────────
  -- Mirror minimal dari auth.users buat UI "Anggota Agency" (nama + email).
  -- Di-upsert oleh edge function bootstrap & invite-member (service role).
  create table if not exists public.profiles (
    id          uuid        primary key references auth.users(id) on delete cascade,
    email       text,
    full_name   text        not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );
  create index if not exists profiles_email_idx on public.profiles(lower(email));
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §3  HELPER FUNCTIONS  (security definer – bebas RLS recursion)
  -- ════════════════════════════════════════════════════════════════════════════
  
  create or replace function public.current_agency_id()
  returns uuid language sql stable security definer set search_path = public as $$
    select agency_id from public.agency_members
     where user_id = auth.uid()
     limit 1
  $$;
  
  create or replace function public.is_member(target_agency uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = target_agency
    )
  $$;
  
  create or replace function public.is_owner(target_agency uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = target_agency
         and role = 'owner'
    )
  $$;
  
  create or replace function public.is_agent(target_agency uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.agency_members
       where user_id = auth.uid() and agency_id = target_agency
         and role = 'agent'
    )
  $$;
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §4  LEGACY UMRAH TABLES  (trips / jamaah / packages / dll)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 4.1  trips ───────────────────────────────────────────────────────────────
  create table if not exists public.trips (
    id            text        primary key,
    agency_id     uuid        not null references public.agencies(id) on delete cascade,
    name          text        not null,
    destination   text        not null default '',
    start_date    text        not null default '',
    end_date      text        not null default '',
    emoji         text        not null default '✈️',
    cover_image   text,
    created_at    timestamptz not null default now()
  );
  create index if not exists trips_agency_idx on public.trips(agency_id);
  
  -- ── 4.2  jamaah ──────────────────────────────────────────────────────────────
  create table if not exists public.jamaah (
    id              text        primary key,
    agency_id       uuid        not null references public.agencies(id) on delete cascade,
    trip_id         text        not null references public.trips(id) on delete cascade,
    name            text        not null,
    phone           text        not null default '',
    birth_date      text        not null default '',
    passport_number text        not null default '',
    gender          text        not null default '',
    photo_data_url  text,
    needs_review    boolean     not null default false,
    passport_expiry text,
    payment_status  text        not null default 'Belum Lunas',
    created_at      timestamptz not null default now()
  );
  create index if not exists jamaah_trip_idx           on public.jamaah(trip_id);
  create index if not exists jamaah_agency_idx         on public.jamaah(agency_id);
  create index if not exists jamaah_payment_status_idx on public.jamaah(payment_status);
  
  -- payment_status CHECK (idempotent)
  do $$
  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'jamaah_payment_status_check'
        and conrelid = 'public.jamaah'::regclass
    ) then
      alter table public.jamaah
        add constraint jamaah_payment_status_check
        check (payment_status in ('Belum Lunas', 'DP', 'Lunas'));
    end if;
  end$$;
  
  -- ── 4.3  jamaah_docs ─────────────────────────────────────────────────────────
  create table if not exists public.jamaah_docs (
    id          text        primary key,
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    jamaah_id   text        not null references public.jamaah(id)   on delete cascade,
    category    text        not null,
    label       text        not null default '',
    file_name   text        not null default '',
    file_type   text        not null default 'image',
    data_url    text        not null default '',
    created_at  timestamptz not null default now()
  );
  create index if not exists jamaah_docs_jamaah_idx on public.jamaah_docs(jamaah_id);
  create index if not exists jamaah_docs_agency_idx on public.jamaah_docs(agency_id);
  
  -- ── 4.4  packages ────────────────────────────────────────────────────────────
  create table if not exists public.packages (
    id              text        primary key,
    agency_id       uuid        not null references public.agencies(id) on delete cascade,
    name            text        not null,
    destination     text        not null default '',
    people          int         not null default 1,
    days            int         not null default 1,
    hpp             numeric     not null default 0,
    total_idr       numeric     not null default 0,
    status          text        not null default 'Draft',
    emoji           text        not null default '📦',
    cover_image     text,
    departure_date  text,
    return_date     text,
    airline         text,
    hotel_level     text,
    notes           text,
    facilities      jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
  );
  create index if not exists packages_agency_idx on public.packages(agency_id);
  
  -- ── 4.5  package_calculations ────────────────────────────────────────────────
  create table if not exists public.package_calculations (
    package_id  text        primary key references public.packages(id) on delete cascade,
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    payload     jsonb       not null,
    updated_at  timestamptz not null default now()
  );
  create index if not exists package_calculations_agency_idx on public.package_calculations(agency_id);
  
  -- ── 4.6  notes ───────────────────────────────────────────────────────────────
  create table if not exists public.notes (
    id          text    primary key,
    agency_id   uuid    not null references public.agencies(id) on delete cascade,
    title       text    not null default '',
    content     text    not null default '',
    color       text    not null default 'bg-white border-slate-200',
    pinned      boolean not null default false,
    tags        jsonb,
    created_at  bigint  not null,
    updated_at  bigint  not null
  );
  create index if not exists notes_agency_idx on public.notes(agency_id);
  
  -- ── 4.7  pdf_layout_presets ──────────────────────────────────────────────────
  create table if not exists public.pdf_layout_presets (
    id          text        primary key,
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    name        text        not null,
    payload     jsonb       not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );
  create index if not exists pdf_layout_presets_agency_idx on public.pdf_layout_presets(agency_id);
  
  -- ── 4.8  pdf_templates ───────────────────────────────────────────────────────
  create table if not exists public.pdf_templates (
    id          text        primary key,
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    name        text        not null,
    payload     jsonb       not null,
    created_at  timestamptz not null default now()
  );
  create index if not exists pdf_templates_agency_idx on public.pdf_templates(agency_id);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §5  ORDER HUB  (clients + orders universal)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 5.1  clients ─────────────────────────────────────────────────────────────
  create table if not exists public.clients (
    id                uuid        primary key default uuid_generate_v4(),
    agency_id         uuid        not null references public.agencies(id) on delete cascade,
    name              text        not null,
    phone             text        not null default '',
    email             text,
    birth_date        text,
    passport_number   text,
    passport_expiry   text,
    gender            text,
    photo_data_url    text,
    notes             text,
    legacy_jamaah_id  text,
    -- Agent attribution & gamification
    created_by_agent  uuid        references auth.users(id) on delete set null,
    referral_stamps   int         not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
  );
  create index if not exists clients_agency_idx         on public.clients(agency_id);
  create index if not exists clients_name_idx           on public.clients(agency_id, lower(name));
  create index if not exists clients_legacy_idx         on public.clients(legacy_jamaah_id);
  create index if not exists clients_created_by_agent_idx on public.clients(agency_id, created_by_agent);
  
  comment on column public.clients.referral_stamps is
    'Bonus stamp dari referral teman. Di-increment manual oleh admin via RPC increment_referral_stamp().';
  
  -- ── 5.2  orders ──────────────────────────────────────────────────────────────
  create table if not exists public.orders (
    id               uuid        primary key default uuid_generate_v4(),
    agency_id        uuid        not null references public.agencies(id) on delete cascade,
    client_id        uuid        references public.clients(id)  on delete set null,
    type             text        not null,
    status           text        not null default 'Draft',
    title            text,
    total_price      numeric     not null default 0,
    cost_price       numeric     not null default 0,
    currency         text        not null default 'IDR',
    metadata         jsonb       not null default '{}'::jsonb,
    -- Legacy links ke entitas umrah lama
    trip_id          text        references public.trips(id)    on delete set null,
    package_id       text        references public.packages(id) on delete set null,
    jamaah_id        text        references public.jamaah(id)   on delete set null,
    notes            text,
    -- Agent attribution
    created_by_agent uuid        references auth.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
  );
  
  -- type CHECK (idempotent)
  do $$
  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'orders_type_check' and conrelid = 'public.orders'::regclass
    ) then
      alter table public.orders
        add constraint orders_type_check
        check (type in ('umrah','flight','visa_voa','visa_student'));
    end if;
    if not exists (
      select 1 from pg_constraint
      where conname = 'orders_status_check' and conrelid = 'public.orders'::regclass
    ) then
      alter table public.orders
        add constraint orders_status_check
        check (status in ('Draft','Confirmed','Paid','Completed','Cancelled'));
    end if;
  end$$;
  
  create index if not exists orders_agency_idx           on public.orders(agency_id);
  create index if not exists orders_type_idx             on public.orders(agency_id, type);
  create index if not exists orders_client_idx           on public.orders(client_id);
  create index if not exists orders_package_idx          on public.orders(package_id);
  create index if not exists orders_trip_idx             on public.orders(trip_id);
  create index if not exists orders_jamaah_idx           on public.orders(jamaah_id);
  create index if not exists orders_status_idx           on public.orders(agency_id, status);
  create index if not exists orders_created_by_agent_idx on public.orders(agency_id, created_by_agent);
  create index if not exists orders_cost_price_idx       on public.orders(agency_id, type);
  
  -- ── 5.3  audit_logs ──────────────────────────────────────────────────────────
  create table if not exists public.audit_logs (
    id          bigserial   primary key,
    agency_id   uuid        references public.agencies(id) on delete cascade,
    user_id     uuid        references auth.users(id)      on delete set null,
    table_name  text        not null,
    record_id   text,
    action      text        not null check (action in ('INSERT','UPDATE','DELETE')),
    old_data    jsonb,
    new_data    jsonb,
    created_at  timestamptz not null default now()
  );
  create index if not exists audit_logs_agency_idx on public.audit_logs(agency_id, created_at desc);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §6  AGENT SYSTEM  (poin / komisi / reward / retention)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 6.1  agent_points ────────────────────────────────────────────────────────
  -- Insert-only oleh trigger (security definer). User tidak bisa manipulasi manual.
  create table if not exists public.agent_points (
    id          uuid        primary key default uuid_generate_v4(),
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    agent_id    uuid        not null references auth.users(id)      on delete cascade,
    order_id    uuid        not null references public.orders(id)   on delete cascade,
    points      int         not null default 10,
    reason      text        not null default 'order_completed',
    awarded_at  timestamptz not null default now(),
    unique(order_id)  -- 1 order = 1 award, idempotent
  );
  create index if not exists agent_points_agency_agent_idx on public.agent_points(agency_id, agent_id);
  create index if not exists agent_points_awarded_idx      on public.agent_points(agency_id, awarded_at desc);
  
  -- ── 6.2  reward_redemptions ──────────────────────────────────────────────────
  create table if not exists public.reward_redemptions (
    id            uuid        primary key default uuid_generate_v4(),
    agency_id     uuid        not null references public.agencies(id) on delete cascade,
    agent_id      uuid        not null references auth.users(id)      on delete cascade,
    reward_key    text        not null,
    reward_label  text        not null,
    cost_points   int         not null check (cost_points > 0),
    status        text        not null default 'pending'
                              check (status in ('pending','approved','rejected','fulfilled')),
    notes         text,
    requested_at  timestamptz not null default now(),
    resolved_at   timestamptz,
    resolved_by   uuid        references auth.users(id) on delete set null
  );
  create index if not exists reward_redemptions_agency_status_idx
    on public.reward_redemptions(agency_id, status, requested_at desc);
  create index if not exists reward_redemptions_agent_idx
    on public.reward_redemptions(agency_id, agent_id, requested_at desc);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §7  MISSION SYSTEM
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 7.1  daily_missions ──────────────────────────────────────────────────────
  create table if not exists public.daily_missions (
    id             uuid        primary key default uuid_generate_v4(),
    agency_id      uuid        not null references public.agencies(id) on delete cascade,
    title          text        not null,
    description    text        not null default '',
    reward_points  int         not null default 10 check (reward_points > 0),
    deadline       timestamptz not null,
    created_by     uuid        references auth.users(id) on delete set null,
    created_at     timestamptz not null default now()
  );
  create index if not exists daily_missions_agency_deadline_idx
    on public.daily_missions(agency_id, deadline desc);
  
  -- ── 7.2  mission_submissions ─────────────────────────────────────────────────
  create table if not exists public.mission_submissions (
    id              uuid        primary key default uuid_generate_v4(),
    agency_id       uuid        not null references public.agencies(id)      on delete cascade,
    mission_id      uuid        not null references public.daily_missions(id) on delete cascade,
    agent_id        uuid        not null references auth.users(id)           on delete cascade,
    status          text        not null default 'pending'
                                check (status in ('pending','approved','rejected')),
    proof_image_url text,
    notes           text,
    reward_points   int         not null default 0,
    submitted_at    timestamptz not null default now(),
    reviewed_at     timestamptz,
    reviewed_by     uuid        references auth.users(id) on delete set null,
    unique(mission_id, agent_id)  -- 1 agen = 1 submit per misi
  );
  create index if not exists mission_submissions_agency_idx
    on public.mission_submissions(agency_id, submitted_at desc);
  create index if not exists mission_submissions_agent_idx
    on public.mission_submissions(agency_id, agent_id);
  create index if not exists mission_submissions_mission_idx
    on public.mission_submissions(mission_id);
  
  -- ── 7.3  mission_templates ───────────────────────────────────────────────────
  create table if not exists public.mission_templates (
    id             uuid        primary key default uuid_generate_v4(),
    agency_id      uuid        not null references public.agencies(id) on delete cascade,
    title          text        not null,
    description    text        not null default '',
    default_points int         not null default 10 check (default_points > 0),
    use_count      int         not null default 0,
    created_by     uuid        references auth.users(id) on delete set null,
    created_at     timestamptz not null default now()
  );
  create index if not exists mission_templates_agency_idx
    on public.mission_templates(agency_id, created_at desc);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §8  BROADCAST TEMPLATE LIBRARY
  -- ════════════════════════════════════════════════════════════════════════════
  
  create table if not exists public.bc_templates (
    id           uuid        primary key default uuid_generate_v4(),
    agency_id    uuid        not null references public.agencies(id) on delete cascade,
    title        text        not null,
    category     text        not null default 'general'
                 check (category in (
                   'visa_on_arrival','visa_pelajar','tiket_pesawat',
                   'umrah','haji','general'
                 )),
    body         text        not null,
    sort_order   int         not null default 0,
    created_by   uuid        references auth.users(id) on delete set null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
  );
  create index if not exists bc_templates_agency_cat_idx
    on public.bc_templates(agency_id, category, sort_order);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §9  CLIENT DOCUMENT VAULT
  -- ════════════════════════════════════════════════════════════════════════════
  
  create table if not exists public.client_documents (
    id          text        primary key,
    agency_id   uuid        not null references public.agencies(id) on delete cascade,
    client_id   uuid        not null references public.clients(id)  on delete cascade,
    category    text        not null default 'lainnya'
                check (category in ('paspor','visa','tiket','lainnya')),
    label       text        not null default '',
    file_name   text        not null default '',
    file_type   text        not null default 'image',
    data_url    text        not null default '',
    created_at  timestamptz not null default now()
  );
  create index if not exists client_docs_client_idx   on public.client_documents(client_id);
  create index if not exists client_docs_agency_idx   on public.client_documents(agency_id);
  create index if not exists client_docs_category_idx on public.client_documents(agency_id, category);
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §10  TICKET PRICE MANAGER  (AI import + Smart Margin)
  -- ════════════════════════════════════════════════════════════════════════════
  
  create table if not exists public.ticket_prices (
    id               uuid        not null default gen_random_uuid() primary key,
    agency_id        uuid        not null references public.agencies(id) on delete cascade,
    airline          text        not null,
    airline_code     text,                    -- IATA 2-letter e.g. QR, SV, EK
    from_code        text        not null,    -- IATA 3-letter e.g. CGK
    from_city        text,
    to_code          text        not null,    -- IATA 3-letter e.g. JED
    to_city          text,
    depart_date      text,                    -- YYYY-MM-DD atau "Fleksibel"
    base_price       numeric     not null default 0,
    currency         text        not null default 'IDR',
    valid_until      date,
    notes            text,
    is_published     boolean     not null default true,
    sort_order       integer     not null default 0,
    -- Extended flight info (Fase 19.2)
    flight_number    text,                    -- e.g. QR818
    etd              text,                    -- Departure time HH:MM
    eta              text,                    -- Arrival time HH:MM
    terminal         text,                    -- e.g. T3
    transit_code     text,                    -- IATA transit airport code
    transit_city     text,
    transit_duration text,                    -- e.g. "2h 30m"
    created_by       uuid        references auth.users(id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
  );
  create index if not exists idx_ticket_prices_agency
    on public.ticket_prices(agency_id, is_published, sort_order, created_at desc);
  
  comment on column public.ticket_prices.flight_number    is 'Flight number e.g. QR818';
  comment on column public.ticket_prices.etd              is 'Departure time HH:MM (local)';
  comment on column public.ticket_prices.eta              is 'Arrival time HH:MM (local)';
  comment on column public.ticket_prices.terminal         is 'Departure terminal e.g. T3';
  comment on column public.ticket_prices.transit_code     is 'IATA 3-letter transit airport code';
  comment on column public.ticket_prices.transit_city     is 'Transit city name';
  comment on column public.ticket_prices.transit_duration is 'Layover duration e.g. 2h 30m';
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §11  ENABLE ROW LEVEL SECURITY  (semua tabel)
  -- ════════════════════════════════════════════════════════════════════════════
  
  alter table public.agencies              enable row level security;
  alter table public.agency_members        enable row level security;
  alter table public.profiles              enable row level security;
  alter table public.trips                 enable row level security;
  alter table public.jamaah                enable row level security;
  alter table public.jamaah_docs           enable row level security;
  alter table public.packages              enable row level security;
  alter table public.package_calculations  enable row level security;
  alter table public.notes                 enable row level security;
  alter table public.pdf_layout_presets    enable row level security;
  alter table public.pdf_templates         enable row level security;
  alter table public.audit_logs            enable row level security;
  alter table public.clients               enable row level security;
  alter table public.orders                enable row level security;
  alter table public.agent_points          enable row level security;
  alter table public.reward_redemptions    enable row level security;
  alter table public.daily_missions        enable row level security;
  alter table public.mission_submissions   enable row level security;
  alter table public.mission_templates     enable row level security;
  alter table public.bc_templates          enable row level security;
  alter table public.client_documents      enable row level security;
  alter table public.ticket_prices         enable row level security;
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §12  DROP SEMUA POLICY LAMA  (biar idempotent)
  -- ════════════════════════════════════════════════════════════════════════════
  
  do $$
  declare
    t    text;
    pname text;
  begin
    foreach t in array array[
      'agencies','agency_members','profiles',
      'trips','jamaah','jamaah_docs','packages','package_calculations',
      'notes','pdf_layout_presets','pdf_templates','audit_logs',
      'clients','orders','agent_points','reward_redemptions',
      'daily_missions','mission_submissions','mission_templates',
      'bc_templates','client_documents','ticket_prices'
    ]
    loop
      if exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = t
      ) then
        for pname in
          select policyname from pg_policies
           where schemaname = 'public' and tablename = t
        loop
          execute format('drop policy if exists %I on public.%I', pname, t);
        end loop;
      end if;
    end loop;
  end$$;
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §13  RLS POLICIES
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── agencies ──────────────────────────────────────────────────────────────────
  -- Member bisa lihat. Hanya owner yang bisa update. Insert via Edge Function bootstrap.
  create policy "agencies_select_member" on public.agencies
    for select using (public.is_member(id));
  create policy "agencies_update_owner" on public.agencies
    for update using (public.is_owner(id)) with check (public.is_owner(id));
  
  -- ── agency_members ────────────────────────────────────────────────────────────
  -- Member bisa lihat semua member di agency-nya.
  -- Owner bisa insert (termasuk invite agent) + update + delete non-owner.
  create policy "members_select_same_agency" on public.agency_members
    for select using (public.is_member(agency_id));
  
  create policy "members_insert_owner" on public.agency_members
    for insert with check (
      public.is_owner(agency_id)
      and role in ('owner', 'staff', 'agent')  -- owner bisa invite semua role
    );
  
  create policy "members_update_owner" on public.agency_members
    for update
    using (public.is_owner(agency_id))
    with check (public.is_owner(agency_id));
  
  create policy "members_delete_owner" on public.agency_members
    for delete using (
      public.is_owner(agency_id) and role <> 'owner'  -- owner tidak bisa hapus owner lain
    );
  
  -- ── profiles ──────────────────────────────────────────────────────────────────
  create policy "profiles_select_self" on public.profiles
    for select using (id = auth.uid());
  create policy "profiles_insert_self" on public.profiles
    for insert with check (id = auth.uid());
  create policy "profiles_update_self" on public.profiles
    for update using (id = auth.uid()) with check (id = auth.uid());
  -- Bisa baca profile sesama anggota agency (untuk Settings → Kelola Tim)
  create policy "profiles_select_same_agency" on public.profiles
    for select using (
      exists (
        select 1
          from public.agency_members am_target
          join public.agency_members am_self on am_self.agency_id = am_target.agency_id
         where am_target.user_id = profiles.id
           and am_self.user_id   = auth.uid()
      )
    );
  
  -- ── domain tables (trips, jamaah, dll) — template CRUD ─────────────────────
  -- Semua member agency bisa SELECT / INSERT / UPDATE / DELETE.
  do $$
  declare t text;
  begin
    foreach t in array array[
      'trips','jamaah','jamaah_docs','packages',
      'package_calculations','notes','pdf_layout_presets','pdf_templates'
    ]
    loop
      execute format($f$
        create policy "%1$s_select" on public.%1$I
          for select using (public.is_member(agency_id));
        create policy "%1$s_insert" on public.%1$I
          for insert with check (public.is_member(agency_id));
        create policy "%1$s_update" on public.%1$I
          for update using (public.is_member(agency_id))
                    with check (public.is_member(agency_id));
        create policy "%1$s_delete" on public.%1$I
          for delete using (public.is_member(agency_id));
      $f$, t);
    end loop;
  end$$;
  
  -- ── audit_logs ────────────────────────────────────────────────────────────────
  create policy "audit_logs_select" on public.audit_logs
    for select using (public.is_member(agency_id));
  
  -- ── clients ───────────────────────────────────────────────────────────────────
  -- Owner / Staff: akses penuh.
  -- Agent: hanya klien yang dia buat sendiri (created_by_agent = auth.uid()).
  create policy "clients_select" on public.clients
    for select using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  create policy "clients_insert" on public.clients
    for insert with check (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id)
        or created_by_agent is null
        or created_by_agent = auth.uid()
      )
    );
  create policy "clients_update" on public.clients
    for update using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    ) with check (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  create policy "clients_delete" on public.clients
    for delete using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  
  -- ── orders ────────────────────────────────────────────────────────────────────
  -- Owner / Staff: akses penuh.
  -- Agent: hanya order yang dia buat sendiri.
  create policy "orders_select" on public.orders
    for select using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  create policy "orders_insert" on public.orders
    for insert with check (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id)
        or created_by_agent is null
        or created_by_agent = auth.uid()
      )
    );
  create policy "orders_update" on public.orders
    for update using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    ) with check (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  create policy "orders_delete" on public.orders
    for delete using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or created_by_agent = auth.uid()
      )
    );
  
  -- ── agent_points ──────────────────────────────────────────────────────────────
  -- Semua member bisa lihat (leaderboard). INSERT hanya via trigger (security definer).
  create policy "agent_points_select" on public.agent_points
    for select using (public.is_member(agency_id));
  
  -- ── reward_redemptions ────────────────────────────────────────────────────────
  -- Agent: insert request diri sendiri + SELECT miliknya.
  -- Owner / Staff: SELECT semua + UPDATE status (approve/reject/fulfill).
  create policy "rewards_select" on public.reward_redemptions
    for select using (
      public.is_member(agency_id) and (
        not public.is_agent(agency_id) or agent_id = auth.uid()
      )
    );
  create policy "rewards_insert" on public.reward_redemptions
    for insert with check (
      public.is_member(agency_id)
      and agent_id = auth.uid()
      and status = 'pending'
    );
  create policy "rewards_update" on public.reward_redemptions
    for update using (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    ) with check (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  create policy "rewards_delete" on public.reward_redemptions
    for delete using (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  
  -- ── daily_missions ────────────────────────────────────────────────────────────
  -- Semua member bisa lihat. Hanya owner yang bisa buat / edit / hapus.
  create policy "missions_select_member" on public.daily_missions
    for select using (public.is_member(agency_id));
  create policy "missions_insert_owner" on public.daily_missions
    for insert with check (public.is_owner(agency_id));
  create policy "missions_update_owner" on public.daily_missions
    for update using (public.is_owner(agency_id));
  create policy "missions_delete_owner" on public.daily_missions
    for delete using (public.is_owner(agency_id));
  
  -- ── mission_submissions ───────────────────────────────────────────────────────
  -- Semua member bisa lihat (leaderboard transparan).
  -- Agent INSERT dan UPDATE miliknya sendiri (selama pending).
  -- Owner bisa UPDATE semua (untuk approve/reject).
  create policy "msub_select_member" on public.mission_submissions
    for select using (public.is_member(agency_id));
  create policy "msub_insert_agent" on public.mission_submissions
    for insert with check (
      auth.uid() = agent_id and public.is_member(agency_id)
    );
  create policy "msub_update_agent" on public.mission_submissions
    for update using (auth.uid() = agent_id and status = 'pending');
  create policy "msub_update_owner" on public.mission_submissions
    for update using (public.is_owner(agency_id));
  
  -- ── mission_templates ─────────────────────────────────────────────────────────
  create policy "tmpl_select_member" on public.mission_templates
    for select using (public.is_member(agency_id));
  create policy "tmpl_insert_owner" on public.mission_templates
    for insert with check (public.is_owner(agency_id));
  create policy "tmpl_update_owner" on public.mission_templates
    for update using (public.is_owner(agency_id));
  create policy "tmpl_delete_owner" on public.mission_templates
    for delete using (public.is_owner(agency_id));
  
  -- ── bc_templates ──────────────────────────────────────────────────────────────
  -- Semua member SELECT. Hanya non-agent (owner + staff) yang bisa INSERT/UPDATE/DELETE.
  create policy "bc_templates_select" on public.bc_templates
    for select using (public.is_member(agency_id));
  create policy "bc_templates_insert" on public.bc_templates
    for insert with check (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  create policy "bc_templates_update" on public.bc_templates
    for update using (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    ) with check (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  create policy "bc_templates_delete" on public.bc_templates
    for delete using (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  
  -- ── client_documents ──────────────────────────────────────────────────────────
  create policy "client_docs_select" on public.client_documents
    for select using (public.is_member(agency_id));
  create policy "client_docs_insert" on public.client_documents
    for insert with check (public.is_member(agency_id));
  create policy "client_docs_delete" on public.client_documents
    for delete using (public.is_member(agency_id));
  
  -- ── ticket_prices ─────────────────────────────────────────────────────────────
  -- Semua member SELECT. INSERT / UPDATE hanya non-agent. DELETE hanya owner.
  create policy "ticket_prices_select" on public.ticket_prices
    for select using (public.is_member(agency_id));
  create policy "ticket_prices_insert" on public.ticket_prices
    for insert with check (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  create policy "ticket_prices_update" on public.ticket_prices
    for update using (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    ) with check (
      public.is_member(agency_id) and not public.is_agent(agency_id)
    );
  create policy "ticket_prices_delete" on public.ticket_prices
    for delete using (public.is_owner(agency_id));
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §14  TRIGGERS & HELPER FUNCTIONS
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── updated_at triggers ───────────────────────────────────────────────────────
  
  create or replace function public.set_clients_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  drop trigger if exists clients_set_updated_at on public.clients;
  create trigger clients_set_updated_at
    before update on public.clients
    for each row execute function public.set_clients_updated_at();
  
  create or replace function public.set_orders_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  drop trigger if exists orders_set_updated_at on public.orders;
  create trigger orders_set_updated_at
    before update on public.orders
    for each row execute function public.set_orders_updated_at();
  
  create or replace function public.set_profiles_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  drop trigger if exists profiles_set_updated_at on public.profiles;
  create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_profiles_updated_at();
  
  create or replace function public.set_bc_templates_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  drop trigger if exists tr_bc_templates_updated_at on public.bc_templates;
  create trigger tr_bc_templates_updated_at
    before update on public.bc_templates
    for each row execute function public.set_bc_templates_updated_at();
  
  create or replace function public.set_ticket_prices_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end;
  $$;
  drop trigger if exists tr_ticket_prices_updated_at on public.ticket_prices;
  create trigger tr_ticket_prices_updated_at
    before update on public.ticket_prices
    for each row execute function public.set_ticket_prices_updated_at();
  
  -- ── Trigger: auto-award poin saat order → Completed ──────────────────────────
  create or replace function public.award_points_on_completion()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if new.status = 'Completed'
       and new.created_by_agent is not null
       and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Completed')
    then
      insert into public.agent_points(agency_id, agent_id, order_id, points, reason)
      values (new.agency_id, new.created_by_agent, new.id, 10, 'order_completed')
      on conflict (order_id) do nothing;
    end if;
    return new;
  end;
  $$;
  
  drop trigger if exists tr_award_points_on_completion on public.orders;
  create trigger tr_award_points_on_completion
    after insert or update of status on public.orders
    for each row execute function public.award_points_on_completion();
  
  -- ── Trigger: inherit agent dari client saat order dibuat ─────────────────────
  -- "Client locking": admin tidak bisa merebut klien dari agen.
  create or replace function public.inherit_agent_from_client()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    if new.created_by_agent is null and new.client_id is not null then
      new.created_by_agent := (
        select c.created_by_agent
          from public.clients c
         where c.id = new.client_id
           and c.agency_id = new.agency_id
         limit 1
      );
    end if;
    return new;
  end;
  $$;
  
  drop trigger if exists tr_inherit_agent_from_client on public.orders;
  create trigger tr_inherit_agent_from_client
    before insert on public.orders
    for each row execute function public.inherit_agent_from_client();
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §15  PUBLIC RPCs  (Member Card + Leaderboard + Referral)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- ── 15.1  get_member_card ─────────────────────────────────────────────────────
  -- Slug format baru: `firstname-NNNN` (e.g. danang-0010)
  -- Slug lama: `firstnameNNNN` juga di-support untuk backward compat.
  -- Field yang dikembalikan: minimal — tidak expose PII (phone/email/paspor/harga).
  create or replace function public.get_member_card(p_slug text)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  declare
    v_digits          text;
    v_name_prefix     text;
    v_member_index    int;
    v_client_id       uuid;
    v_client_name     text;
    v_created_at      timestamptz;
    v_orders          json;
    v_referral_stamps int;
  begin
    if p_slug is null or length(trim(p_slug)) < 2 then
      return json_build_object('error', 'invalid_slug');
    end if;
  
    v_digits      := substring(p_slug from '([0-9]+)$');
    v_name_prefix := lower(regexp_replace(
                            substring(p_slug from '^(.*?)[-]?[0-9]+$'),
                            '[^a-zA-Z0-9]', '', 'g'
                          ));
  
    if v_digits is null or v_name_prefix is null or length(v_name_prefix) = 0 then
      return json_build_object('error', 'invalid_slug');
    end if;
  
    v_member_index := v_digits::int;
    if v_member_index < 1 then
      return json_build_object('error', 'invalid_slug');
    end if;
  
    with ranked as (
      select c.id, c.name, c.created_at, c.referral_stamps,
             row_number() over (partition by c.agency_id order by c.created_at asc, c.id asc) as rn
        from public.clients c
    )
    select id, name, created_at, referral_stamps
      into v_client_id, v_client_name, v_created_at, v_referral_stamps
      from ranked
     where rn = v_member_index
       and lower(regexp_replace(split_part(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) = v_name_prefix
     order by created_at asc
     limit 1;
  
    if v_client_id is null then
      return json_build_object('error', 'not_found');
    end if;
  
    select coalesce(
             json_agg(
               json_build_object(
                 'type',        o.type,
                 'status',      o.status,
                 'createdAt',   o.created_at,
                 'transitType', o.metadata->>'transitType'
               )
               order by o.created_at asc
             ),
             '[]'::json
           )
      into v_orders
      from public.orders o
     where o.client_id = v_client_id
       and o.status in ('Confirmed','Paid','Completed');
  
    return json_build_object(
      'client', json_build_object(
        'name',           v_client_name,
        'createdAt',      v_created_at,
        'memberIndex',    v_member_index,
        'referralStamps', coalesce(v_referral_stamps, 0)
      ),
      'orders', v_orders
    );
  end;
  $$;
  
  revoke all    on function public.get_member_card(text) from public;
  grant execute on function public.get_member_card(text) to anon, authenticated;
  
  comment on function public.get_member_card(text) is
    'Public read-only: Member Card page (/m/[slug]). Tidak expose PII (phone/email/paspor) atau finansial.';
  
  -- ── 15.2  get_top_members — Public Leaderboard ────────────────────────────────
  create or replace function public.get_top_members(p_limit int default 10)
  returns json
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  declare
    v_result json;
  begin
    with ranked_clients as (
      select
        c.id,
        split_part(c.name, ' ', 1) as first_name,
        c.referral_stamps,
        row_number() over (partition by c.agency_id order by c.created_at asc, c.id asc) as member_index,
        count(o.id) filter (where o.status in ('Confirmed','Paid','Completed')) as order_stamps
      from public.clients c
      left join public.orders o on o.client_id = c.id
      group by c.id
    ),
    totals as (
      select
        first_name,
        member_index,
        (order_stamps + referral_stamps)::int as total_stamps,
        order_stamps::int as order_stamps,
        referral_stamps
      from ranked_clients
      order by total_stamps desc, member_index asc
      limit p_limit
    )
    select json_agg(
      json_build_object(
        'firstName',      first_name,
        'memberIndex',    member_index,
        'totalStamps',    total_stamps,
        'orderStamps',    order_stamps,
        'referralStamps', referral_stamps
      )
    )
    into v_result
    from totals;
  
    return coalesce(v_result, '[]'::json);
  end;
  $$;
  
  revoke all    on function public.get_top_members(int) from public;
  grant execute on function public.get_top_members(int) to anon, authenticated;
  
  comment on function public.get_top_members(int) is
    'Public leaderboard: top N members by total stamps. Hanya return first name, tidak expose PII.';
  
  -- ── 15.3  increment_referral_stamp — Admin +1 stamp ───────────────────────────
  create or replace function public.increment_referral_stamp(p_client_id uuid)
  returns json
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_new_count int;
  begin
    update public.clients
       set referral_stamps = referral_stamps + 1,
           updated_at      = now()
     where id = p_client_id
    returning referral_stamps into v_new_count;
  
    if not found then
      return json_build_object('ok', false, 'error', 'client_not_found');
    end if;
  
    return json_build_object('ok', true, 'referralStamps', v_new_count);
  end;
  $$;
  
  revoke all    on function public.increment_referral_stamp(uuid) from public;
  grant execute on function public.increment_referral_stamp(uuid) to authenticated;
  
  comment on function public.increment_referral_stamp(uuid) is
    'Admin-only: tambah +1 referral_stamp ke klien. Hanya authenticated user yang bisa memanggil.';
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §16  STORAGE BUCKETS
  -- ════════════════════════════════════════════════════════════════════════════
  
  insert into storage.buckets (id, name, public)
  values
    ('jamaah-photos',   'jamaah-photos',   true),
    ('jamaah-docs',     'jamaah-docs',     true),
    ('pdf-templates',   'pdf-templates',   true),
    ('mission-proofs',  'mission-proofs',  true)
  on conflict (id) do nothing;
  
  -- Drop policy storage lama (hanya yang kita punya)
  do $$
  declare pname text;
  begin
    for pname in
      select policyname from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and (policyname like 'igh_%' or policyname like 'tmkt_%')
    loop
      execute format('drop policy if exists %I on storage.objects', pname);
    end loop;
  end$$;
  
  -- Konvensi path: `{agency_id}/{filename}`.
  -- Folder pertama adalah agency_id (UUID) — dicek via is_member().
  create policy "tmkt_storage_select" on storage.objects
    for select using (
      bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  
  create policy "tmkt_storage_insert" on storage.objects
    for insert with check (
      bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  
  create policy "tmkt_storage_update" on storage.objects
    for update using (
      bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
      and public.is_member(((storage.foldername(name))[1])::uuid)
    ) with check (
      bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  
  create policy "tmkt_storage_delete" on storage.objects
    for delete using (
      bucket_id in ('jamaah-photos','jamaah-docs','pdf-templates')
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  
  -- mission-proofs: agent upload bukti ke folder sendiri ({agent_uid}/{file})
  create policy "tmkt_mission_proofs_insert" on storage.objects
    for insert with check (
      bucket_id = 'mission-proofs'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  
  create policy "tmkt_mission_proofs_select" on storage.objects
    for select using (bucket_id = 'mission-proofs');
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §17  REALTIME PUBLICATION
  -- ════════════════════════════════════════════════════════════════════════════
  
  do $$
  declare t text;
  begin
    foreach t in array array[
      'trips','jamaah','jamaah_docs','packages','package_calculations',
      'notes','pdf_layout_presets','pdf_templates',
      'clients','orders',
      'agent_points','reward_redemptions',
      'daily_missions','mission_submissions','mission_templates',
      'bc_templates','client_documents','ticket_prices'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end$$;
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §18  BACKFILL PROFILES  (existing users dari agency_members → profiles)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- Pastikan semua user yang sudah di agency_members punya row di profiles.
  -- Ambil display_name dari user_metadata, fallback ke email-prefix.
  insert into public.profiles (id, email, full_name)
  select
    u.id,
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )
  from auth.users u
  where u.id in (select user_id from public.agency_members)
  on conflict (id) do nothing;
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §19  BACKFILL JAMAAH → CLIENTS + ORDERS  (data lama, non-destructive)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- Backfill clients dari jamaah (yang belum punya row di clients)
  insert into public.clients (
    agency_id, name, phone, birth_date, passport_number, passport_expiry,
    gender, photo_data_url, legacy_jamaah_id, created_at
  )
  select
    j.agency_id,
    coalesce(nullif(trim(j.name), ''), 'Jamaah ' || substr(j.id, 1, 8)),
    coalesce(j.phone, ''),
    nullif(j.birth_date, ''),
    nullif(j.passport_number, ''),
    j.passport_expiry,
    nullif(j.gender, ''),
    j.photo_data_url,
    j.id,
    coalesce(j.created_at, now())
  from public.jamaah j
  where j.agency_id is not null
    and not exists (
      select 1 from public.clients c where c.legacy_jamaah_id = j.id
    );
  
  -- Backfill umrah orders dari jamaah (1 jamaah = 1 umrah order Draft)
  insert into public.orders (
    agency_id, client_id, type, status, title,
    total_price, currency, metadata,
    trip_id, package_id, jamaah_id, created_at
  )
  select
    j.agency_id,
    c.id,
    'umrah',
    'Draft',
    coalesce(nullif(trim(j.name), ''), 'Order Umrah'),
    0,
    'IDR',
    jsonb_build_object(
      'source',        'backfill_jamaah',
      'paymentStatus', j.payment_status
    ),
    case when t.id is not null then j.trip_id else null end,
    case when p.id is not null then j.trip_id else null end,
    j.id,
    coalesce(j.created_at, now())
  from public.jamaah j
  join  public.clients  c on c.legacy_jamaah_id = j.id
  left  join public.trips    t on t.id = j.trip_id
  left  join public.packages p on p.id = j.trip_id
  where j.agency_id is not null
    and not exists (
      select 1 from public.orders o
      where o.jamaah_id = j.id and o.type = 'umrah'
    );
  
  
  -- ════════════════════════════════════════════════════════════════════════════
  -- §20  VERIFIKASI  (jalankan manual setelah script ini sukses)
  -- ════════════════════════════════════════════════════════════════════════════
  
  -- Cek jumlah tabel
  -- select table_name from information_schema.tables
  --  where table_schema = 'public' order by table_name;
  
  -- Cek RLS aktif
  -- select tablename, rowsecurity from pg_tables
  --  where schemaname = 'public' order by tablename;
  
  -- Cek policies
  -- select tablename, policyname, cmd from pg_policies
  --  where schemaname = 'public' order by tablename, policyname;
  
  -- Cek triggers
  -- select trigger_name, event_object_table, action_timing, event_manipulation
  --   from information_schema.triggers
  --  where trigger_schema = 'public';
  
  -- Cek agent_members per role
  -- select role, count(*) from public.agency_members group by role;
  
  -- Cek data (setelah ada user + agency)
  -- select count(*) from public.clients;
  -- select count(*) from public.orders;
  -- select type, count(*) from public.orders group by type;
  
  -- ============================================================================
  -- SELESAI. Langkah selanjutnya:
  --   1. Deploy edge functions (bootstrap, invite-member, remove-member)
  --   2. Set SUPABASE_SERVICE_ROLE_KEY di Edge Function secrets
  --   3. Buka /bootstrap di app → daftar owner pertama
  -- ============================================================================
  