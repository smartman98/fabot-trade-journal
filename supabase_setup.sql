create table trades (
  id bigint generated always as identity primary key,
  trade_date date not null,
  ticker text not null,
  action text not null check (action in ('buy', 'sell')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fg_score numeric check (fg_score is null or (fg_score between 0 and 100)),
  memo text,
  account text,
  created_at timestamptz not null default now()
);

alter table trades enable row level security;

-- 백엔드(Express)는 service_role 키로 접근하므로 RLS를 우회한다.
-- 혹시 모를 프론트 직접 접근을 막기 위해 anon 권한은 전부 막아둔다.
revoke all on trades from anon;

-- 2026-07-27 추가: 어느 증권사/모의·실전 계좌에서 한 매매인지 기록하는 컬럼.
-- 기존 테이블에 이미 데이터가 있다면 아래 한 줄만 Supabase SQL Editor에서 실행하면 됨
-- (위 create table은 이미 테이블이 있으면 실행할 필요 없음):
-- alter table trades add column if not exists account text;
