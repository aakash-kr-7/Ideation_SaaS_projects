-- Remove report-version state owned solely by the retired specialist pipeline.
alter table public.report_versions drop column if exists specialist_disputes;
notify pgrst, 'reload schema';
