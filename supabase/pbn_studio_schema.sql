-- PBN Studio / PaintByNumber.cl proposed schema
-- Not applied automatically. Review project + auth strategy before deployment.

create extension if not exists pgcrypto;

create table if not exists public.pbn_designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  original_image_path text,
  thumbnail_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pbn_designs_slug_idx on public.pbn_designs(slug);

create table if not exists public.pbn_design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.pbn_designs(id) on delete cascade,
  source_version_id uuid null references public.pbn_design_versions(id) on delete set null,
  version_name text not null,
  status text not null default 'draft' check (status in ('draft','validated','approved','applied','archived')),
  generator_version text,
  recipe_hash text,
  settings jsonb not null default '{}'::jsonb,
  render_manifest jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pbn_design_versions_design_idx on public.pbn_design_versions(design_id, created_at desc);

create table if not exists public.pbn_version_markers (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.pbn_design_versions(id) on delete cascade,
  marker_tag text not null,
  palette_hex text not null,
  area_weight numeric not null default 1,
  frequency integer not null default 0,
  sort_order integer not null default 0,
  locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique(version_id, marker_tag)
);
create index if not exists pbn_version_markers_tag_idx on public.pbn_version_markers(marker_tag);

create table if not exists public.pbn_assets (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.pbn_design_versions(id) on delete cascade,
  kind text not null check (kind in ('source','thumbnail','svg_color','svg_line','png_color','png_line','pdf','bundle','facet_map','project_json')),
  storage_path text not null,
  mime_type text,
  width integer,
  height integer,
  bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(version_id, kind)
);

create table if not exists public.pbn_optimization_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  status text not null default 'draft' check (status in ('draft','completed','accepted','rejected')),
  settings jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pbn_optimization_changes (
  id uuid primary key default gen_random_uuid(),
  optimization_run_id uuid not null references public.pbn_optimization_runs(id) on delete cascade,
  design_id uuid not null references public.pbn_designs(id) on delete cascade,
  base_version_id uuid not null references public.pbn_design_versions(id) on delete cascade,
  proposed_version_id uuid null references public.pbn_design_versions(id) on delete set null,
  from_marker text not null,
  to_marker text not null,
  delta_e numeric,
  was_conflict boolean not null default true,
  strategic_move boolean not null default false,
  accepted boolean,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.pbn_cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  optimization_run_id uuid null references public.pbn_optimization_runs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','approved','production','archived')),
  capacity integer not null default 10,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pbn_case_items (
  case_id uuid not null references public.pbn_cases(id) on delete cascade,
  version_id uuid not null references public.pbn_design_versions(id) on delete cascade,
  position integer not null default 0,
  primary key(case_id, version_id)
);

create table if not exists public.pbn_render_jobs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.pbn_design_versions(id) on delete cascade,
  requested_outputs text[] not null default array['svg_color','svg_line','png_color','png_line','pdf']::text[],
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  progress numeric not null default 0,
  error text,
  result_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Suggested Storage bucket: pbn-studio-assets (private)
-- Suggested object layout:
-- designs/{design_id}/source/original.png
-- designs/{design_id}/versions/{version_id}/preview.svg
-- designs/{design_id}/versions/{version_id}/color.svg
-- designs/{design_id}/versions/{version_id}/line.svg
-- designs/{design_id}/versions/{version_id}/color.png
-- designs/{design_id}/versions/{version_id}/line.png
-- designs/{design_id}/versions/{version_id}/print.pdf
-- designs/{design_id}/versions/{version_id}/project.json
-- designs/{design_id}/versions/{version_id}/facet-map.json

-- RLS intentionally not enabled here. Before deployment we need to decide whether
-- this is a private single-user production tool or a multi-user authenticated app.
