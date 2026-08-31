// 계좌별 일별 수익/수익률 히스토리를 balance_history 표에 쌓는다.
//
// 설계(인선님 확정, 2026-08-21): "오늘" 자리는 이 표에 아예 안 남긴다. 오늘 값은
// 시간이 지나면서 계속 바뀌는(위아래로만 움직이는) 살아있는 값이라, 서버가 아니라
// 화면(app.js의 renderBalanceChart)이 매번 demo_balance/summary에서 실시간으로 계산해
// 오늘 자리에 그린다. 이 파일이 하는 일은 딱 하나 — **자정(00:00 KST)이 지나 새 날이
// 시작된 걸 감지하면, "어제" 자리를 그 순간의 값으로 확정해서(다시는 안 바뀌게) 이
// 표에 한 줄 남기는 것**뿐이다. 그래야 "오늘 값 → 다음날 되면 확정값 → 다음 칸에
// 새 점" 순서가 맞아떨어진다.
//
// 예전엔 브로커마다 "그 브로커 시장이 마감하는 시각"(KIS 05:00 / 키움 15:30)에 맞춰
// 서로 다른 창(window)에서 찍었는데, 로컬 PC가 그 새벽 시간대엔 꺼져 있어서 KIS가
// 며칠씩 누락되는 문제가 있었다(2026-08-21 실측). 자정 기준으로 통일하면(1) 두
// 브로커가 항상 같은 순간에 확정되고(2) 이 서버가 24시간 도는 클라우드라 자정을
// 놓칠 일이 없다("시간대를 둘 다 맞추고 클라우드를 기준으로 해줘" 요청 그대로).
function nowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// getUTC*를 쓰는 이유: nowKst()가 이미 실제 시각에 9시간을 더해뒀으므로, 그 결과의
// UTC 필드를 읽으면 "KST 시각"을 그대로 얻는다(로컬 Date 객체의 타임존 보정을 피하려
// 일부러 UTC 필드로 다룬다).
//
// 2026-08-31: 원래 19분 창(00:00~00:19)이었는데, cron-job.org의 00:05 크론이 11일
// 연속 100% 실패했던 걸 실측으로 확인함 — 원인은 무료 Render 서버가 잠들어 있다가
// 그 순간 깨어나느라 503으로 즉시 실패하는 것(케이크런 자체는 정확한 시각에 잘
// 실행되고 있었음). keep-alive 크론(10분 간격)을 새로 추가해서 서버가 안 잠들게
// 했지만, 혹시 keep-alive가 밀리거나 실패해도 자정 창 자체를 넉넉히 잡아두면 다음
// 10분 주기 안에 또 기회가 있으므로 이중 안전장치로 60분까지 늘린다. 국내 커버드콜은
// 00:00~01:00 KST 사이엔 국내장이 열려있지 않아(09:00 개장) 이 시간대 값이 "어제
// 종가"에서 안 움직이므로 넓혀도 안전하다.
function isJustAfterMidnightKst(now) {
  return now.getUTCHours() === 0; // 00:00~00:59 KST — 10분 주기로 도니 여러 번 기회가 있다
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function hasSnapshot(supabase, broker, snapshotDate) {
  const { data, error } = await supabase
    .from("balance_history")
    .select("broker")
    .eq("broker", broker)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data != null;
}

// rows: fetchLiveSnapshot()이 반환한 그 브로커의 rows(krw_avg_value/krw_current_value 포함).
// 자정 직후(00:00~00:19 KST)가 아니거나 어제 몫이 이미 있으면 조용히 건너뛴다 — 실패해도
// (예: Supabase 일시 오류) 잔고 갱신 자체가 죽으면 안 되므로, 호출부에서 try/catch로 감싸 쓴다.
async function maybeSnapshot(supabase, broker, rows) {
  if (!rows || rows.length === 0) return;
  const now = nowKst();
  if (!isJustAfterMidnightKst(now)) return;
  // 다음에 또 며칠씩 누락되면 cron-job.org 대시보드 없이도 Render 로그만으로 원인을
  // 바로 확인할 수 있도록 남긴다(2026-08-31, 11일 연속 무응답 사고 재발 방지용).
  console.log(`[balance_history] 자정 창 진입 감지 (${broker}), KST now=${now.toISOString()}`);

  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const snapshotDate = ymd(yesterday);
  if (await hasSnapshot(supabase, broker, snapshotDate)) return;

  const krwAvgTotal = rows.reduce((sum, r) => sum + Number(r.krw_avg_value), 0);
  const krwCurrentTotal = rows.reduce((sum, r) => sum + Number(r.krw_current_value), 0);
  const krwProfit = krwCurrentTotal - krwAvgTotal;
  const krwProfitRate = krwAvgTotal > 0 ? (krwProfit / krwAvgTotal) * 100 : 0;

  const { error } = await supabase.from("balance_history").insert({
    broker,
    snapshot_date: snapshotDate,
    krw_avg_total: krwAvgTotal,
    krw_current_total: krwCurrentTotal,
    krw_profit: krwProfit,
    krw_profit_rate: krwProfitRate,
  });
  if (error) throw new Error(error.message);
  console.log(`일별 스냅샷 확정 (${broker}, ${snapshotDate}): 수익 ${krwProfit.toFixed(0)}원, 수익률 ${krwProfitRate.toFixed(2)}%`);
}

module.exports = { maybeSnapshot };
