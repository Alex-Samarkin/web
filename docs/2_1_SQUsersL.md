# Этап 2.3. Учётные записи, роли и профили

**Файл документа:** `docs/stages/stage_02_3_accounts.md`
**Файл сценария:** `supabase/sql/02_3_accounts.sql`
**Справочный файл:** `docs/DEMO_ACCOUNTS.md`
**Основание:** ТЗ v1.0, разделы 2, 3 (`app_users`), 6 (S3, S4, S8)

---

## 1. Цель и результат этапа

Создать девять учётных записей средствами панели Supabase, запретить
самостоятельную регистрацию и сопоставить каждую запись с ролью и предметной
сущностью в таблице `app_users`.

**Результат:** таблица `app_users` содержит 9 строк; роль каждого пользователя
определяется записью в БД, а не данными, которые пользователь может изменить.

**Чего на этом этапе нет:** политик RLS и выдачи прав. Таблицы по-прежнему
закрыты для клиентских ролей отзывом привилегий (этап 2.1.7). Вход в приложение
проверяется позже, на этапе 3.3.

---

## 2. Предварительные условия

1. Этапы 2.1 и 2.2 выполнены; проверки 5.1–5.5 этапа 2.2 пройдены.
2. Открыта панель Supabase: разделы **Authentication** и **SQL Editor**.
3. Единый демонстрационный пароль выбран и сохранён вне репозитория
   (например, в заметках преподавателя). В Git выносится только перечень
   адресов и ролей — без пароля.

---

## 3. Проектные решения и их обоснование

| Решение | Обоснование |
|---|---|
| Учётные записи создаются через панель, а не вставкой в `auth.users` | Схема `auth` обслуживается сервером аутентификации: помимо пользователя создаются записи идентификации, задаётся хеш пароля. Ручная вставка обходит эти механизмы и приводит к неработоспособным учётным записям. |
| Сервисный ключ не используется | Создание пользователей выполняется вручную, поэтому секретный ключ не нужен ни здесь, ни далее (ТЗ, S4). |
| Сопоставление по адресу электронной почты | Идентификаторы пользователей заранее неизвестны, а адрес — устойчивый и читаемый ключ. Сценарий получает `uuid` подзапросом из `auth.users`. |
| `app_users.user_id` — первичный ключ | Одна учётная запись — один профиль, следовательно одна роль (ТЗ, п. 2). |
| Роль хранится в таблице | Пользователь не имеет прав на запись в `app_users`; изменение роли возможно только административным сценарием. Метаданные `user_metadata` в проверках не участвуют (ТЗ, S3). |
| Часть врачей и пациентов остаётся без учётных записей | Справочник и пользователи — разные сущности. Врач без учётной записи может быть назначен администратором; пациент без учётной записи виден своему врачу. |

### 3.1. Перечень учётных записей

| № | Адрес электронной почты | Роль | Привязка |
|---|---|---|---|
| 1 | `clinic.admin@example.com` | `admin` | — |
| 2 | `clinic.doctor1@example.com` | `doctor` | Соколова И. П. |
| 3 | `clinic.doctor2@example.com` | `doctor` | Ковалёв Д. А. |
| 4 | `clinic.patient1@example.com` | `patient` | Абрамова Е. В. |
| 5 | `clinic.patient2@example.com` | `patient` | Борисов Н. И. |
| 6 | `clinic.patient3@example.com` | `patient` | Дмитриева С. П. |
| 7 | `clinic.hr@example.com` | `hr_manager` | — |
| 8 | `clinic.pm@example.com` | `patient_manager` | — |
| 9 | `clinic.lab@example.com` | `lab_manager` | — |

Домен `example.com` зарезервирован для документации; письма не отправляются,
поскольку подтверждение адреса выполняется вручную при создании записи.
Если панель отклонит адрес, используйте любой доступный Вам почтовый ящик
с добавлением метки, например `your.name+clinic1@gmail.com`.

Пациенты Абрамова и Борисов обслуживаются Соколовой, Дмитриева — Ковалёвым.
Это позволит на этапе 2.6 проверить, что каждый врач видит только свой список.

---

## 4. Пошаговое выполнение

### Шаг 2.3.1. Настройка аутентификации

Путь: **Authentication → Sign In / Providers → Email** (в некоторых версиях
интерфейса — **Authentication → Configuration**).

