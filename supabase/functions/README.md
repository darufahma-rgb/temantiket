# Edge Functions — IGH Tour

Tiga function buat manage user/agency. Semua butuh `SUPABASE_SERVICE_ROLE_KEY` yang otomatis tersedia di Edge Function runtime.

## Functions

| Name             | Auth     | Purpose                                                    |
|------------------|----------|------------------------------------------------------------|
| `bootstrap`      | Public   | Sekali jalan: bikin user pertama + agency + owner          |
| `invite-member`  | User JWT | Owner invite staff baru                                    |
| `remove-member`  | User JWT | Owner hapus staff                                          |
| `ocr-passport`   | User JWT | AI fallback OCR MRZ paspor (OpenAI gpt-4o-mini)            |

## Deploy

Install Supabase CLI dulu (https://supabase.com/docs/guides/cli), login & link ke project:

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

Deploy semua function:

```bash
supabase functions deploy bootstrap --no-verify-jwt
supabase functions deploy invite-member
supabase functions deploy remove-member
supabase functions deploy ocr-passport
```

`bootstrap` pake `--no-verify-jwt` karena dipanggil sebelum ada user.

Buat `ocr-passport`, set OpenAI key sebagai secret di Supabase:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

## Setup Awal

1. Jalanin `supabase/schema.sql` di SQL Editor (Dashboard).
2. Deploy 3 function di atas.
3. Buka app di `/bootstrap`, isi email + password + nama agency → akun owner pertama jadi.
4. Login normal di `/login`.
5. Owner bisa invite staff via menu **Settings → Manajemen Tim**.

## Reset (kalo mau ulang dari nol)

Di SQL Editor:

```sql
truncate public.agencies cascade;
delete from auth.users;
```

Lalu ulang dari step 3.
