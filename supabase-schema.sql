-- Схема базы данных для приложения "Мои ученики".
-- Скопируй ВЕСЬ этот файл и выполни в Supabase: SQL Editor -> New query -> вставить -> Run.

create table students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  price_per_lesson numeric not null default 0,
  created_at timestamptz default now()
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_date date not null,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payment_date date not null,
  amount numeric not null,
  comment text,
  created_at timestamptz default now()
);

alter table students enable row level security;
alter table lessons enable row level security;
alter table payments enable row level security;

create policy "own students" on students for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own lessons" on lessons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own payments" on payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
