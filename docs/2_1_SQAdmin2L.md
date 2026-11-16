# Этап 2.7. Администратор: фамилии и управление назначениями

**Файл документа:** `docs/stages/stage_02_7_admin.md`
**Файл сценария:** `supabase/sql/02_7_admin.sql`
**Основание:** ТЗ v1.0, раздел 4 (матрица доступа), 5 (F3), 6 (S1, S7 с уточнением)

---

## 1. Цель и результат этапа

Предоставить администратору ровно два возможности:

1. видеть **только фамилии** врачей и пациентов (и технические идентификаторы);
2. управлять назначениями — читать, создавать, переназначать, удалять.

**Результат:** администратор получает 8 фамилий пациентов, 4 фамилии врачей
и 5 действующих назначений. Персональные данные (дата рождения, полис, телефон,
адрес) и анализы ему недоступны: обращения к базовым таблицам `patients`,
`doctors`, `analyses` возвращают ноль строк.

---

## 2. Предварительные условия

1. Этап 2.6 выполнен, проверки 5.1–5.7 пройдены.
2. Профиль администратора создан: `clinic.admin@example.com`, роль `admin`.
3. Открыт **SQL Editor** проекта Supabase.

---

## 3. Проектные решения и их обоснование

### 3.1. Почему ограничение по столбцам решается представлением

Все пользователи приложения работают под одной ролью базы данных
`authenticated`. Столбцовые привилегии (`grant select (last_name) ...`) различают
роли БД, но не роли приложения: выдав их, мы одновременно лишили бы врача доступа
к полной карточке. Поэтому состав столбцов ограничивается **проекцией
представления**, а не привилегиями.

### 3.2. Почему представления администратора выполняются с правами владельца

Администратор не имеет политик на базовые таблицы `patients` и `doctors`,
следовательно, при режиме `security_invoker` представление вернуло бы ему ноль
строк. Чтобы показать фамилии, не открывая самих таблиц, представление создаётся
с правами владельца и **обязательной проверкой роли внутри запроса**.

| Решение | Обоснование |
|---|---|
| `security_invoker = false` | Представление читает базовые таблицы от имени владельца. Это осознанное исключение из общего правила. |
| Условие `where public.current_app_role() = 'admin'` | Единственный барьер внутри представления. Без него фамилии стали бы доступны всем, у кого есть право чтения представления. Условие обязательно во всех трёх представлениях. |
| `security_barrier = true` | Условия представления вычисляются раньше выражений, переданных вызывающей стороной. Это исключает обход фильтра сторонними выражениями в запросе. |
| Право чтения представлений — только `authenticated` | Роль `anon` не получает ничего; для пользователя без профиля проверка роли даёт пустое значение и ноль строк. |
| Проекция `admin_patients` и `admin_doctors` — только `id`, `last_name` | Идентификатор необходим для операции назначения; иных персональных данных в проекции нет. |
| Политики на `assignments` — четыре, по командам | Администратор управляет назначениями; врач читает свои (этап 2.6); пациент не имеет доступа. Раздельные политики делают правило читаемым и проверяемым. |
| Политики `select` + `insert` + `update` одновременно | Переназначение выполняется операцией `insert ... on conflict (patient_id) do update`. Для неё нужны все три политики: чтение конфликтующей строки, вставка и изменение. |
| Таблица `assignments` читается администратором напрямую | Она содержит идентификаторы и отметки времени, но не содержит персональных данных. Фамилии для отображения берутся из представления. |

### 3.3. Уточнение к ТЗ (подлежит внесению в `docs/TZ.md`)

Пункт **S7** изложить в следующей редакции:

```text
S7. Представления, обращающиеся к данным от имени пользователя, создаются
в режиме security_invoker. Представления администратора (admin_patients,
admin_doctors, admin_assignments) составляют исключение: они создаются
с правами владельца, параметром security_barrier и обязательной проверкой
роли внутри запроса; проекция ограничена идентификаторами и фамилиями.
Вспомогательные функции проверки доступа объявляются SECURITY DEFINER
с фиксированным search_path.
```

