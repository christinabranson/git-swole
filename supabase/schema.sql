create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key,
  units text not null default 'lb',
  weight_increment numeric not null default 5,
  rest_timer_seconds integer not null default 90,
  barbell_weight numeric not null default 45,
  plate_inventory jsonb not null default '[]'::jsonb,
  workout_groups jsonb not null default '[]'::jsonb,
  workout_a_exercise_ids text[] not null default array['squat', 'bench_press', 'barbell_row'],
  workout_b_exercise_ids text[] not null default array['squat', 'overhead_press', 'deadlift'],
  -- Legacy key slots kept temporarily for backward compatibility.
  workout_a_exercises text[] not null default array['squat', 'bench_press', 'barbell_row'],
  workout_b_exercises text[] not null default array['squat', 'overhead_press', 'deadlift'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progression (
  user_id text primary key references public.users(id) on delete cascade,
  next_workout_type text not null default 'A',
  current_weights jsonb not null,
  fail_streaks jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  date timestamptz not null,
  workout_type text not null,
  note text
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid,
  exercise_key text,
  exercise_name text,
  set_number integer not null,
  reps integer not null,
  weight numeric not null,
  completed boolean not null default true
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text not null,
  movement_pattern text not null,
  description text not null,
  is_global boolean not null default false,
  created_by text references public.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_sets
  add column if not exists exercise_id uuid;
alter table public.workout_sets
  add column if not exists exercise_name text;
alter table public.users
  add column if not exists workout_a_exercise_ids text[] not null default array['squat', 'bench_press', 'barbell_row'];
alter table public.users
  add column if not exists workout_b_exercise_ids text[] not null default array['squat', 'overhead_press', 'deadlift'];
alter table public.users
  add column if not exists workout_groups jsonb not null default '[]'::jsonb;
alter table public.users
  add column if not exists plate_inventory jsonb not null default '[]'::jsonb;
alter table public.users
  add column if not exists rest_after_miss_seconds integer not null default 300;
alter table public.workouts
  add column if not exists duration_seconds integer;

update public.users
set
  workout_a_exercise_ids = coalesce(workout_a_exercise_ids, workout_a_exercises, array['squat', 'bench_press', 'barbell_row']),
  workout_b_exercise_ids = coalesce(workout_b_exercise_ids, workout_b_exercises, array['squat', 'overhead_press', 'deadlift'])
where workout_a_exercise_ids is null
   or workout_b_exercise_ids is null;

update public.users
set workout_groups = jsonb_build_array(
  jsonb_build_object(
    'id', 'workout-a',
    'name', 'Workout A',
    'exercises', coalesce(
      (
        select jsonb_agg(jsonb_build_object('exerciseId', exercise_id, 'sets', 5, 'reps', 5))
        from unnest(coalesce(workout_a_exercise_ids, array['squat', 'bench_press', 'barbell_row'])) as exercise_id
      ),
      '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'id', 'workout-b',
    'name', 'Workout B',
    'exercises', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'exerciseId',
            exercise_id,
            'sets',
            case when ordinality = 3 and exercise_id = 'deadlift' then 1 else 5 end,
            'reps',
            5
          )
        )
        from unnest(coalesce(workout_b_exercise_ids, array['squat', 'overhead_press', 'deadlift'])) with ordinality as t(exercise_id, ordinality)
      ),
      '[]'::jsonb
    )
  )
)
where workout_groups = '[]'::jsonb;

