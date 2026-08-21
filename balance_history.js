// 계좌별 일별(종가 기준) 수익/수익률 히스토리를 balance_history 표에 쌓는다.
// fg-index/balance_history.py(파이썬, 로컬 PC의 Task Scheduler에서 실행)와 같은 일을
// 하지만, 이 서버(Render, 24시간 클라우드)에서 직접 돈다 — 로컬 PC가 꺼져 있으면
// 새벽 시간대 스냅샷이 통째로 빠지는 문제(2026-08-21 실측, KIS가 며칠씩 밀림)를
// 근본적으로 없애기 위함. 두 브로커 다 이 파일 하나로 통일한다("시간대를 둘 다
// 맞추고 클라우드를 기준으로 해줘" — 인선님 요청, 2026-08-21).
//
// 창(window) 시각은 브로커마다 다르다 — 둘 다 같은 시각에 찍으면 안 된다:
// - Kiwoom은 국내(472150)만 보유 → 국내장 마감(15:30 KST) 무렵.
// - KIS는 국내+해외(TQQQ) 동시 보유 → 두 다리가 다 확정되는 미국장 마감(05:00 KST)
//   무렵이어야 진짜 "그날 마감" 값이 된다. 04:50~정오까지로 넓게 잡아서, 정확히
//   그 순간이 아니어도(예: refresh 주기가 10분이라 몇 분 늦게 걸려도) 그날 첫 실행이
//   놓치지 않고 잡게 한다. 클라우드는 24시간 켜져 있으니 이 창을 넓혀도 위험하지
//   않다 — 오히려 "정확히 그 1분을 놓치면 하루 통째로 빠진다"는 취약점을 없앤다.
function nowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function isInSnapshotWindow(broker, now) {
  const hour = now.getUTCHours(); // now가 이미 KST로 9시간 밀려 있으므로 getUTC*를 "KST 시각"으로 그대로 씀
  const minute = now.getUTCMinutes();
  if (broker === "Kiwoom") return hour === 15 && minute >= 20;
  if (broker === "KIS") {
    if (hour < 4 || hour >= 12) return false;
    if (hour === 4 && minute < 50) return false;
    return true;
  }
  return false;
}

// KIS는 05:00 KST 무렵(또는 그 이후 정오까지) 찍는데, 이건 "그날(한국시간 기준
// 어제 낮)의 마감"을 뜻한다 — 미국장이 한국시간 밤~새벽에 걸치므로, 정오 전에
// 찍어도 날짜는 전날로 남긴다.
function snapshotDateFor(broker, now) {
  const d = new Date(now);
  if (broker === "KIS" && d.getUTCHours() < 12) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

async function hasSnapshotToday(supabase, broker, snapshotDate) {
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
// 창 시간이 아니거나 오늘 이미 남겼으면 조용히 건너뛴다 — maybe_snapshot(broker, rows)
// 자체가 실패해도(예: Supabase 일시 오류) 잔고 갱신 자체가 죽으면 안 되므로, 호출부에서
// try/catch로 감싸 쓴다.
async function maybeSnapshot(supabase, broker, rows) {
  if (!rows || rows.length === 0) return;
  const now = nowKst();
  if (!isInSnapshotWindow(broker, now)) return;

  const snapshotDate = snapshotDateFor(broker, now);
  if (await hasSnapshotToday(supabase, broker, snapshotDate)) return;

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
  console.log(`일별 스냅샷 저장 완료 (${broker}, ${snapshotDate}): 수익 ${krwProfit.toFixed(0)}원, 수익률 ${krwProfitRate.toFixed(2)}%`);
}

module.exports = { maybeSnapshot, isInSnapshotWindow, snapshotDateFor };
