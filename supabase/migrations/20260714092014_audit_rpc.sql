create or replace function audit_exec_sql(query text) returns jsonb as $$
declare
  _json jsonb;
begin
  execute 'select coalesce(json_agg(t), ''[]''::json) from (' || query || ') t' into _json;
  return _json;
end;
$$ language plpgsql security definer;