---

## 4. Пошаговое выполнение

### Шаг 2.7.1. Представления фамилий

Представления пересоздаются, поэтому используется пара `drop view if exists`
и `create view`: это позволяет менять параметры и состав столбцов при повторном
прохождении этапа.

```sql
-- Фамилии пациентов: только идентификатор и фамилия.
drop view if exists public.admin_patients;

create view public.admin_patients
with (security_invoker = false, security_barrier = true)
as
select p.id,
       p.last_name
from public.patients p
where public.current_app_role() = 'admin'
order by p.last_name;

comment on view public.admin_patients is
  'Справочник фамилий пациентов для администратора. Проверка роли внутри представления обязательна.';

-- Фамилии врачей: только идентификатор и фамилия.
drop view if exists public.admin_doctors;

create view public.admin_doctors
with (security_invoker = false, security_barrier = true)
as
select d.id,
       d.last_name
from public.doctors d
where public.current_app_role() = 'admin'
order by d.last_name;

comment on view public.admin_doctors is
  'Справочник фамилий врачей для администратора. Проверка роли внутри представления обязательна.';
```

### Шаг 2.7.2. Представление действующих назначений

Соединение выполняется внутри представления: администратор получает готовые
фамилии, не имея доступа к таблицам-источникам.

```sql
drop view if exists public.admin_assignments;

create view public.admin_assignments
with (security_invoker = false, security_barrier = true)
as
select a.id          as assignment_id,
       a.patient_id,
       p.last_name   as patient_last_name,
       a.doctor_id,
       d.last_name   as doctor_last_name,
       a.assigned_at
from public.assignments a
join public.patients p on p.id = a.patient_id
join public.doctors  d on d.id = a.doctor_id
where public.current_app_role() = 'admin'
order by p.last_name;

comment on view public.admin_assignments is
  'Действующие назначения с фамилиями. Свободные пациенты в представление не попадают.';
```

> Представление содержит только действующие назначения. Пациенты без врача
> определяются сопоставлением `admin_patients` и `admin_assignments` — это будет
> использовано в интерфейсе на этапе 3.5.

### Шаг 2.7.3. Права на представления

```sql
-- Отзыв возможных дефолтных прав и адресная выдача.
revoke all on public.admin_patients, public.admin_doctors, public.admin_assignments
  from public, anon, authenticated;

grant select on public.admin_patients, public.admin_doctors, public.admin_assignments
  to authenticated;
```

### Шаг 2.7.4. Политики управления назначениями

Условие одно и то же для всех команд; обёртка `(select ...)` обеспечивает
однократное вычисление роли на запрос.

```sql
-- Чтение всех назначений.
drop policy if exists assignments_admin_select on public.assignments;
create policy assignments_admin_select
on public.assignments
for select
to authenticated
using ((select public.current_app_role()) = 'admin');

-- Создание назначения.
drop policy if exists assignments_admin_insert on public.assignments;
create policy assignments_admin_insert
on public.assignments
for insert
to authenticated
with check ((select public.current_app_role()) = 'admin');

-- Переназначение: проверяются и изменяемая строка, и её новое состояние.
drop policy if exists assignments_admin_update on public.assignments;
create policy assignments_admin_update
on public.assignments
for update
to authenticated
using      ((select public.current_app_role()) = 'admin')
with check ((select public.current_app_role()) = 'admin');

-- Снятие назначения.
drop policy if exists assignments_admin_delete on public.assignments;
create policy assignments_admin_delete
on public.assignments
for delete
to authenticated
using ((select public.current_app_role()) = 'admin');
```

---

## 5. Проверка результата

Блоки выполняются целиком; контекст задаётся до переключения роли, изменения
отменяются командой `rollback`.

### 5.1. Состав и параметры представлений

```sql
select c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;
```

