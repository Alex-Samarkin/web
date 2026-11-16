# Этап 2.5. Политики пациента

**Файл документа:** `docs/stages/stage_02_5_patient_policies.md`
**Файл сценария:** `supabase/sql/02_5_patient_policies.sql`
**Основание:** ТЗ v1.0, раздел 4 (матрица доступа), 5 (F5), 6 (S1, S2)

---

## 1. Цель и результат этапа

Разрешить пациенту чтение **только собственной** строки таблицы `patients`
и убедиться, что остальные сведения для этой роли недоступны: анализы,
справочник врачей и назначения.

**Результат:** пользователь с ролью `patient` видит одну строку `patients`
(свою карточку целиком) и ноль строк в `analyses`, `doctors`, `assignments`.
Своя строка `app_users` читается политикой этапа 2.4.

---

## 2. Предварительные условия

1. Этап 2.4 выполнен: RLS включён на пяти таблицах, привилегии выданы,
   служебные функции созданы, проверка 5.5 давала `1, 0, 0, 0, 0`.
2. Профили пациентов созданы (этап 2.3): `clinic.patient1`, `clinic.patient2`,
   `clinic.patient3`.
3. Открыт **SQL Editor** проекта Supabase.

---

## 3. Проектные решения и их обоснование

| Решение | Обоснование |
|---|---|
| Предикат `id = public.current_patient_id()` | Идентификатор пациента в справочнике не совпадает с идентификатором учётной записи, поэтому сравнение с `auth.uid()` неприменимо. Связь «учётная запись → пациент» хранится в профиле и извлекается служебной функцией. |
| Обращение к профилю через функцию, а не подзапросом к `app_users` | Функция выполняется с правами владельца и не зависит от политик `app_users`. Это исключает взаимную рекурсию политик и делает правило самодостаточным. |
| Функция обёрнута в `(select ...)` | PostgreSQL вычисляет такое выражение один раз на запрос (initPlan), а не для каждой строки. Приём рекомендован для политик Supabase. |
| Политика только `for select`, только `to authenticated` | Пациент не изменяет данные (ТЗ, п. 3), анонимная роль прав не имеет. Сужение по команде и роли делает правило явным и читаемым. |
| Политики на `analyses`, `doctors`, `assignments` не создаются | Отсутствие политики при включённом RLS означает полный запрет. Отдельные запрещающие правила избыточны. |
| Отсутствует `with check` | Для команды `select` ограничивается только видимость строк; проверка записываемых данных не требуется. |

**Существенное замечание.** Привилегия `select` на таблицу `analyses` у роли
`authenticated` **есть** (этап 2.4.4), но строк пациент не получает. Это и есть
разделение двух уровней: привилегия допускает обращение к таблице, политика
определяет видимые строки. Проверка 5.2 показывает оба факта одновременно.

Для врача и администратора функция `current_patient_id()` возвращает пустое
значение, сравнение даёт «неизвестно», и строки не проходят. Политика пациента
не расширяет доступ других ролей — это подтверждается проверкой 5.5.

---

## 4. Пошаговое выполнение

### Шаг 2.5.1. Политика чтения собственной карточки

```sql
-- Единственное правило для пациента: видна строка, чей идентификатор
-- совпадает с идентификатором пациента в профиле текущего пользователя.
drop policy if exists patients_select_own on public.patients;

create policy patients_select_own
on public.patients
for select
to authenticated
using (id = (select public.current_patient_id()));

comment on policy patients_select_own on public.patients is
  'Пациент читает только собственную карточку. Идентификатор извлекается из app_users служебной функцией.';
```

### Шаг 2.5.2. Подтверждение закрытости остальных таблиц

Изменений не вносит; запрос показывает, что для пациента правил доступа
к анализам, врачам и назначениям не существует.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Ожидается две строки: `app_users / app_users_select_own` и
`patients / patients_select_own`. Таблицы `analyses`, `assignments`, `doctors`
в перечне отсутствуют — доступ к ним закрыт.

---

## 5. Проверка результата

Проверки выполняются в SQL Editor целыми блоками: контекст задаётся до
переключения роли, изменения отменяются командой `rollback`. Результат
сводится в один запрос, поскольку редактор отображает данные последнего
оператора.

### 5.1. Состав политик

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Ожидается две политики; в поле `qual` политики `patients_select_own`
присутствует сравнение с `current_patient_id()`.

### 5.2. Пациент Абрамова: видимость данных и состояние привилегий

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.patient1@example.com'),
  true
);

