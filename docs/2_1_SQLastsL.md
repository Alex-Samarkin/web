# Этап 2.8. Отложенные роли и сводная проверка слоя данных

**Файл документа:** `docs/stages/stage_02_8_summary.md`
**Файл сценария:** `supabase/sql/02_8_checks.sql`
**Заготовки на будущее:** `supabase/sql/future/stub_crud_template.sql`
**Сводка состояния:** `docs/DB_STATE.md`
**Основание:** ТЗ v1.0, разделы 2, 4, 5 (F6), 10

---

## 1. Цель и результат этапа

Завершить построение слоя данных: подтвердить, что три отложенные роли не имеют
доступа к данным, подготовить (но не применять) заготовки их будущих политик,
выполнить сводную проверку матрицы доступа для всех девяти учётных записей
одним сценарием и зафиксировать состояние базы данных документом.

**Результат:** матрица доступа полностью соответствует разделу 4 ТЗ;
раздел 2 «База данных» закрыт; далее начинается разработка приложения.

**Изменений в данных и политиках этап не вносит** — только проверки,
документирование и закомментированные заготовки.

---

## 2. Предварительные условия

1. Этапы 2.1–2.7 выполнены, все проверки пройдены.
2. В базе: 5 таблиц, 3 представления, 4 функции, 10 политик, 9 профилей.
3. Данные соответствуют этапу 2.2 (4 врача, 8 пациентов, 24 анализа,
   5 назначений). Если проверки этапа 2.7 завершались отменой транзакции,
   распределение назначений осталось стартовым.

---

## 3. Уточнение методики проверки в SQL Editor

Редактор отображает результат **последнего оператора** сценария. Если блок
завершается командой `rollback;`, таблица результата не показывается, хотя
запрос выполнен успешно.

Поэтому вводится единый протокол проверки, применяемый и к ранее пройденным
этапам:

1. Блок проверки выполняется одним запуском и **завершается оператором `select`**.
2. Immediately после просмотра результата отдельным запуском выполняется
   `rollback;` — снимается контекст пользователя и закрывается транзакция.
3. Для проверок, изменяющих данные (этап 2.7.5), отмена обязательна.

Если на этапах 2.4–2.7 результат не отображался, следует убрать завершающий
`rollback;` из блока и выполнить его отдельно. Содержательная часть проверок
при этом не меняется.

---

## 4. Пошаговое выполнение

### Шаг 2.8.1. Подтверждение закрытости отложенных ролей

Отдельные запрещающие политики не создавались (этап 2.4.3): при включённом
RLS отсутствие правила уже означает полный запрет. Проверяется, что ни одно
правило не упоминает отложенные роли.

```sql
-- Ожидается пустой результат.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and (qual       ilike any (array['%hr_manager%', '%patient_manager%', '%lab_manager%'])
    or with_check ilike any (array['%hr_manager%', '%patient_manager%', '%lab_manager%']));
```

Дополнительно подтверждается, что права записи на справочники не выдавались:

```sql
select t.table_name,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'insert') as ins,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'update') as upd,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'delete') as del
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
  and t.table_name in ('doctors', 'patients', 'analyses')
order by 1;
```

Ожидается: во всех трёх строках `false`, `false`, `false`.

### Шаг 2.8.2. Заготовки политик для будущего расширения

Файл `supabase/sql/future/stub_crud_template.sql` создаётся **целиком
закомментированным** и в SQL Editor не выполняется. Он фиксирует проектное
решение, чтобы расширение не потребовало повторного анализа.

```sql
-- ЗАГОТОВКИ. НЕ ВЫПОЛНЯТЬ. Полный CRUD отложенных ролей — вне объёма ТЗ v1.0.
--
-- ВАЖНО: одних политик недостаточно. На этапе 2.4.4 роли authenticated выданы
-- только права чтения на doctors, patients, analyses. Перед включением политик
-- необходимо выдать права записи на соответствующую таблицу, например:
--   grant insert, update, delete on public.doctors to authenticated;
--
-- Менеджер персонала: CRUD врачей.
-- drop policy if exists doctors_hr_all on public.doctors;
-- create policy doctors_hr_all on public.doctors
--   for all to authenticated
--   using      ((select public.current_app_role()) = 'hr_manager')
--   with check ((select public.current_app_role()) = 'hr_manager');
--
-- Менеджер пациентов: CRUD пациентов.
-- drop policy if exists patients_pm_all on public.patients;
-- create policy patients_pm_all on public.patients
--   for all to authenticated
--   using      ((select public.current_app_role()) = 'patient_manager')
--   with check ((select public.current_app_role()) = 'patient_manager');
--
-- Лаборант: CRUD анализов.
-- drop policy if exists analyses_lab_all on public.analyses;
-- create policy analyses_lab_all on public.analyses
--   for all to authenticated
--   using      ((select public.current_app_role()) = 'lab_manager')
--   with check ((select public.current_app_role()) = 'lab_manager');
--
-- Последствия включения, подлежащие проверке:
-- 1) представления администратора не изменяются (проверка роли внутри них);
-- 2) врач по-прежнему видит только назначенных пациентов;
-- 3) пациент по-прежнему не видит анализы;
-- 4) удаление пациента ограничено внешними ключами on delete restrict.
```

