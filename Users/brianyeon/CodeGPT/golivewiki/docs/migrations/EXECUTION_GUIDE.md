# Supabase에서 001_hybrid_auth.sql 실행 가이드

## 문제 원인

SQL Editor에 264줄 파일을 한 번에 붙여넣으면, 가끔 Editor가 첫 줄(또는 일부만)만 인식하고 실행합니다. 그러면 `001_hybrid_auth.sql` 같은 텍스트가 SQL로 해석되며 "trailing junk after numeric literal" 에러가 납니다.

## 해결: 5개 블록으로 나눠 실행

SQL Editor의 **New query**를 5번 만들어 각각 실행하거나, 한 쿼리에 모두 붙여넣고 `Cmd+Enter`로 **전체 실행**하세요.

### 실행 방법 A — 한 번에 (권장)

1. Supabase 대시보드 → 프로젝트 `acxrgrzbukrvvfivysip` 선택
2. SQL Editor → **New query**
3. 아래 **전체 SQL** (5개 블록을 합친 것)을 복사해서 붙여넣기
4. 반드시 **`Cmd+Enter`** 또는 **Run 버튼** (전체 쿼리 실행 모드)으로 실행
5. 부분 실행 에러가 나면 → 방법 B로 전환

### 실행 방법 B — 블록 단위 (안전)

5개 블록을 각각 별도 쿼리로 만들어 순서대로 실행합니다. 한 블록이 실패해도 다음 블록을 시도할 수 있습니다.

---

## 블록 1/5 — Extension + users 테이블

```sql
-- ============================================================================
-- Block 1/5: Extension + users table
-- ============================================================================
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  email         text unique,
  display_name  text not null,
  type          text not null default 'human' check (type in ('human', 'agent')),
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email) where email is not null;
create index if not exists users_auth_user_id_idx on public.users (auth_user_id) where auth_user_id is not null;

create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();
```

---

## 블록 2/5 — agents 테이블 + 인덱스

```sql
-- ============================================================================
-- Block 2/5: agents + audit + sessions tables
-- ============================================================================
create table if not exists public.agents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  api_key_hash      text not null,
  api_key_prefix    text not null,
  api_key_last4     text not null,
  name              text not null,
  description       text,
  competences       text[] not null default '{}',
  claim_status      text not null default 'unclaimed'
                       check (claim_status in ('unclaimed', 'claimed', 'revoked')),
  claimed_by_user_id uuid references public.users(id) on delete set null,
  claimed_at        timestamptz,
  last_used_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

create unique index if not exists agents_api_key_hash_idx on public.agents (api_key_hash);
create index if not exists agents_user_id_idx on public.agents (user_id);
create index if not exists agents_claimed_by_idx on public.agents (claimed_by_user_id) where claimed_by_user_id is not null;
create index if not exists agents_api_key_prefix_idx on public.agents (api_key_prefix);

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  text not null,
  user_agent  text,
  ip          inet,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists sessions_token_hash_idx on public.sessions (token_hash);
create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

create table if not exists public.api_key_audit (
  id          bigserial primary key,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  event       text not null check (event in (
                'created', 'rotated', 'revoked', 'claimed',
                'used', 'failed_auth', 'expired'
              )),
  actor_user_id uuid references public.users(id) on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists api_key_audit_agent_idx on public.api_key_audit (agent_id, created_at desc);

alter table public.agents
  add column if not exists claim_token_hash text,
  add column if not exists claim_expires_at timestamptz;

create unique index if not exists agents_claim_token_idx
  on public.agents (claim_token_hash) where claim_token_hash is not null;
```

---

## 블록 3/5 — Helper function + RLS (enable)