| Параметр | Значение | Назначение |
|---|---|---|
| Enable Email provider | включено | вход по адресу и паролю |
| Allow new users to sign up (Enable signup) | **выключено** | запрет самостоятельной регистрации (ТЗ, S8) |
| Confirm email | выключено | стенд не использует почту; настройка SMTP не требуется |

Сохраните изменения. Отключение подтверждения не открывает регистрацию:
новые записи создаются только администратором проекта в панели.

### Шаг 2.3.2. Создание пользователей

Путь: **Authentication → Users → Add user → Create new user**.

Для каждой строки таблицы 3.1:
1. **Email** — адрес из перечня.
2. **Password** — единый демонстрационный пароль (не менее 6 символов;
   рекомендуется длинный, например `Clinic-Demo-2026!`).
3. **Auto Confirm User** — отметить обязательно, иначе вход будет заблокирован
   до подтверждения адреса.
4. Нажать **Create user**.

Повторить девять раз. Порядок создания значения не имеет.

> Создание пользователей SQL-командой `insert into auth.users ...` не выполняется.

### Шаг 2.3.3. Контроль полноты перед сопоставлением

Сценарий сопоставления соединяет перечень адресов с `auth.users`. Если адрес
введён с опечаткой, соответствующая строка профиля просто не создастся, поэтому
сначала выполняется проверка отсутствующих адресов.

```sql
-- Ожидается пустой результат: все девять адресов существуют.
with expected (email) as (
  values
    ('clinic.admin@example.com'),
    ('clinic.doctor1@example.com'),
    ('clinic.doctor2@example.com'),
    ('clinic.patient1@example.com'),
    ('clinic.patient2@example.com'),
    ('clinic.patient3@example.com'),
    ('clinic.hr@example.com'),
    ('clinic.pm@example.com'),
    ('clinic.lab@example.com')
)
select e.email as missing_email
from expected e
left join auth.users u on u.email = e.email
where u.id is null
order by 1;
```

Если запрос вернул строки — исправьте адреса в панели (**Users → … → Update user**)
и повторите проверку.

### Шаг 2.3.4. Заполнение профилей

Идентификаторы врачей и пациентов взяты из этапа 2.2 (детерминированная маска).
Приведение типов в первой строке `values` задаёт типы столбцов всего набора:
`text`, `text`, `uuid`, `uuid`.

Конструкция `on conflict (user_id) do update` делает сценарий повторным:
роль и привязки приводятся к эталонному состоянию.

```sql
with profile_map (email, role, doctor_id, patient_id) as (
  values
    ('clinic.admin@example.com',    'admin'::text,      null::uuid,                                 null::uuid),
    ('clinic.doctor1@example.com',  'doctor',           '11111111-1111-4111-8111-111111111101'::uuid, null),
    ('clinic.doctor2@example.com',  'doctor',           '11111111-1111-4111-8111-111111111102'::uuid, null),
    ('clinic.patient1@example.com', 'patient',          null, '22222222-2222-4222-8222-222222222201'::uuid),
    ('clinic.patient2@example.com', 'patient',          null, '22222222-2222-4222-8222-222222222202'::uuid),
    ('clinic.patient3@example.com', 'patient',          null, '22222222-2222-4222-8222-222222222205'::uuid),
    ('clinic.hr@example.com',       'hr_manager',       null, null),
    ('clinic.pm@example.com',       'patient_manager',  null, null),
    ('clinic.lab@example.com',      'lab_manager',      null, null)
)
insert into public.app_users (user_id, role, doctor_id, patient_id)
select u.id,
       m.role::public.user_role,
       m.doctor_id,
       m.patient_id
from profile_map m
join auth.users u on u.email = m.email
on conflict (user_id) do update
set role       = excluded.role,
    doctor_id  = excluded.doctor_id,
    patient_id = excluded.patient_id;
```

### Шаг 2.3.5. Справочный файл демонстрационных записей

Создайте `docs/DEMO_ACCOUNTS.md` с таблицей 3.1 (адрес, роль, привязка) и
примечанием: «Данные синтетические. Пароль демонстрационный, в репозитории
не хранится». Файл используется при проверках разделов приложения.

---

## 5. Проверка результата

### 5.1. Количество и состояние учётных записей

```sql
select count(*) as users_total,
       count(*) filter (where email_confirmed_at is not null) as confirmed
from auth.users;
```

Ожидается: `9` и `9`. Если подтверждённых меньше — в панели у соответствующей
записи выполнить **… → Confirm user**.

### 5.2. Распределение ролей

