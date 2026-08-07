-- Starter production schema for GLOAT.
-- Use Supabase Auth for secure passwords; do not store password hashes in application tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  role text not null default 'member' check (role in ('member','admin')),
  email_opt_in boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.league_state (
  id bigint primary key default 1 check (id = 1),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.league_state enable row level security;
alter table public.announcements enable row level security;

create policy "authenticated profiles readable" on public.profiles for select to authenticated using (true);
create policy "users update own preferences" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "authenticated league state readable" on public.league_state for select to authenticated using (true);
create policy "admins update league state" on public.league_state for all to authenticated
using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));
create policy "announcements readable" on public.announcements for select to authenticated using (true);
create policy "admins write announcements" on public.announcements for all to authenticated
using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

-- Create a profile automatically after Supabase Auth signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name','Player'),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    case when not exists(select 1 from public.profiles) then 'admin' else 'member' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
