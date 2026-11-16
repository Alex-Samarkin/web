# Этап 2.4. Привилегии, включение RLS и служебные функции

**Файл документа:** `docs/stages/stage_02_4_rls_base.md`
**Файл сценария:** `supabase/sql/02_4_rls_base.sql`
**Основание:** ТЗ v1.0, раздел 6 (S1, S2, S3, S6, S7)

---

## 1. Цель и результат этапа

Разделить два независимых механизма защиты и включить оба:

* **привилегии** отвечают на вопрос «разрешено ли обращаться к таблице»;
* **политики RLS** отвечают на вопрос «какие строки при этом видны».

Доступ возникает только при выполнении обоих условий. На этом этапе
включается построчная защита всех таблиц, выдаются минимальные привилегии,
создаются служебные функции определения роли и первая политика — чтение
пользователем собственного профиля.

**Результат:** любой аутентифицированный пользователь видит одну строку
`app_users` (свою) и ноль строк во всех остальных таблицах. Это ожидаемое
промежуточное состояние: содержательные политики создаются на этапах 2.5–2.7.

---

## 2. Предварительные условия

1. Этапы 2.1–2.3 выполнены, проверки пройдены.
2. В `app_users` — 9 строк, учётные записи подтверждены.
3. Открыт **SQL Editor** проекта Supabase.

---

## 3. Проектные решения и их обоснование

| Решение | Обоснование |
|---|---|
| Привилегия `select` выдаётся на таблицы, а не на столбцы | Все пользователи приложения работают под одной ролью БД `authenticated`. Столбцовые привилегии различают роли БД, но не роли приложения, поэтому ограничить администратору состав столбцов ими невозможно. Ограничение по столбцам будет реализовано представлением (этап 2.7). |
| Политики разрешительные, отсутствие политики = запрет | RLS в PostgreSQL по умолчанию запрещает всё. Отдельные «запрещающие» политики не требуются. |
| Служебные функции — `security definer` | Функция читает `app_users` от имени владельца и не зависит от политик этой таблицы. Это исключает взаимную рекурсию политик и упрощает их запись. |
| Функции возвращают только сведения о вызывающем | Условие `user_id = auth.uid()` зашито внутрь: расширить область видимости вызовом функции невозможно. |
| `set search_path = ''` и полные имена объектов | Защита от подмены объектов одноимёнными объектами в другой схеме; требование безопасности Supabase к функциям с правами владельца. |
| `stable` | Результат постоянен в пределах оператора; функции пригодны для использования в политиках без потери производительности. |
| `force row level security` не включается | Владелец таблиц (роль `postgres`) должен сохранять полный доступ: иначе перестанут работать сценарии SQL Editor и представления этапа 2.7. Клиентские роли владельцами не являются, для них защита действует полностью. |
| Право `execute` на функции отзывается у `public` | По умолчанию новая функция доступна всем. Выдача выполняется адресно только роли `authenticated`. |

### 3.1. Уточнения к ранее объявленному плану

1. **Запрещающие политики для ролей-заглушек не создаются.** Их неexistence
   уже означает полный запрет; явная политика ничего не добавила бы.
2. **Пункт S7 ТЗ будет уточнён на этапе 2.7.** Представления, предназначенные
   для врача или пациента, создаются в режиме `security_invoker`. Представления
   администратора — исключение: они должны показать фамилии всех пациентов,
   не открывая при этом базовые таблицы. Такое представление создаётся с правами
   владельца и **обязательной проверкой роли внутри запроса**. Отклонение будет
   зафиксировано в ТЗ отдельной записью.

---

## 4. Пошаговое выполнение

### Шаг 2.4.1. Подтверждение закрытого состояния

Отзыв привилегий выполнен на этапе 2.1.7; перед выдачей прав убеждаемся,
что состояние исходное.

```sql
select t.table_name,
       has_table_privilege('anon',          'public.' || t.table_name, 'select') as anon_select,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'select') as auth_select
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;
```

Ожидается: во всех пяти строках `false`, `false`.

