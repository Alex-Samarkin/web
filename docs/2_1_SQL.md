@_Alex_123456789_@
Medic2

https://hmnlpyxkbjjlanrpsvdz.supabase.co

sb_publishable_yZRF92Uafm43MsRsNRE4HQ_9kL9soyN

postgresql://postgres:@_Alex_123456789_@@db.hmnlpyxkbjjlanrpsvdz.supabase.co:5432/postgres

supabase login
supabase init
supabase link --project-ref hmnlpyxkbjjlanrpsvdz

NEXT_PUBLIC_SUPABASE_URL=https://hmnlpyxkbjjlanrpsvdz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_yZRF92Uafm43MsRsNRE4HQ_9kL9soyN

# Этап 2.1. Схема базы данных

**Файл документа:** `docs/stages/stage_02_1_schema.md`
**Файл сценария:** `supabase/sql/02_1_schema.sql`
**Основание:** ТЗ v1.0, разделы 3, 6 (S1, S2), 9 (D4)

---

## 1. Цель и результат этапа

Создать структуру данных предметной области: пять таблиц, перечисление ролей,
ограничения целостности и индексы. Дополнительно — сразу закрыть доступ к новым
таблицам для ролей `anon` и `authenticated`, чтобы схема не оказалась открытой
в период между этапами.

**Результат:** в проекте Supabase существуют таблицы `doctors`, `patients`,
`analyses`, `assignments`, `app_users`; внешних ключей — 7; прав чтения у
клиентских ролей нет.

**Чего на этом этапе нет:** данных, учётных записей, политик RLS, представлений.
Это этапы 2.2–2.7.

---

## 2. Предварительные условия

1. Создан облачный проект Supabase (регион — ближайший, тариф Free).
2. Открыт раздел **SQL Editor** → **New query**.
3. Локально создан каталог `supabase/sql/` в репозитории `clinic-access-demo`.

Все команды выполняются в SQL Editor от имени роли `postgres`. Локальный стек
и Supabase CLI не используются.

---

## 3. Проектные решения и их обоснование

| Решение | Обоснование |
|---|---|
| Назначение вынесено в `assignments`, а не в поле `patients.doctor_id` | Администратор управляет назначением, не имея права изменять строку пациента. Ограничение `unique (patient_id)` задаёт связь 1:N: у пациента один действующий врач, у врача — много пациентов. |
| Профиль вынесен в `app_users`, а не в метаданные токена | Таблица недоступна пользователю на запись, поэтому роль нельзя повысить самостоятельно. Поле `user_metadata` в проверках доступа не участвует (ТЗ, S3). |
| Роль — перечисление `user_role` | Исключает опечатки и «самодельные» роли; список ролей фиксирован схемой. |
| Идентфикаторы — `uuid` | Значения не перечислимы последовательным подбором; в сценарии наполнения (2.2) будут заданы явно и детерминированно. |
| `on delete restrict` для связей с пациентами и врачами | Данные фиксированные; случайное удаление справочной записи не должно уничтожать анализы и назначения. |
| Естественный ключ `analyses (patient_id, analysis_type, performed_at)` | Обеспечивает повторную безопасную загрузку фиксированного набора (ТЗ, D4). |
| Частичные уникальные индексы в `app_users` | Одна учётная запись на одного врача и на одного пациента; требование «один пользователь — одна роль». |
| Немедленный отзыв привилегий | В Supabase новые таблицы схемы `public` автоматически получают широкие права для `anon` и `authenticated`. До этапа 2.4 доступ должен быть закрыт. |

---

## 4. Пошаговое выполнение

Каждый блок выполняется отдельно, в указанном порядке. Блоки идемпотентны:
повторный запуск не приводит к ошибке. Полный текст без проверок и отката
сохраняется в `supabase/sql/02_1_schema.sql`.

### Шаг 2.1.1. Перечисление ролей

Тип создаётся только при отсутствии — конструкция `create type` не поддерживает
`if not exists`, поэтому используется проверка системного каталога.

```sql
-- Роль приложения. Порядок значений соответствует ТЗ, раздел 2.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role'
      and n.nspname = 'public'
  ) then
    create type public.user_role as enum (
      'admin',            -- администратор: сопоставление врачей и пациентов
      'doctor',           -- врач: чтение своих пациентов
      'patient',          -- пациент: чтение своей карточки
      'hr_manager',       -- заглушка: CRUD врачей
      'patient_manager',  -- заглушка: CRUD пациентов
      'lab_manager'       -- заглушка: CRUD анализов
    );
  end if;
end
$$;
```

### Шаг 2.1.2. Справочник врачей

Функция `gen_random_uuid()` встроена в PostgreSQL начиная с версии 13, расширение
не требуется. Проверки `btrim` запрещают пустые и пробельные фамилии: администратор
работает именно с фамилиями, и пустое значение сделало бы список непригодным.