```sql
select role, count(*) as accounts
from public.app_users
group by role
order by role;
```

| Роль | Записей |
|---|---|
| `admin` | 1 |
| `doctor` | 2 |
| `hr_manager` | 1 |
| `lab_manager` | 1 |
| `patient` | 3 |
| `patient_manager` | 1 |

Всего 9 строк.

### 5.3. Соответствие привязок

```sql
select u.email,
       p.role,
       coalesce(d.last_name, pt.last_name, '—') as linked_person
from public.app_users p
join auth.users u        on u.id = p.user_id
left join public.doctors  d  on d.id = p.doctor_id
left join public.patients pt on pt.id = p.patient_id
order by p.role, u.email;
```

Ожидается: `clinic.doctor1` → Соколова, `clinic.doctor2` → Ковалёв,
`clinic.patient1` → Абрамова, `clinic.patient2` → Борисов,
`clinic.patient3` → Дмитриева; у остальных — прочерк.

### 5.4. Согласованность профилей и назначений

```sql
-- Сколько пациентов увидит каждый врач после включения политик (этап 2.6).
select u.email, d.last_name as doctor, count(a.patient_id) as patients_visible
from public.app_users p
join auth.users u          on u.id = p.user_id
join public.doctors d      on d.id = p.doctor_id
left join public.assignments a on a.doctor_id = d.id
where p.role = 'doctor'
group by u.email, d.last_name
order by u.email;
```

Ожидается: `clinic.doctor1` — Соколова, `3`; `clinic.doctor2` — Ковалёв, `2`.

### 5.5. Закрытость таблицы профилей

```sql
select
  has_table_privilege('authenticated', 'public.app_users', 'select') as can_select,
  has_table_privilege('authenticated', 'public.app_users', 'insert') as can_insert,
  has_table_privilege('authenticated', 'public.app_users', 'update') as can_update,
  has_table_privilege('authenticated', 'public.app_users', 'delete') as can_delete;
```

Ожидается: `false`, `false`, `false`, `false`. Пользователь не может ни прочитать
чужие профили, ни изменить свою роль. Право чтения собственной строки будет
выдано адресно на этапе 2.4.

### 5.6. Работоспособность пароля (необязательно)

Проверка выполняется до создания приложения и подтверждает только успешный вход.
Подставьте адрес проекта, публичный ключ и пароль. Команда приведена одной
строкой — это удобно для PowerShell.

```bash
curl -s -X POST "https://PROJECT_REF.supabase.co/auth/v1/token?grant_type=password" -H "apikey: PUBLIC_KEY" -H "Content-Type: application/json" -d "{\"email\":\"clinic.doctor1@example.com\",\"password\":\"DEMO_PASSWORD\"}"
```

Ожидается ответ с полем `access_token`. При неверном пароле — ошибка
`invalid_credentials`. Токен никуда не сохраняется и не публикуется; чтение
данных этим токеном пока невозможно, и это ожидаемо: права ещё не выданы.

---

## 6. Откат этапа

Профили удаляются каскадно при удалении учётной записи (`app_users_user_fk`),
поэтому основной способ — панель **Authentication → Users → … → Delete user**.

```sql
-- Удаление только профилей, учётные записи сохраняются:
delete from public.app_users;
```

После отката повторное выполнение шага 2.3.4 восстанавливает эталонное
 сопоставление.

---

## 7. Фиксация в репозитории

```bash
git add supabase/sql/02_3_accounts.sql docs/stages/stage_02_3_accounts.md docs/DEMO_ACCOUNTS.md
git commit -m "stage 2.3: demo accounts, signup disabled, role profiles in app_users"
```

Перед коммитом убедитесь, что в файлах нет пароля и ключей проекта.

---

## 8. Критерии готовности этапа

1. В панели **Authentication → Users** — 9 записей, все подтверждены (5.1).
2. Распределение ролей соответствует таблице 5.2.
3. Привязки соответствуют п. 5.3, согласованность с назначениями — п. 5.4.
4. Проверка 5.5 возвращает только `false`.
5. Самостоятельная регистрация отключена; сценарий и справочный файл закоммичены.

**Следующий этап — 2.4: базовые привилегии и включение RLS. Отзыв дефолтных
прав подтверждается, выдаются минимальные права на чтение, включается
построчная защита всех таблиц, создаётся служебная функция получения роли
и «запрещающие» политики для ролей-заглушек.** Переход — после подтверждения
готовности.