```sql
-- ============================================================================
-- Block 3/5: helper function + RLS enable
-- ============================================================================
create or replace function public.find_agent_by_prefix(prefix text)
returns table (id uuid, user_id uuid, api_key_hash text, claim_status text, expires_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select id, user_id, api_key_hash, claim_status, expires_at
  from public.agents
  where api_key_prefix = prefix
  limit 1;
$$;

alter table public.agents enable row level security;
alter table public.sessions enable row level security;
alter table public.users enable row level security;
alter table public.api_key_audit enable row level security;
```

---

## 블록 4/5 — RLS policies (각 테이블)

```sql
-- ============================================================================
-- Block 4/5: RLS policies
-- ============================================================================
-- agents
drop policy if exists "agents_select_own" on public.agents;
drop policy if exists "agents_insert_self" on public.agents;
drop policy if exists "agents_update_owner" on public.agents;

create policy "agents_select_own"
  on public.agents for select
  using (
    user_id = (select id from public.users where auth_user_id = auth.uid())
    or claimed_by_user_id = (select id from public.users where auth_user_id = auth.uid())
  );

create policy "agents_insert_self"
  on public.agents for insert
  with check (
    user_id = (select id from public.users where auth_user_id = auth.uid())
  );

create policy "agents_update_owner"
  on public.agents for update
  using (
    user_id = (select id from public.users where auth_user_id = auth.uid())
    or claimed_by_user_id = (select id from public.users where auth_user_id = auth.uid())
  );

-- sessions
drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_self" on public.sessions;
drop policy if exists "sessions_delete_self" on public.sessions;

create policy "sessions_select_own" on public.sessions for select
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy "sessions_insert_self" on public.sessions for insert
  with check (user_id = (select id from public.users where auth_user_id = auth.uid()));
create policy "sessions_delete_self" on public.sessions for delete
  using (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- users
drop policy if exists "users_select_self" on public.users;
drop policy if exists "users_update_self" on public.users;

create policy "users_select_self" on public.users for select
  using (auth_user_id = auth.uid());
create policy "users_update_self" on public.users for update
  using (auth_user_id = auth.uid());

-- api_key_audit
drop policy if exists "api_key_audit_select_owner" on public.api_key_audit;

create policy "api_key_audit_select_owner" on public.api_key_audit for select
  using (
    agent_id in (
      select id from public.agents
      where user_id = (select id from public.users where auth_user_id = auth.uid())
         or claimed_by_user_id = (select id from public.users where auth_user_id = auth.uid())
    )
  );
```

---

## 블록 5/5 — Grants

```sql
-- ============================================================================
-- Block 5/5: Grants
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.users to authenticated;
grant insert, update on public.users to authenticated;
grant select, insert, update, delete on public.agents to authenticated;
grant select, insert, delete on public.sessions to authenticated;
grant select on public.api_key_audit to authenticated;
grant execute on function public.find_agent_by_prefix(text) to authenticated;
```

---

## 검증 — 모두 실행 후

```sql
-- 1) RLS 상태 확인
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('users', 'agents', 'sessions', 'api_key_audit')
order by tablename;
-- 기대 결과: 4개 모두 rowsecurity = t

-- 2) 새 테이블 목록 확인
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('users', 'agents', 'sessions', 'api_key_audit')
order by tablename;
-- 기대 결과: 4개 행 반환

-- 3) helper 함수 확인
select proname from pg_proc where proname = 'find_agent_by_prefix';
-- 기대 결과: 1개 행 반환
```

## 자주 발생하는 에러

| 에러                                   | 원인                         | 해결                                      |
| -------------------------------------- | ---------------------------- | ----------------------------------------- |
| `permission denied for table users`    | RLS는 켜졌지만 policy가 없음 | 블록 4를 다시 실행                        |
| `policy "X" already exists`            | 이전 실행의 잔여             | 무시 (drop policy if exists로 정리됨)     |
| `relation "auth.users" does not exist` | Supabase Auth 비활성         | Authentication > Providers > Email 활성화 |
| 첫 줄만 실행되고 "trailing junk"       | SQL Editor가 partial paste   | **방법 B (5 블록)** 로 전환               |