```sql
create table if not exists public.doctors (
  id          uuid primary key default gen_random_uuid(),
  last_name   text not null,
  first_name  text not null,
  middle_name text,
  specialty   text not null,
  cabinet     text,
  created_at  timestamptz not null default now(),

  constraint doctors_last_name_not_empty  check (length(btrim(last_name))  > 0),
  constraint doctors_first_name_not_empty check (length(btrim(first_name)) > 0)
);

-- Сортировка списка фамилий в разделе администратора.
create index if not exists doctors_last_name_idx
  on public.doctors (last_name);

comment on table public.doctors is
  'Справочник врачей. Администратору доступна только фамилия (представление admin_doctors, этап 2.7).';
```

### Шаг 2.1.3. Личные данные пациентов

Формат полиса — 16 цифр, телефон — в виде `+7XXXXXXXXXX`. Ограничение на дату
рождения задано константой: проверки с `current_date` неизменяемыми не являются
и создают проблемы при восстановлении дампа.

```sql
create table if not exists public.patients (
  id            uuid primary key default gen_random_uuid(),
  last_name     text not null,
  first_name    text not null,
  middle_name   text,
  birth_date    date not null,
  sex           text not null,
  policy_number text not null,
  phone         text,
  address       text,
  created_at    timestamptz not null default now(),

  constraint patients_last_name_not_empty  check (length(btrim(last_name))  > 0),
  constraint patients_first_name_not_empty check (length(btrim(first_name)) > 0),
  constraint patients_birth_date_valid     check (birth_date >= date '1900-01-01'),
  constraint patients_sex_valid            check (sex in ('М', 'Ж')),
  constraint patients_policy_format        check (policy_number ~ '^[0-9]{16}$'),
  constraint patients_phone_format         check (phone is null or phone ~ '^\+7[0-9]{10}$'),
  constraint patients_policy_unique        unique (policy_number)
);

create index if not exists patients_last_name_idx
  on public.patients (last_name);

comment on table public.patients is
  'Личные данные пациентов. Пациент видит только свою строку; врач — строки назначенных пациентов; администратор — только фамилии.';
```

### Шаг 2.1.4. Результаты анализов

Референсный интервал хранится текстом (например, `3.9–5.8`): в демонстрационном
наборе он не используется в вычислениях, а раздельные числовые границы усложнили
бы сценарий наполнения без учебной пользы.

```sql
create table if not exists public.analyses (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null,
  analysis_type   text not null,
  performed_at    date not null,
  result_value    numeric(10, 2) not null,
  unit            text not null,
  reference_range text not null,
  created_at      timestamptz not null default now(),

  constraint analyses_patient_fk foreign key (patient_id)
    references public.patients (id) on delete restrict,

  constraint analyses_type_not_empty     check (length(btrim(analysis_type)) > 0),
  constraint analyses_result_not_negative check (result_value >= 0),

  -- Естественный ключ: защита от дублей при повторной загрузке (этап 2.2).
  constraint analyses_natural_key unique (patient_id, analysis_type, performed_at)
);

-- Основной сценарий чтения: анализы конкретного пациента в обратном порядке дат.
create index if not exists analyses_patient_idx
  on public.analyses (patient_id, performed_at desc);

comment on table public.analyses is
  'Результаты анализов. Доступны только врачу, назначенному пациенту. Пациенту и администратору недоступны.';
```

### Шаг 2.1.5. Назначения «врач — пациент»

Ограничение `unique (patient_id)` — смысловое ядро модели: один действующий врач
на пациента. На этапе 3.5 оно позволит администратору выполнять переназначение
одной операцией `insert ... on conflict (patient_id) do update`.

Поле `assigned_by` заполняется значением `auth.uid()` по умолчанию: в приложении
его передавать не нужно, а при выполнении сценария в SQL Editor оно останется
пустым, что корректно — там нет пользовательского сеанса.

```sql
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null,
  doctor_id   uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid default auth.uid(),

  constraint assignments_patient_fk foreign key (patient_id)
    references public.patients (id) on delete restrict,
  constraint assignments_doctor_fk foreign key (doctor_id)
    references public.doctors (id) on delete restrict,
  constraint assignments_author_fk foreign key (assigned_by)
    references auth.users (id) on delete set null,

  -- Один действующий врач на пациента; врач может иметь много пациентов.
  constraint assignments_one_doctor_per_patient unique (patient_id)
);

-- Основной сценарий чтения: пациенты конкретного врача.
create index if not exists assignments_doctor_idx
  on public.assignments (doctor_id);

comment on table public.assignments is
  'Действующие назначения. История не ведётся: переназначение заменяет врача.';
comment on column public.assignments.assigned_by is
  'Администратор, создавший назначение; заполняется значением auth.uid().';
```

### Шаг 2.1.6. Профили пользователей и роли

Таблица связывает учётную запись Supabase Auth с ролью и предметной сущностью.
Ограничение `app_users_role_entity_match` не позволяет создать противоречивый
профиль: например, роль `patient` без ссылки на пациента или роль `admin`
с привязкой к врачу.