update public.users
set plate_inventory = jsonb_build_array(
  jsonb_build_object('weight', 45, 'pairs', 99),
  jsonb_build_object('weight', 35, 'pairs', 99),
  jsonb_build_object('weight', 25, 'pairs', 99),
  jsonb_build_object('weight', 10, 'pairs', 99),
  jsonb_build_object('weight', 5, 'pairs', 99),
  jsonb_build_object('weight', 2.5, 'pairs', 99)
)
where plate_inventory = '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_units_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_units_check check (units in ('lb', 'kg'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_weight_increment_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_weight_increment_check check (weight_increment in (2.5, 5, 10));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_rest_timer_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_rest_timer_check check (rest_timer_seconds > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_barbell_weight_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_barbell_weight_check check (barbell_weight >= 0);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'progression_workout_type_check'
      and conrelid = 'public.progression'::regclass
  ) then
    alter table public.progression
      drop constraint progression_workout_type_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'workouts_type_check'
      and conrelid = 'public.workouts'::regclass
  ) then
    alter table public.workouts
      drop constraint workouts_type_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_reps_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_reps_check check (reps >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_weight_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_weight_check check (weight >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_set_number_check'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_set_number_check check (set_number > 0);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workout_sets'
      and column_name = 'exercise_key'
      and is_nullable = 'NO'
  ) then
    alter table public.workout_sets
      alter column exercise_key drop not null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_exercise_id_fkey'
      and conrelid = 'public.workout_sets'::regclass
  ) then
    alter table public.workout_sets
      add constraint workout_sets_exercise_id_fkey
      foreign key (exercise_id) references public.exercises(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercises_owner_global_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises
      add constraint exercises_owner_global_check check (
        (is_global = true and created_by is null) or
        (is_global = false and created_by is not null)
      );
  end if;
end
$$;

drop index if exists workout_sets_unique_set;
create unique index workout_sets_unique_set
  on public.workout_sets (workout_id, coalesce(exercise_id::text, exercise_key, exercise_name), set_number);

create index if not exists workouts_user_date_idx
  on public.workouts (user_id, date desc);

create index if not exists workout_sets_workout_idx
  on public.workout_sets (workout_id);

create index if not exists exercises_global_idx
  on public.exercises (is_global, is_active, name);

create index if not exists exercises_owner_idx
  on public.exercises (created_by, is_active, name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_progression_updated_at on public.progression;
create trigger trg_progression_updated_at
before update on public.progression
for each row execute function public.set_updated_at();

drop trigger if exists trg_exercises_updated_at on public.exercises;
create trigger trg_exercises_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.progression enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.exercises enable row level security;

drop policy if exists "owner read users" on public.users;
drop policy if exists "owner write users" on public.users;
drop policy if exists "owner progression" on public.progression;
drop policy if exists "owner workouts" on public.workouts;
drop policy if exists "owner workout_sets" on public.workout_sets;
drop policy if exists "read exercises" on public.exercises;
drop policy if exists "insert user exercises" on public.exercises;
drop policy if exists "update user exercises" on public.exercises;
drop policy if exists "delete user exercises" on public.exercises;

create policy "owner read users" on public.users
  for select using ((auth.jwt()->>'sub') = id);
create policy "owner write users" on public.users
  for all using ((auth.jwt()->>'sub') = id)
  with check ((auth.jwt()->>'sub') = id);

create policy "owner progression" on public.progression
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

create policy "owner workouts" on public.workouts
  for all using ((auth.jwt()->>'sub') = user_id)
  with check ((auth.jwt()->>'sub') = user_id);

create policy "owner workout_sets" on public.workout_sets
  for all using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = (auth.jwt()->>'sub')
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_id and w.user_id = (auth.jwt()->>'sub')
    )
  );

create policy "read exercises" on public.exercises
  for select using (
    is_active = true and (
      is_global = true or created_by = (auth.jwt()->>'sub')
    )
  );

create policy "insert user exercises" on public.exercises
  for insert with check (
    is_global = false and created_by = (auth.jwt()->>'sub')
  );

create policy "update user exercises" on public.exercises
  for update using (is_global = false and created_by = (auth.jwt()->>'sub'))
  with check (is_global = false and created_by = (auth.jwt()->>'sub'));

create policy "delete user exercises" on public.exercises
  for delete using (is_global = false and created_by = (auth.jwt()->>'sub'));