Ожидается три представления; в параметрах каждого присутствуют
`security_invoker=false` и `security_barrier=true`.

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('admin_patients', 'admin_doctors', 'admin_assignments')
order by table_name, ordinal_position;
```

| Представление | Столбцы |
|---|---|
| `admin_assignments` | `assignment_id`, `patient_id`, `patient_last_name`, `doctor_id`, `doctor_last_name`, `assigned_at` |
| `admin_doctors` | `id`, `last_name` |
| `admin_patients` | `id`, `last_name` |

Иных столбцов быть не должно — это структурное подтверждение ограничения
по составу данных.

### 5.2. Состав политик

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Ожидается десять строк: `analyses` — 1, `app_users` — 1, `assignments` — 5
(одна врачебная и четыре административных), `doctors` — 1, `patients` — 2.

### 5.3. Администратор: что видно и что закрыто

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.admin@example.com'),
  true
);

set local role authenticated;

select
  public.current_app_role()                          as app_role,
  (select count(*) from public.admin_patients)       as admin_patients_rows,
  (select count(*) from public.admin_doctors)        as admin_doctors_rows,
  (select count(*) from public.admin_assignments)    as admin_assignments_rows,
  (select count(*) from public.patients)             as base_patients_rows,
  (select count(*) from public.doctors)              as base_doctors_rows,
  (select count(*) from public.analyses)             as analyses_rows,
  (select count(*) from public.assignments)          as base_assignments_rows,
  (select count(*) from public.app_users)            as app_users_rows;

rollback;
```

| Поле | Ожидаемое значение |
|---|---|
| `app_role` | `admin` |
| `admin_patients_rows` | `8` |
| `admin_doctors_rows` | `4` |
| `admin_assignments_rows` | `5` |
| `base_patients_rows` | `0` |
| `base_doctors_rows` | `0` |
| `analyses_rows` | `0` |
| `base_assignments_rows` | `5` |
| `app_users_rows` | `1` |

Сочетание «фамилий 8, персональных записей 0» — ключевой результат этапа.

### 5.4. Содержимое представлений

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.admin@example.com'),
  true
);

set local role authenticated;

select patient_last_name, doctor_last_name
from public.admin_assignments
order by patient_last_name;

rollback;
```

Ожидается пять строк: Абрамова — Соколова, Борисов — Соколова,
Васильева — Соколова, Григорьев — Ковалёв, Дмитриева — Ковалёв.

### 5.5. Управление назначениями

Три отдельные проверки. Каждая завершается отменой, поэтому исходное
распределение сохраняется.

**А. Создание назначения для свободного пациента.**

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p join auth.users u on u.id = p.user_id
   where u.email = 'clinic.admin@example.com'),
  true
);

set local role authenticated;

-- Ерохин С. В. → Никитина О. С.
insert into public.assignments (patient_id, doctor_id)
values ('22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111103');

select
  (select count(*) from public.admin_assignments) as assignments_rows,
  (select doctor_last_name from public.admin_assignments
    where patient_id = '22222222-2222-4222-8222-222222222206') as assigned_doctor,
  (select assigned_by is not null from public.assignments
    where patient_id = '22222222-2222-4222-8222-222222222206') as author_recorded;

rollback;
```

Ожидается: `6`, `Никитина`, `true`. Автор назначения записан автоматически
значением по умолчанию `auth.uid()`.

**Б. Переназначение одной операцией.**

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p join auth.users u on u.id = p.user_id
   where u.email = 'clinic.admin@example.com'),
  true
);

set local role authenticated;

-- Абрамова Е. В.: Соколова → Гаврилов.
insert into public.assignments (patient_id, doctor_id)
values ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111104')
on conflict (patient_id) do update
set doctor_id   = excluded.doctor_id,
    assigned_at = now(),
    assigned_by = auth.uid();

select
  (select count(*) from public.admin_assignments) as assignments_rows,
  (select doctor_last_name from public.admin_assignments
    where patient_id = '22222222-2222-4222-8222-222222222201') as assigned_doctor;

