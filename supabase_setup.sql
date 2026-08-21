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

-- 2026-08-14 추가: 배당 기록도 남길 수 있게 action에 'dividend' 허용 (모의투자
-- 계좌는 실제 배당이 안 나오니 수동으로 넣을 수 있게 함). trades.action 체크 제약을
-- 다시 만든다(같은 이름의 제약을 지우고 다시 만드는 방식 — Postgres는 check
-- 제약에 직접 값 추가가 안 되고 통째로 다시 만들어야 함):
alter table trades drop constraint if exists trades_action_check;
alter table trades add constraint trades_action_check_v2 check (action in ('buy', 'sell', 'dividend'));

-- 2026-08-14 추가: 계좌별 일별(종가 기준) 수익/수익률 히스토리. demo_balance는 "지금"
-- 스냅샷 1개만 upsert하지만, 이 표는 하루 1건씩 쌓아서 그래프를 그릴 수 있게 한다.
-- push_demo_balance.py/push_demo_balance_kiwoom.py가 각자 계좌 시장 마감 직전
-- 시간대에만(하루 1번) 이 표에 insert한다.
create table balance_history (
  broker text not null,
  snapshot_date date not null,
  krw_avg_total numeric not null,
  krw_current_total numeric not null,
  krw_profit numeric not null,
  krw_profit_rate numeric not null,
  created_at timestamptz not null default now(),
  primary key (broker, snapshot_date)
);

alter table balance_history enable row level security;
revoke all on balance_history from anon;

-- 계좌별 예수금(현금) — 자산구성(%) 화면의 '현금' 비중용 (2026-08-15)
create table demo_cash (
  broker text primary key,
  krw_amount numeric not null,
  updated_at timestamptz not null default now()
);
alter table demo_cash enable row level security;
revoke all on demo_cash from anon;

-- 2026-08-21 추가: 잔고 표의 "현재가" 옆에 전일대비(등락)를 보여주기 위해 전일종가를
-- 같이 저장한다. prev_close=거래소 표시통화(국내 원/TQQQ 달러), krw_prev_close=원화
-- 환산(krw_avg_value와 같은 관례로, 그날그날 환율이 아니라 "지금" 환율을 곱해서 저장).
-- nullable로 둔 이유: push_demo_balance.py/push_demo_balance_kiwoom.py(10분마다 도는
-- 기존 파이썬 스케줄 잡)는 이 필드를 아직 채우지 않는데, NOT NULL이면 그 upsert가
-- 깨진다 — 이 표는 Node 쪽(broker_live.js, "새로고침" 버튼)에서만 채워도 되게 한다.
alter table demo_balance add column if not exists prev_close numeric;
alter table demo_balance add column if not exists krw_prev_close numeric;
