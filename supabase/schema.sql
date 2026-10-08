-- Run in the Supabase SQL editor. This is safe to rerun and does not drop data.
-- Existing records without an owner are never silently assigned to an account.
begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default '',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles alter column id set not null;

create table if not exists public.songs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    title text not null check (length(trim(title)) between 1 and 200),
    artist text not null check (length(trim(artist)) between 1 and 200),
    language text not null default 'English',
    original_key text check (original_key is null or original_key in (
        'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb',
        'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'
    )),
    chart text not null check (length(trim(chart)) > 0),
    url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Upgrade a pre-existing songs table in place. Legacy "key" values are copied
-- to original_key below when that column exists.
alter table public.songs add column if not exists id uuid default gen_random_uuid();
alter table public.songs add column if not exists user_id uuid;
alter table public.songs add column if not exists title text;
alter table public.songs add column if not exists artist text;
alter table public.songs add column if not exists language text not null default 'English';
alter table public.songs add column if not exists original_key text;
alter table public.songs add column if not exists chart text;
alter table public.songs add column if not exists url text;
alter table public.songs add column if not exists created_at timestamptz not null default now();
alter table public.songs add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'songs_language_check' and conrelid = 'public.songs'::regclass
    ) then
        alter table public.songs add constraint songs_language_check
            check (language in ('Tagalog', 'English')) not valid;
    end if;
end;
$$;
alter table public.songs validate constraint songs_language_check;

create table if not exists public.worship_sets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    name text not null check (length(trim(name)) between 1 and 160),
    description text not null default '',
    service_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.worship_sets add column if not exists id uuid default gen_random_uuid();
alter table public.worship_sets add column if not exists user_id uuid;
alter table public.worship_sets add column if not exists name text;
alter table public.worship_sets add column if not exists description text not null default '';
alter table public.worship_sets add column if not exists service_date date;
alter table public.worship_sets add column if not exists created_at timestamptz not null default now();
alter table public.worship_sets add column if not exists updated_at timestamptz not null default now();

create table if not exists public.set_musicians (
    set_id uuid not null references public.worship_sets (id) on delete cascade,
    position text not null check (position in (
        'Bass Guitar', 'Acoustic Guitar', 'Lead Guitar', 'Keyboard', 'Drums'
    )),
    musician text not null check (length(trim(musician)) between 1 and 160),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (set_id, position)
);

create table if not exists public.set_songs (
    id uuid primary key default gen_random_uuid(),
    set_id uuid not null references public.worship_sets (id) on delete cascade,
    song_id uuid not null references public.songs (id) on delete cascade,
    position integer not null check (position >= 0),
    performance_key text,
    created_at timestamptz not null default now(),
    constraint set_songs_unique_song unique (set_id, song_id)
);

alter table public.set_songs add column if not exists id uuid default gen_random_uuid();
alter table public.set_songs add column if not exists set_id uuid;
alter table public.set_songs add column if not exists song_id uuid;
alter table public.set_songs add column if not exists position integer;
alter table public.set_songs add column if not exists performance_key text;
alter table public.set_songs add column if not exists created_at timestamptz not null default now();

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = 'songs' and column_name = 'key'
    ) then
        execute 'update public.songs set original_key = "key" where original_key is null and "key" is not null';
    end if;
end;
$$;

-- Backfill profile rows for accounts that already own rows in either table.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
where exists (select 1 from public.songs s where s.user_id = u.id)
   or exists (select 1 from public.worship_sets ws where ws.user_id = u.id)
on conflict (id) do nothing;

do $$
begin
    if exists (select 1 from public.songs where user_id is null) then
        raise exception 'Existing songs have no user_id. Assign those rows to their owner before rerunning this schema; no data was changed.';
    end if;
    if exists (select 1 from public.worship_sets where user_id is null) then
        raise exception 'Existing worship sets have no user_id. Assign those rows to their owner before rerunning this schema; no data was changed.';
    end if;
    if exists (
        select 1 from public.songs
        where title is null or length(trim(title)) = 0
           or artist is null or length(trim(artist)) = 0
           or chart is null or length(trim(chart)) = 0
    ) then
        raise exception 'Existing songs are missing a title, artist, or chart. Fill those fields before rerunning this schema; no data was changed.';
    end if;
    if exists (
        select 1 from public.worship_sets
        where name is null or length(trim(name)) = 0
    ) then
        raise exception 'Existing worship sets are missing a name. Fill that field before rerunning this schema; no data was changed.';
    end if;
    if exists (
        select 1 from public.set_songs
        where set_id is null or song_id is null or position is null or position < 0
    ) then
        raise exception 'Existing set-song links have incomplete data. Repair them before rerunning this schema; no data was changed.';
    end if;