rollback;
```

Ожидается: `5` (дубликат не создан), `Гаврилов`.

**В. Снятие назначения.**

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p join auth.users u on u.id = p.user_id
   where u.email = 'clinic.admin@example.com'),
  true
);

set local role authenticated;

delete from public.assignments
where patient_id = '22222222-2222-4222-8222-222222222202';   -- Борисов Н. И.

select
  (select count(*) from public.admin_assignments) as assignments_rows,
  (select count(*) from public.admin_assignments
    where patient_id = '22222222-2222-4222-8222-222222222202') as borisov_rows;

rollback;
```

Ожидается: `4`, `0`.

### 5.6. Регресс: врач и пациент

Блок 5.3 выполняется для адресов `clinic.doctor1@example.com` и
`clinic.patient1@example.com`.

| Адрес | Представления (`admin_patients`, `admin_doctors`, `admin_assignments`) | Базовые таблицы (`patients`, `analyses`) |
|---|---|---|
| `clinic.doctor1` | `0, 0, 0` | `3, 9` |
| `clinic.patient1` | `0, 0, 0` | `1, 0` |

Представления не расширили доступ других ролей: проверка роли внутри них
возвращает ноль строк.

### 5.7. Анонимное обращение (необязательно)

```sql
begin;
set local role anon;
select * from public.admin_patients;
rollback;
```

Ожидается ошибка `permission denied for view admin_patients`. При необходимости
после ошибки выполните `rollback;` отдельным запросом.

---

## 6. Диагностика типовых отклонений

| Наблюдение | Вероятная причина | Действие |
|---|---|---|
| Администратор видит 0 фамилий | Не создано представление либо профиль не имеет роли `admin` | Проверить `app_users` и перечень представлений (5.1) |
| Врач или пациент видит фамилии через представление | Отсутствует условие проверки роли внутри представления | Пересоздать представления (2.7.1, 2.7.2) |
| Администратор видит дату рождения или полис | В проекцию добавлены лишние столбцы либо создана политика на `patients` | Проверить состав столбцов (5.1) и перечень политик (5.2) |
| Ошибка `new row violates row-level security policy` при назначении | Не создана политика `assignments_admin_insert` | Повторить шаг 2.7.4 |
| Переназначение создаёт вторую строку | Отсутствует ограничение уникальности либо не используется `on conflict` | Проверить `assignments_one_doctor_per_patient` (этап 2.1.5) |
| Ошибка `permission denied for view` | Не выдано право `select` роли `authenticated` | Повторить шаг 2.7.3 |

---

## 7. Откат этапа

```sql
drop policy if exists assignments_admin_delete on public.assignments;
drop policy if exists assignments_admin_update on public.assignments;
drop policy if exists assignments_admin_insert on public.assignments;
drop policy if exists assignments_admin_select on public.assignments;

drop view if exists public.admin_assignments;
drop view if exists public.admin_doctors;
drop view if exists public.admin_patients;
```

После отката администратор не видит данных и не может управлять назначениями;
доступ врача и пациента сохраняется.

---

## 8. Фиксация в репозитории

```bash
git add supabase/sql/02_7_admin.sql docs/stages/stage_02_7_admin.md docs/TZ.md
git commit -m "stage 2.7: admin surname-only views and assignment management policies"
```

В `docs/TZ.md` вносится уточнение пункта S7 (текст в п. 3.3) и отметка об
изменении редакции документа.

---

## 9. Критерии готовности этапа

1. Проверка 5.1: три представления с нужными параметрами и составом столбцов.
2. Проверка 5.2: десять политик.
3. Проверка 5.3 совпадает с таблицей ожидаемых значений, в том числе
   `base_patients_rows = 0` и `analyses_rows = 0`.
4. Проверки 5.5А–5.5В дают `6 / Никитина / true`, `5 / Гаврилов`, `4 / 0`.
5. Проверка 5.6 подтверждает неизменность доступа врача и пациента.

**Следующий этап — 2.8: роли-заглушки и сводная проверка матрицы доступа.
Подтверждается отсутствие политик для `hr_manager`, `patient_manager`,
`lab_manager`, выполняется итоговая проверка всех ролей одним сценарием,
фиксируется перечень объектов БД и вносится запись о готовности слоя данных.**
Переход — после подтверждения готовности.