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

-- 2026-08-13 추가: 모의투자 계좌 잔고 스냅샷(보유량/매입가/현재가). 스케줄된
-- run_auto_trade_realtime.bat 실행마다 push_demo_balance.py가 이 표를 upsert한다.
create table demo_balance (
  ticker text primary key,
  market text not null check (market in ('domestic', 'overseas')),
  label text not null,
  quantity numeric not null,
  avg_price numeric not null,
  current_price numeric not null,
  currency text not null check (currency in ('KRW', 'USD')),
  krw_avg_value numeric not null,
  krw_current_value numeric not null,
  updated_at timestamptz not null default now()
);

alter table demo_balance enable row level security;
revoke all on demo_balance from anon;

-- 2026-08-14 추가: 증권사(한국투자증권 KIS / 키움증권)별로 완전히 별개인 모의투자
-- 계좌를 둘 다 보여주기로 함 — 두 계좌가 같은 종목(472150)을 동시에 들고 있을 수
-- 있어서 ticker 하나만으로는 primary key가 안 됨. (broker, ticker) 복합키로 바꾼다.
-- 기존 테이블에 이미 데이터가 있는 상태에서 Supabase SQL Editor에서 실행:
alter table demo_balance add column if not exists broker text not null default 'KIS';
alter table demo_balance drop constraint if exists demo_balance_pkey;
alter table demo_balance add primary key (broker, ticker);
alter table demo_balance alter column broker drop default;
