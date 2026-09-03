# Настройка Supabase

1. Создать проект на [supabase.com](https://supabase.com), регион — поближе.
2. SQL Editor → вставить `schema.sql` → Run.
3. Authentication → Providers → Email: оставить включённым,
   **Confirm email** выключить (аккаунт один, подтверждать некому).
4. Authentication → Users → Add user: завести свой аккаунт вручную.
   Открытой регистрации в приложении нет.
5. Project Settings → API: скопировать `URL` и `anon public` ключ
   в `.env.local` по образцу `.env.example`.

Ключ `service_role` в приложении не нужен и в репозиторий не попадает
ни при каких обстоятельствах: он обходит RLS.