end;
$$;

alter table public.songs alter column id set not null;
alter table public.songs alter column user_id set not null;
alter table public.songs alter column title set not null;
alter table public.songs alter column artist set not null;
alter table public.songs alter column chart set not null;
alter table public.songs alter column created_at set default now();
alter table public.songs alter column updated_at set default now();

alter table public.worship_sets alter column id set not null;
alter table public.worship_sets alter column user_id set not null;
alter table public.worship_sets alter column name set not null;
alter table public.worship_sets alter column description set default '';
alter table public.worship_sets alter column created_at set default now();
alter table public.worship_sets alter column updated_at set default now();

alter table public.set_songs alter column id set not null;
alter table public.set_songs alter column set_id set not null;
alter table public.set_songs alter column song_id set not null;
alter table public.set_songs alter column position set not null;
alter table public.set_songs alter column created_at set default now();

do $$
begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'p') then
        alter table public.profiles add constraint profiles_pkey primary key (id);
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.songs'::regclass and contype = 'p') then
        alter table public.songs add constraint songs_pkey primary key (id);
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.worship_sets'::regclass and contype = 'p') then
        alter table public.worship_sets add constraint worship_sets_pkey primary key (id);
    end if;
    if not exists (select 1 from pg_constraint where conrelid = 'public.set_songs'::regclass and contype = 'p') then
        alter table public.set_songs add constraint set_songs_pkey primary key (id);
    end if;
end;
$$;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'songs_user_id_fkey' and conrelid = 'public.songs'::regclass) then
        alter table public.songs add constraint songs_user_id_fkey
            foreign key (user_id) references public.profiles (id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'worship_sets_user_id_fkey' and conrelid = 'public.worship_sets'::regclass) then
        alter table public.worship_sets add constraint worship_sets_user_id_fkey
            foreign key (user_id) references public.profiles (id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'set_songs_set_id_fkey' and conrelid = 'public.set_songs'::regclass) then
        alter table public.set_songs add constraint set_songs_set_id_fkey
            foreign key (set_id) references public.worship_sets (id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'set_songs_song_id_fkey' and conrelid = 'public.set_songs'::regclass) then
        alter table public.set_songs add constraint set_songs_song_id_fkey
            foreign key (song_id) references public.songs (id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'set_songs_unique_song' and conrelid = 'public.set_songs'::regclass) then
        alter table public.set_songs add constraint set_songs_unique_song unique (set_id, song_id);
    end if;
end;
$$;

create index if not exists songs_user_id_idx on public.songs (user_id);
create index if not exists songs_title_search_idx on public.songs (user_id, lower(title));
create index if not exists songs_artist_search_idx on public.songs (user_id, lower(artist));
create index if not exists worship_sets_user_id_idx on public.worship_sets (user_id);
create index if not exists set_songs_set_position_idx on public.set_songs (set_id, position);
create index if not exists set_songs_song_id_idx on public.set_songs (song_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists songs_updated_at on public.songs;
create trigger songs_updated_at before update on public.songs
for each row execute function public.set_updated_at();
drop trigger if exists worship_sets_updated_at on public.worship_sets;
create trigger worship_sets_updated_at before update on public.worship_sets
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.worship_sets enable row level security;
alter table public.set_songs enable row level security;
alter table public.set_musicians enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users manage their songs" on public.songs;
create policy "Users manage their songs" on public.songs
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their worship sets" on public.worship_sets;
create policy "Users manage their worship sets" on public.worship_sets
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage musicians in their sets" on public.set_musicians;
create policy "Users manage musicians in their sets" on public.set_musicians
for all to authenticated
using (
    exists (
        select 1 from public.worship_sets ws
        where ws.id = set_musicians.set_id and ws.user_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1 from public.worship_sets ws
        where ws.id = set_musicians.set_id and ws.user_id = (select auth.uid())
    )
);

drop policy if exists "Users manage songs in their sets" on public.set_songs;
create policy "Users manage songs in their sets" on public.set_songs
for all to authenticated
using (
    exists (
        select 1 from public.worship_sets ws
        where ws.id = set_songs.set_id and ws.user_id = (select auth.uid())
    )
    and exists (
        select 1 from public.songs s
        where s.id = set_songs.song_id and s.user_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1 from public.worship_sets ws
        where ws.id = set_songs.set_id and ws.user_id = (select auth.uid())
    )
    and exists (
        select 1 from public.songs s
        where s.id = set_songs.song_id and s.user_id = (select auth.uid())
    )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.worship_sets to authenticated;
grant select, insert, update, delete on public.set_musicians to authenticated;
grant select, insert, update, delete on public.set_songs to authenticated;
grant select, update on public.profiles to authenticated;

commit;
