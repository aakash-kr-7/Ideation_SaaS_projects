-- Migration 00006_triggers_functions
-- Database functions and triggers

-- 1. update_modified_column function
create or replace function public.update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Apply updated_at triggers
create trigger update_users_modtime before update on public.users for each row execute function update_modified_column();
create trigger update_teams_modtime before update on public.teams for each row execute function update_modified_column();
create trigger update_user_preferences_modtime before update on public.user_preferences for each row execute function update_modified_column();
create trigger update_feature_limits_modtime before update on public.feature_limits for each row execute function update_modified_column();
create trigger update_projects_modtime before update on public.projects for each row execute function update_modified_column();
create trigger update_research_runs_modtime before update on public.research_runs for each row execute function update_modified_column();
create trigger update_research_stages_modtime before update on public.research_stages for each row execute function update_modified_column();
create trigger update_opportunities_modtime before update on public.opportunities for each row execute function update_modified_column();
create trigger update_reports_modtime before update on public.reports for each row execute function update_modified_column();
create trigger update_background_jobs_modtime before update on public.background_jobs for each row execute function update_modified_column();
create trigger update_billing_subscriptions_modtime before update on public.billing_subscriptions for each row execute function update_modified_column();

-- 3. handle_new_user function (syncs auth.users to public.users and creates default team)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_team_id uuid;
begin
  -- Insert into public.users
  insert into public.users (id, display_name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Create default team
  insert into public.teams (name, slug, created_by)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', 'My Team'),
    'team-' || encode(gen_random_bytes(6), 'hex'),
    new.id
  ) returning id into new_team_id;

  -- Add user as owner of default team
  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, new.id, 'owner');

  -- Setup default feature limits
  insert into public.feature_limits (team_id) values (new_team_id);

  return new;
end;
$$;

-- Trigger to call handle_new_user on auth.users insert
-- Note: auth.users is managed by Supabase, so this trigger is on the auth schema
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
