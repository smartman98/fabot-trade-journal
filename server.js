require("dotenv").config();
const path = require("path");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const VALID_ACTIONS = ["buy", "sell"];

// FABOT 매매 규칙 (fg-dashboard의 today_signal.py와 동일한 기준)
function judgeSignal(score) {
  if (score <= 15) return "TQQQ 매수 100% (극단적 공포)";
  if (score <= 20) return "TQQQ 매수 50%";
  if (score <= 25) return "TQQQ 매수 25%";
  if (score >= 80) return "TQQQ 매도 전량 (극단적 탐욕)";
  if (score >= 75) return "TQQQ 매도 50%";
  if (score >= 35 && score <= 65) return "매수";
  return "대기 (매수/매도 조건 밖)";
}

function validateTrade(body, { partial = false } = {}) {
  const errors = [];
  const trade = {};

  if (body.trade_date !== undefined) trade.trade_date = body.trade_date;
  else if (!partial) errors.push("매매 날짜가 필요합니다.");

  if (body.ticker !== undefined) trade.ticker = String(body.ticker).trim();
  else if (!partial) errors.push("종목명이 필요합니다.");
  if (trade.ticker !== undefined && !trade.ticker) errors.push("종목명이 비어있습니다.");

  if (body.action !== undefined) trade.action = body.action;
  else if (!partial) errors.push("매수/매도 구분이 필요합니다.");
  if (trade.action !== undefined && !VALID_ACTIONS.includes(trade.action)) {
    errors.push("action은 'buy' 또는 'sell'이어야 합니다.");
  }

  if (body.quantity !== undefined) trade.quantity = Number(body.quantity);
  else if (!partial) errors.push("수량이 필요합니다.");
  if (trade.quantity !== undefined && !(trade.quantity > 0)) errors.push("수량은 0보다 커야 합니다.");

  if (body.price !== undefined) trade.price = Number(body.price);
  else if (!partial) errors.push("가격이 필요합니다.");
  if (trade.price !== undefined && !(trade.price > 0)) errors.push("가격은 0보다 커야 합니다.");

  if (body.fg_score !== undefined) {
    trade.fg_score = body.fg_score === null || body.fg_score === "" ? null : Number(body.fg_score);
    if (trade.fg_score !== null && (trade.fg_score < 0 || trade.fg_score > 100)) {
      errors.push("F&G 점수는 0~100 사이여야 합니다.");
    }
  }

  if (body.memo !== undefined) trade.memo = body.memo ? String(body.memo).trim() : null;

  if (body.account !== undefined) trade.account = body.account ? String(body.account).trim() : null;

  return { trade, errors };
}

// 오늘의 F&G 신호 (fg-dashboard가 쓰는 live_scores 테이블을 그대로 조회)
app.get("/api/signal/today", async (req, res) => {
  const [{ data: realRows }, { data: priceRows }] = await Promise.all([
    supabase.from("live_scores").select("*").eq("source", "cnn_real").order("computed_at", { ascending: false }).limit(1),
    supabase.from("live_scores").select("*").eq("source", "price_based").order("computed_at", { ascending: false }).limit(1),
  ]);

  const latest = (realRows && realRows[0]) || (priceRows && priceRows[0]);
  if (!latest) return res.status(404).json({ error: "F&G 신호 데이터가 아직 없습니다." });

  res.json({
    score: latest.score,
    source: latest.source,
    computed_at: latest.computed_at,
    signal: judgeSignal(latest.score),
  });
});

