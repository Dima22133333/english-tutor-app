-- Міграція №3: тривалість уроку + регулярний графік занять.
-- Виконати в Supabase: SQL Editor -> очистити поле -> вставити -> Run.

alter table lessons add column if not exists duration_minutes int;

create table if not exists schedule_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  slot_time time not null,
  duration_minutes int not null default 60,
  created_at timestamptz default now()
);

alter table schedule_slots enable row level security;

create policy "own schedule slots" on schedule_slots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