### Шаг 2.8.3. Сводная проверка матрицы доступа

Сценарий последовательно подставляет контекст каждой учётной записи и собирает
фактическую видимость данных. Особенности конструкции:

* перечень профилей читается **до** переключения роли — схема `auth` доступна
  только роли `postgres`;
* переключение выполняется динамически (`execute`), поскольку в блоке `do`
  оператор `set` напрямую не используется;
* подсчёт строк выполняется под ролью `authenticated`, а запись результата —
  после возврата к `postgres`: временная таблица принадлежит ей, и выдача прав
  на неё не требуется;
* сценарий завершается оператором `select` (см. раздел 3).

```sql
begin;

create temp table _access_matrix (
  email             text,
  role              text,
  app_users         integer,
  patients          integer,
  doctors           integer,
  analyses          integer,
  assignments       integer,
  admin_patients    integer,
  admin_doctors     integer,
  admin_assignments integer,
  visible_patients  text
) on commit drop;

do $$
declare
  r record;   -- проверяемая учётная запись
  v record;   -- измеренная видимость
begin
  for r in
    select u.email, p.user_id, p.role::text as role
    from public.app_users p
    join auth.users u on u.id = p.user_id
    order by p.role, u.email
  loop
    -- Контекст задаётся от имени postgres.
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text,
      true
    );

    execute 'set local role authenticated';

    select
      (select count(*) from public.app_users)          as app_users,
      (select count(*) from public.patients)           as patients,
      (select count(*) from public.doctors)            as doctors,
      (select count(*) from public.analyses)           as analyses,
      (select count(*) from public.assignments)        as assignments,
      (select count(*) from public.admin_patients)     as admin_patients,
      (select count(*) from public.admin_doctors)      as admin_doctors,
      (select count(*) from public.admin_assignments)  as admin_assignments,
      (select string_agg(last_name, ', ' order by last_name)
         from public.patients)                         as visible_patients
    into v;

    execute 'reset role';

    insert into _access_matrix values (
      r.email, r.role,
      v.app_users, v.patients, v.doctors, v.analyses, v.assignments,
      v.admin_patients, v.admin_doctors, v.admin_assignments, v.visible_patients
    );
  end loop;
end
$$;

select * from _access_matrix order by role, email;
```

После просмотра результата отдельным запуском: `rollback;`.

### Шаг 2.8.4. Инвентаризация объектов базы данных

```sql
select 'таблицы' as kind, count(*) as quantity
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
union all
select 'представления', count(*)
from information_schema.views where table_schema = 'public'
union all
select 'функции контекста', count(*)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_app_role', 'current_doctor_id',
                    'current_patient_id', 'is_my_patient')
union all
select 'политики', count(*) from pg_policies where schemaname = 'public'
union all
select 'перечисления ролей', count(*)
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'user_role';
```

| Вид объекта | Количество |
|---|---|
| таблицы | 5 |
| представления | 3 |
| функции контекста | 4 |
| политики | 10 |
| перечисления ролей | 1 |

### Шаг 2.8.5. Проверка настроек проекта

1. **Authentication → Users**: 9 записей, все подтверждены.
2. **Authentication → Sign In / Providers → Email**: самостоятельная
   регистрация отключена.
3. **Database → Linter (Advisors)**: предупреждения о представлениях с правами
   владельца ожидаемы — они относятся к трём представлениям администратора
   и являются документированным исключением (ТЗ, S7 в редакции этапа 2.7).
   Иных предупреждений о политиках и привилегиях быть не должно.

### Шаг 2.8.6. Документ состояния базы данных

Создайте `docs/DB_STATE.md` со следующим содержанием (значения подставляются
по результатам проверок):

```text
# Состояние слоя данных на завершении раздела 2

Дата: 15.11.2026. Проект Supabase: облачный, один.

## Объекты
Таблицы: doctors, patients, analyses, assignments, app_users.
Представления: admin_patients, admin_doctors, admin_assignments.
Функции: current_app_role, current_doctor_id, current_patient_id, is_my_patient.
Перечисление: user_role (6 значений). Политик: 10.

## Данные
Врачи — 4, пациенты — 8, анализы — 24, назначения — 5, профили — 9.

## Матрица доступа (фактическая)
<таблица результатов шага 2.8.3>

## Принятые исключения
S7: представления администратора выполняются с правами владельца
и содержат обязательную проверку роли; параметр security_barrier включён.

## Отложенные роли
hr_manager, patient_manager, lab_manager: политик нет, прав записи нет.
Заготовки: supabase/sql/future/stub_crud_template.sql (не выполняется).
```

---

## 5. Ожидаемые результаты

### 5.1. Матрица доступа

Столбцы `adm_*` относятся к представлениям администратора.