set local role authenticated;

select
  public.current_app_role()                                   as app_role,
  (select count(*) from public.patients)                      as patients_rows,
  (select string_agg(last_name, ', ') from public.patients)   as visible_patients,
  (select count(*) from public.analyses)                      as analyses_rows,
  (select count(*) from public.doctors)                       as doctors_rows,
  (select count(*) from public.assignments)                   as assignments_rows,
  (select count(*) from public.app_users)                     as app_users_rows,
  has_table_privilege('authenticated', 'public.analyses', 'select') as analyses_privilege;

rollback;
```

| Поле | Ожидаемое значение |
|---|---|
| `app_role` | `patient` |
| `patients_rows` | `1` |
| `visible_patients` | `Абрамова` |
| `analyses_rows` | `0` |
| `doctors_rows` | `0` |
| `assignments_rows` | `0` |
| `app_users_rows` | `1` |
| `analyses_privilege` | `true` |

Сочетание «привилегия `true`, строк `0`» — ключевой результат этапа.

### 5.3. Полнота собственной карточки

Пациенту доступны все столбцы своей записи, включая полис, телефон и адрес.
Ограничение по столбцам в этой роли не применяется.

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.patient1@example.com'),
  true
);

set local role authenticated;

select last_name, first_name, middle_name, birth_date, sex,
       policy_number, phone, address
from public.patients;

rollback;
```

Ожидается одна строка: Абрамова Елена Викторовна, 1978-04-12, Ж,
полис `1234567890123401`.

### 5.4. Область видимости по идентификатору

Обращение к записи другого пациента не возвращает данных: правило фильтрации
действует независимо от того, как сформулирован запрос.

```sql
begin;

select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.patient1@example.com'),
  true
);

set local role authenticated;

select count(*) as other_patient_rows
from public.patients
where id = '22222222-2222-4222-8222-222222222202';  -- Борисов Н. И.

rollback;
```

Ожидается `0`.

Повторите блок 5.2 для адреса `clinic.patient3@example.com`: ожидается
`patients_rows = 1`, `visible_patients = Дмитриева`.

### 5.5. Другие роли не получили доступ

Блок 5.2 выполняется для адресов `clinic.doctor1@example.com` и
`clinic.admin@example.com`.

Ожидается: `patients_rows = 0`, `visible_patients` пусто. Врач получит доступ
на этапе 2.6, администратор — только к фамилиям через представление на этапе 2.7.

---

## 6. Диагностика типовых отклонений

| Наблюдение | Вероятная причина | Действие |
|---|---|---|
| `app_role` пусто | Профиль не создан либо адрес введён с опечаткой | Проверить `app_users` (этап 2.3, проверка 5.3) |
| `patients_rows = 0` при верной роли | Профиль пациента не привязан к записи справочника | Проверить `patient_id` в профиле |
| Ошибка `function public.current_patient_id() does not exist` | Не выполнен шаг 2.4.2 | Повторить этап 2.4 |
| Ошибка `permission denied for function` | Не выдано право `execute` роли `authenticated` | Повторить выдачу прав на функции (2.4.2) |
| `analyses_rows > 0` | Создана лишняя политика на `analyses` | Удалить её; перечень политик — проверка 5.1 |

---

## 7. Откат этапа

```sql
drop policy if exists patients_select_own on public.patients;
```

После удаления пациент вновь не видит никаких строк — состояние этапа 2.4.

---

## 8. Фиксация в репозитории

```bash
git add supabase/sql/02_5_patient_policies.sql docs/stages/stage_02_5_patient_policies.md
git commit -m "stage 2.5: patient row-level policy (own card only)"
```

---

## 9. Критерии готовности этапа

1. Проверка 5.1 показывает ровно две политики.
2. Проверка 5.2 полностью совпадает с таблицей ожидаемых значений,
   включая `analyses_privilege = true` при `analyses_rows = 0`.
3. Проверка 5.3 возвращает полную собственную карточку.
4. Проверка 5.4 даёт `0`; для Дмитриевой видна только её запись.
5. Проверка 5.5 даёт `patients_rows = 0` для врача и администратора.

**Следующий этап — 2.6: политики врача. Создаётся предикат «пациент назначен
текущему врачу», разрешается чтение полных карточек и анализов назначенных
пациентов, чтение собственных назначений и собственной записи в справочнике
врачей. Проверяется, что Соколова видит трёх пациентов, Ковалёв — двух,
и чужие данные им недоступны.** Переход — после подтверждения готовности.