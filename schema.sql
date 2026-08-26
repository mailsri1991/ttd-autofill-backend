-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  razorpay_order_id text unique not null,
  email text not null,
  plan text not null,
  amount_paise integer not null,
  status text not null default 'created', -- created | paid | failed
  created_at timestamptz not null default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  email text not null,
  plan text not null,
  amount_paise integer not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  status text not null default 'active', -- active | expired | revoked
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_licenses_key on licenses (license_key);
create index if not exists idx_licenses_email on licenses (email);
create index if not exists idx_orders_order_id on orders (razorpay_order_id);
