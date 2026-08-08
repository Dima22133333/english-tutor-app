-- Міграція №2: групові заняття + час уроку.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.
-- Безпечно для існуючих даних: тільки додає нові стовпці/таблицю, нічого не видаляє.

alter table students add column if not exists is_group boolean not null default false;

alter table lessons add column if not exists lesson_time time;

create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references students(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (group_id, student_id)
);

alter table group_members enable row level security;

create policy "own group members" on group_members for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