| Адрес | Роль | `app_users` | `patients` | `doctors` | `analyses` | `assignments` | `adm_pat` | `adm_doc` | `adm_asg` | Видимые пациенты |
|---|---|---|---|---|---|---|---|---|---|---|
| `clinic.admin` | admin | 1 | 0 | 0 | 0 | 5 | 8 | 4 | 5 | — |
| `clinic.doctor1` | doctor | 1 | 3 | 1 | 9 | 3 | 0 | 0 | 0 | Абрамова, Борисов, Васильева |
| `clinic.doctor2` | doctor | 1 | 2 | 1 | 6 | 2 | 0 | 0 | 0 | Григорьев, Дмитриева |
| `clinic.hr` | hr_manager | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `clinic.lab` | lab_manager | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `clinic.patient1` | patient | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | Абрамова |
| `clinic.patient2` | patient | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | Борисов |
| `clinic.patient3` | patient | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | Дмитриева |
| `clinic.pm` | patient_manager | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |

Каждая учётная запись читает собственный профиль — это необходимо приложению
для определения роли и отображения фамилии.

### 5.2. Автоматическая сверка с эталоном (необязательно)

Чтобы получить заключение вместо ручной сверки, замените **завершающий**
оператор `select` сценария 2.8.3 приведённым ниже и выполните сценарий заново.

```sql
with expected (email, app_users, patients, doctors, analyses, assignments,
               admin_patients, admin_doctors, admin_assignments) as (
  values
    ('clinic.admin@example.com',    1, 0, 0, 0, 5, 8, 4, 5),
    ('clinic.doctor1@example.com',  1, 3, 1, 9, 3, 0, 0, 0),
    ('clinic.doctor2@example.com',  1, 2, 1, 6, 2, 0, 0, 0),
    ('clinic.hr@example.com',       1, 0, 0, 0, 0, 0, 0, 0),
    ('clinic.lab@example.com',      1, 0, 0, 0, 0, 0, 0, 0),
    ('clinic.patient1@example.com', 1, 1, 0, 0, 0, 0, 0, 0),
    ('clinic.patient2@example.com', 1, 1, 0, 0, 0, 0, 0, 0),
    ('clinic.patient3@example.com', 1, 1, 0, 0, 0, 0, 0, 0),
    ('clinic.pm@example.com',       1, 0, 0, 0, 0, 0, 0, 0)
)
select m.email,
       m.role,
       case when m.app_users         = e.app_users
             and m.patients          = e.patients
             and m.doctors           = e.doctors
             and m.analyses          = e.analyses
             and m.assignments       = e.assignments
             and m.admin_patients    = e.admin_patients
             and m.admin_doctors     = e.admin_doctors
             and m.admin_assignments = e.admin_assignments
            then 'соответствует'
            else 'ОТКЛОНЕНИЕ'
       end as verdict
from _access_matrix m
join expected e on e.email = m.email
order by m.role, m.email;
```

Ожидается девять строк со значением `соответствует`.

---

## 6. Диагностика типовых отклонений

| Наблюдение | Вероятная причина | Действие |
|---|---|---|
| Матрица содержит менее 9 строк | Часть профилей отсутствует | Проверить `app_users` (этап 2.3) |
| Все строки нулевые, включая `app_users` | Контекст не задаётся: опечатка в имени параметра `request.jwt.claims` | Сверить сценарий 2.8.3 |
| Ошибка `permission denied for schema auth` | Перечень профилей читается после переключения роли | Восстановить порядок: чтение до `set local role` |
| Ошибка `permission denied for table _access_matrix` | Запись результата выполняется под ролью `authenticated` | Сохранить `execute 'reset role'` перед вставкой |
| У врача видны все пациенты | Проверки этапа 2.7 завершались не отменой, а фиксацией, либо изменена политика | Сверить назначения и политику `patients_select_assigned` |
| Отложенная роль видит данные | Выполнен файл заготовок | Удалить созданные политики и отозвать права записи |

---

## 7. Откат этапа

Этап не изменяет данные, политики и привилегии. Временная таблица удаляется
автоматически при закрытии транзакции. Для отката достаточно удалить созданные
файлы; выполнение `rollback;` после сценария обязательно.

---

## 8. Фиксация в репозитории

```bash
git add supabase/sql/02_8_checks.sql supabase/sql/future/stub_crud_template.sql docs/stages/stage_02_8_summary.md docs/DB_STATE.md
git commit -m "stage 2.8: stub roles verified, full access matrix check, database state documented"
```

---

## 9. Критерии готовности раздела 2

1. Проверки 2.8.1 дают пустой перечень политик и отсутствие прав записи.
2. Матрица 2.8.3 совпадает с таблицей 5.1 (либо все девять заключений
   в варианте 5.2 — `соответствует`).
3. Инвентаризация 2.8.4 совпадает с таблицей количеств.
4. Настройки аутентификации подтверждены; предупреждения линтера относятся
   только к документированному исключению.
5. Файл заготовок закомментирован полностью; `docs/DB_STATE.md` заполнен.

**Слой данных завершён. Следующий этап — 3.1: инициализация приложения.
Создание проекта Next.js с TypeScript командами `create-next-app`, структура
каталогов, настройка `.gitignore` и `.env.example`, проверка локального запуска.
Ключи Supabase подключаются на этапе 3.2.** Переход — после подтверждения
готовности.