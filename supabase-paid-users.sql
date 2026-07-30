-- Paid users storage for Velora / Nodecast VPS
-- Run this once in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.paid_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null default 'viewer',
  display_name text,
  subscription_start timestamptz,
  subscription_end timestamptz,
  subscription_plan_months integer,
  subscription_blocked boolean not null default false,
  oidc_id text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists paid_users_username_idx on public.paid_users (username);
create index if not exists paid_users_subscription_end_idx on public.paid_users (subscription_end);

alter table public.paid_users enable row level security;

-- The app server uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Do not expose that key in frontend HTML or public JS.