### Шаг 2.4.2. Служебные функции определения контекста

Три функции образуют «контекст пользователя»: роль, идентификатор врача,
идентификатор пациента. Для неаутентифицированного вызова `auth.uid()` пуст,
поэтому функции возвращают пустое значение, и любое сравнение с ним даёт
«неизвестно», то есть отказ.

```sql
-- Роль вызывающего пользователя.
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.app_users p
  where p.user_id = auth.uid();
$$;

-- Идентификатор врача, если пользователь — врач; иначе пусто.
create or replace function public.current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.doctor_id
  from public.app_users p
  where p.user_id = auth.uid();
$$;

-- Идентификатор пациента, если пользователь — пациент; иначе пусто.
create or replace function public.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.patient_id
  from public.app_users p
  where p.user_id = auth.uid();
$$;

-- Функции доступны только аутентифицированным пользователям.
revoke execute on function public.current_app_role()   from public, anon;
revoke execute on function public.current_doctor_id()  from public, anon;
revoke execute on function public.current_patient_id() from public, anon;

grant  execute on function public.current_app_role()   to authenticated;
grant  execute on function public.current_doctor_id()  to authenticated;
grant  execute on function public.current_patient_id() to authenticated;

comment on function public.current_app_role() is
  'Роль текущего пользователя из app_users. Источник роли для политик RLS.';
```

### Шаг 2.4.3. Включение построчной защиты

После этой команды таблицы переходят в режим «запрещено всё, что не разрешено
политикой». Действие немедленно и распространяется на всех клиентских ролей.

```sql
alter table public.doctors     enable row level security;
alter table public.patients    enable row level security;
alter table public.analyses    enable row level security;
alter table public.assignments enable row level security;
alter table public.app_users   enable row level security;
```

### Шаг 2.4.4. Минимальные привилегии

Роль `anon` не получает ничего. Роль `authenticated` получает право чтения
таблиц и право изменения только таблицы назначений — фактически изменять её
сможет лишь администратор, поскольку на этапе 2.7 соответствующие политики
будут созданы только для него.

```sql
grant usage on schema public to authenticated;

grant select on
  public.doctors,
  public.patients,
  public.analyses,
  public.assignments,
  public.app_users
to authenticated;

-- Запись разрешена только в таблицу назначений (управление администратором).
grant insert, update, delete on public.assignments to authenticated;

-- Контроль: у анонимной роли прав нет.
revoke all on public.doctors, public.patients, public.analyses,
              public.assignments, public.app_users from anon;
```

### Шаг 2.4.5. Первая политика — собственный профиль

Пользователь читает только свою строку `app_users`. Это позволяет приложению
показать роль и фамилию в шапке страницы и одновременно исключает перечисление
чужих профилей.

Повторный запуск обеспечивается парой `drop policy if exists` / `create policy`:
конструкции `create policy if not exists` в PostgreSQL нет.

```sql
drop policy if exists app_users_select_own on public.app_users;

create policy app_users_select_own
on public.app_users
for select
to authenticated
using (user_id = auth.uid());
```

---

## 5. Проверка результата

### 5.1. Состояние защиты таблиц

```sql
select c.relname as table_name,
       c.relrowsecurity       as rls_enabled,
       c.relforcerowsecurity  as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

Ожидается: 5 строк, `rls_enabled = true`, `rls_forced = false`.

### 5.2. Матрица привилегий

```sql
select t.table_name,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'select') as sel,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'insert') as ins,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'update') as upd,
       has_table_privilege('authenticated', 'public.' || t.table_name, 'delete') as del,
       has_table_privilege('anon',          'public.' || t.table_name, 'select') as anon_sel
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by 1;
```

| Таблица | sel | ins | upd | del | anon_sel |
|---|---|---|---|---|---|
| `analyses` | true | false | false | false | false |
| `app_users` | true | false | false | false | false |
| `assignments` | true | true | true | true | false |
| `doctors` | true | false | false | false | false |
| `patients` | true | false | false | false | false |

### 5.3. Свойства служебных функций

```sql
select p.proname,
       p.prosecdef as security_definer,
       p.provolatile,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_app_role', 'current_doctor_id', 'current_patient_id')