```sql
create table if not exists public.app_users (
  user_id    uuid primary key,
  role       public.user_role not null,
  doctor_id  uuid,
  patient_id uuid,
  created_at timestamptz not null default now(),

  constraint app_users_user_fk foreign key (user_id)
    references auth.users (id) on delete cascade,
  constraint app_users_doctor_fk foreign key (doctor_id)
    references public.doctors (id) on delete restrict,
  constraint app_users_patient_fk foreign key (patient_id)
    references public.patients (id) on delete restrict,

  constraint app_users_role_entity_match check (
    (role = 'doctor'  and doctor_id  is not null and patient_id is null) or
    (role = 'patient' and patient_id is not null and doctor_id  is null) or
    (role in ('admin', 'hr_manager', 'patient_manager', 'lab_manager')
       and doctor_id is null and patient_id is null)
  )
);

-- Одна учётная запись на врача и одна — на пациента.
create unique index if not exists app_users_one_account_per_doctor
  on public.app_users (doctor_id) where doctor_id is not null;

create unique index if not exists app_users_one_account_per_patient
  on public.app_users (patient_id) where patient_id is not null;

comment on table public.app_users is
  'Профиль: роль и привязка к врачу или пациенту. Источник роли для политик доступа. Пользователю запись запрещена.';
```

### Шаг 2.1.7. Защитный контур на период разработки

По умолчанию Supabase выдаёт ролям `anon` и `authenticated` полные права на новые
объекты схемы `public`. Пока политики RLS не созданы (этап 2.4), это означало бы
полностью открытые таблицы для любого держателя публичного ключа. Поэтому права
отзываются немедленно.

Право `usage` на схему `public` сохраняется — оно потребуется на этапе 2.4, где
привилегии будут выданы адресно.

```sql
-- Отзыв прав на уже созданные объекты.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Отзыв прав на объекты, которые будут созданы позднее ролью postgres.
-- Начиная с этого момента любая выдача прав выполняется явно (этапы 2.4 и 2.7).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
```

> Примечание. Права роли `service_role` не изменяются. Эта роль обходит RLS,
> поэтому в приложении она использоваться не будет (ТЗ, S4).

---

## 5. Проверка результата

Проверки выполняются в SQL Editor после шага 2.1.7.

### 5.1. Состав схемы

```sql
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

Ожидается 5 строк: `analyses`, `app_users`, `assignments`, `doctors`, `patients`.

### 5.2. Перечень ролей

```sql
select unnest(enum_range(null::public.user_role)) as role;
```

Ожидается 6 строк в порядке объявления.

### 5.3. Внешние ключи

```sql
select conrelid::regclass as table_name,
       conname           as constraint_name,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
order by 1, 2;
```

Ожидается 7 строк:

| Таблица | Ссылка |
|---|---|
| `analyses` | `patients` |
| `app_users` | `auth.users`, `doctors`, `patients` |
| `assignments` | `patients`, `doctors`, `auth.users` |

### 5.4. Уникальность и индексы

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

Контролируются: `assignments_one_doctor_per_patient`, `analyses_natural_key`,
`patients_policy_unique`, два частичных индекса `app_users_one_account_per_*`.

### 5.5. Закрытость таблиц (ключевая проверка этапа)

```sql
select t.table_name,
       has_table_privilege('anon',          'public.' || t.table_name, 'select') as anon_can_select,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'select') as authenticated_can_select
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;
```

Ожидается 5 строк, во всех — `false` и `false`. Если хотя бы одно значение `true`,
шаг 2.1.7 выполнен не полностью; повторите его перед переходом далее.

---

## 6. Откат этапа (только при необходимости)

Порядок удаления обратен порядку создания: сначала зависимые таблицы.
Команда уничтожает данные, применять осознанно.

```sql
drop table if exists public.app_users;
drop table if exists public.assignments;
drop table if exists public.analyses;
drop table if exists public.patients;
drop table if exists public.doctors;
drop type  if exists public.user_role;
```

Если таблица была создана ранее в ином составе, `create table if not exists`
её не изменит: в этом случае выполняется откат и повторное прохождение этапа.

---

## 7. Фиксация в репозитории

```bash
git add supabase/sql/02_1_schema.sql docs/stages/stage_02_1_schema.md
git commit -m "stage 2.1: database schema, constraints, indexes, deny-by-default grants"
```

Выгрузка в GitHub выполняется вручную. Приложение на этом этапе ещё не создано,
сборка Vercel не требуется.

---

## 8. Критерии готовности этапа

1. Проверки 5.1–5.4 дают ожидаемые состав и количество объектов.
2. Проверка 5.5 возвращает только `false`.
3. Файл сценария сохранён в репозитории и закоммичен.

**Следующий этап — 2.2: наполнение фиксированными данными (4 врача, 8 пациентов,
24 анализа) с детерминированными идентификаторами и безопасным повторным запуском.**
Переход — после подтверждения готовности.