// F&G 추이 (최근 90일, 하루에 여러 번 계산됐으면 그날의 마지막 값만 사용)
//
// cnn_real은 값이 안 바뀌어도 크론이 돌 때마다 매번 새로 한 행씩 쌓인다(하루 수백~수천 건).
// 예전엔 "오래된 순으로 5000개"를 가져왔는데, 쌓인 행이 5000개보다 훨씬 많아지면서
// 5000번째 행이 몇 주 전 데이터에 그쳐 최근 날짜가 아예 안 잡히는 버그가 있었다
// (2026-08-13 실측: "오늘의 신호"는 62인데 추이 차트 마지막 점은 7월 말 41.7로 따로 놈).
// 최근 순으로 페이지네이션하면서 날짜 90개가 모일 때까지만 받아오면, 쌓인 행 개수와
// 상관없이 항상 최근 90일을 정확히 잡는다.
app.get("/api/signal/history", async (req, res) => {
  const TARGET_DAYS = 90;
  const PAGE_SIZE = 1000;

  const byDate = new Map(); // date -> score (최근 순으로 훑으므로 그 날짜의 첫 값 = 가장 최신 값)
  let offset = 0;
  for (let page = 0; page < 50; page += 1) { // 안전장치: 최대 5만 행까지만
    const { data, error } = await supabase
      .from("live_scores")
      .select("score, computed_at")
      .eq("source", "cnn_real")
      .order("computed_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) break;

    for (const row of data) {
      const dateStr = row.computed_at.slice(0, 10);
      if (!byDate.has(dateStr)) byDate.set(dateStr, row.score);
    }

    if (byDate.size >= TARGET_DAYS || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const series = Array.from(byDate, ([date, score]) => ({ date, score }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-TARGET_DAYS);
  res.json(series);
});

// 모의투자 계좌 잔고 — 증권사별로 완전히 별개인 계좌라 broker별로 묶어서 반환한다
// (push_demo_balance.py가 KIS, push_demo_balance_kiwoom.py가 Kiwoom을 각각 스케줄
// 실행마다 upsert해두는 스냅샷을 그대로 읽음).
function summarize(rows) {
  const summary = rows.reduce(
    (acc, r) => {
      acc.krwAvgTotal += Number(r.krw_avg_value);
      acc.krwCurrentTotal += Number(r.krw_current_value);
      return acc;
    },
    { krwAvgTotal: 0, krwCurrentTotal: 0 }
  );
  summary.krwProfit = summary.krwCurrentTotal - summary.krwAvgTotal;
  summary.krwProfitRate = summary.krwAvgTotal > 0 ? (summary.krwProfit / summary.krwAvgTotal) * 100 : 0;
  return summary;
}

app.get("/api/balance", async (req, res) => {
  const { data, error } = await supabase.from("demo_balance").select("*").order("market", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const brokers = {};
  for (const row of data) {
    if (!brokers[row.broker]) brokers[row.broker] = [];
    brokers[row.broker].push(row);
  }

  const result = {};
  for (const [broker, rows] of Object.entries(brokers)) {
    result[broker] = { rows, summary: summarize(rows) };
  }
  res.json(result);
});

// 목록 조회 + 요약 통계
app.get("/api/trades", async (req, res) => {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const summary = data.reduce(
    (acc, t) => {
      if (t.action === "buy") {
        acc.buyCount += 1;
        acc.buyTotal += Number(t.quantity) * Number(t.price);
      } else if (t.action === "sell") {
        acc.sellCount += 1;
        acc.sellTotal += Number(t.quantity) * Number(t.price);
      } else if (t.action === "dividend") {
        acc.dividendCount += 1;
        acc.dividendTotal += Number(t.price);
      }
      return acc;
    },
    { buyCount: 0, sellCount: 0, buyTotal: 0, sellTotal: 0, dividendCount: 0, dividendTotal: 0 }
  );

  res.json({ trades: data, summary });
});

// 단건 상세 조회
app.get("/api/trades/:id", async (req, res) => {
  const { data, error } = await supabase.from("trades").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: "기록을 찾을 수 없습니다." });
  res.json(data);
});

// 추가
app.post("/api/trades", async (req, res) => {
  const { trade, errors } = validateTrade(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(" ") });

  const { data, error } = await supabase.from("trades").insert(trade).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// 수정
app.put("/api/trades/:id", async (req, res) => {
  const { trade, errors } = validateTrade(req.body, { partial: true });
  if (errors.length > 0) return res.status(400).json({ error: errors.join(" ") });

  const { data, error } = await supabase
    .from("trades")
    .update(trade)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 삭제
app.delete("/api/trades/:id", async (req, res) => {
  const { error } = await supabase.from("trades").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

const PORT = process.env.PORT || 3400;
app.listen(PORT, () => {
  console.log(`FABOT 매매 일지 실행 중: http://localhost:${PORT}`);
});