order by 1;
```

Ожидается: `security_definer = true`, `provolatile = s` (stable),
`proconfig` содержит `search_path=`.

### 5.4. Перечень политик

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Ожидается одна строка: `app_users` / `app_users_select_own` / `SELECT` /
`{authenticated}`.

### 5.5. Имитация пользовательского сеанса

Проверка выполняется в SQL Editor без приложения. Контекст задаётся функцией
`set_config` **до** переключения роли: после перехода в `authenticated` чтение
схемы `auth` станет недоступным. Блок выполняется целиком одним запуском,
изменения отменяются командой `rollback`.

```sql
begin;

-- Контекст сеанса: подставьте нужный адрес из docs/DEMO_ACCOUNTS.md.
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
   from public.app_users p
   join auth.users u on u.id = p.user_id
   where u.email = 'clinic.doctor1@example.com'),
  true
);

set local role authenticated;

select public.current_app_role()   as app_role,
       public.current_doctor_id()  as doctor_id,
       public.current_patient_id() as patient_id;

select
  (select count(*) from public.app_users)   as app_users_rows,
  (select count(*) from public.doctors)     as doctors_rows,
  (select count(*) from public.patients)    as patients_rows,
  (select count(*) from public.analyses)    as analyses_rows,
  (select count(*) from public.assignments) as assignments_rows;

rollback;
```

Ожидается: `app_role = doctor`, `doctor_id` заполнен, `patient_id` пуст;
количества — `1, 0, 0, 0, 0`.

Повторите блок для адресов `clinic.patient1@example.com` (ожидается
`app_role = patient`, заполнен `patient_id`) и `clinic.admin@example.com`
(ожидается `app_role = admin`, оба идентификатора пусты). Количества во всех
случаях — `1, 0, 0, 0, 0`.

### 5.6. Отказ анонимному обращению

```sql
begin;
set local role anon;
select count(*) from public.patients;
rollback;
```

Ожидается ошибка `permission denied for table patients`. Это подтверждает,
что публичный ключ сам по себе доступа к данным не даёт. После ошибки выполните
`rollback;` отдельным запросом, если редактор не снял транзакцию автоматически.

---

## 6. Откат этапа

```sql
drop policy if exists app_users_select_own on public.app_users;

revoke all on public.doctors, public.patients, public.analyses,
              public.assignments, public.app_users from authenticated;

alter table public.doctors     disable row level security;
alter table public.patients    disable row level security;
alter table public.analyses    disable row level security;
alter table public.assignments disable row level security;
alter table public.app_users   disable row level security;

drop function if exists public.current_app_role();
drop function if exists public.current_doctor_id();
drop function if exists public.current_patient_id();
```

> Откатывать этап не рекомендуется: до этапа 2.7 таблицы остаются закрытыми
> отсутствием политик, что и требуется по замыслу.

---

## 7. Фиксация в репозитории

```bash
git add supabase/sql/02_4_rls_base.sql docs/stages/stage_02_4_rls_base.md
git commit -m "stage 2.4: enable RLS, minimal grants, context functions, own-profile policy"
```

---

## 8. Критерии готовности этапа

1. Проверка 5.1: RLS включён на пяти таблицах, принудительный режим выключен.
2. Проверка 5.2 полностью совпадает с таблицей привилегий.
3. Проверки 5.3 и 5.4 соответствуют ожиданиям.
4. Проверка 5.5 для трёх адресов даёт `1, 0, 0, 0, 0` и корректный контекст.
5. Проверка 5.6 завершается отказом.

**Следующий этап — 2.5: политики пациента. Разрешается чтение собственной
строки `patients`; таблицы `analyses`, `doctors`, `assignments` остаются
полностью закрытыми для этой роли. Проверяется, что пациент видит свои личные
данные и не получает ни анализов, ни сведений о враче.** Переход — после
подтверждения готовности.