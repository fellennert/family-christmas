-- Keep-alive for Supabase's free tier, which pauses projects after about a
-- week without activity. A daily Vercel Cron job (vercel.json ->
-- app/api/keep-alive/route.ts) calls this. It reads no data.
create function public.ping()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
