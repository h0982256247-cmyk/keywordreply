create or replace function public.get_channel_status()
returns table(has_channel boolean, name text, updated_at timestamptz, channel_id text, channel_secret_masked text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select true, c.name, c.updated_at, c.channel_id,
         case when c.channel_secret is not null then '••••••••' else null end
  from public.rm_line_channels c
  where c.user_id = auth.uid()
  limit 1;
end;
$$;

grant execute on function public.get_channel_status() to authenticated;
