function n(v) {
  return Number(v);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function analyze(c) {
  if (c.length < 30) {
    throw Error("Not enough candles returned.");
  }

  let N = c.length;
  let L = c[N - 1];
  let P = c[N - 2];

  let r = c.slice(Math.max(0, N - 21), N - 1);
  let hi = Math.max(...r.map(x => x.high));
  let lo = Math.min(...r.map(x => x.low));

  // Fair Value Gap
  let a = c[N - 3];
  let d = c[N - 1];

  let bullF = a.high < d.low;
  let bearF = a.low > d.high;

  // Liquidity sweep
  let pr = c.slice(Math.max(0, N - 8), N - 1);
  let ph = Math.max(...pr.map(x => x.high));
  let pl = Math.min(...pr.map(x => x.low));

  let bullL = L.low < pl && L.close > pl;
  let bearL = L.high > ph && L.close < ph;

  // Market structure
  let bullS = L.close > hi;
  let bearS = L.close < lo;

  // Breakout / retest
  let rg = c.slice(Math.max(0, N - 13), N - 1);
  let rh = Math.max(...rg.map(x => x.high));
  let rl = Math.min(...rg.map(x => x.low));

  let bullR =
    P.close > rh &&
    L.low <= rh &&
    L.close >= rh;

  let bearR =
    P.close < rl &&
    L.high >= rl &&
    L.close <= rl;

  let bull = bullF || bullL || bullS || bullR;
  let bear = bearF || bearL || bearS || bearR;

  let bias =
    bull && !bear
      ? "BULLISH"
      : bear && !bull
      ? "BEARISH"
      : L.close > P.close
      ? "BULLISH"
      : L.close < P.close
      ? "BEARISH"
      : "NEUTRAL";

  let score =
    45 +
    (bullF || bearF ? 15 : 0) +
    (bullL || bearL ? 15 : 0) +
    (bullS || bearS ? 15 : 0) +
    (bullR || bearR ? 10 : 0);

  score = clamp(score, 35, 95);

  let sig =
    ((bias === "BULLISH" && bull && !bear) ||
      (bias === "BEARISH" && bear && !bull)) &&
    score >= 75
      ? bias === "BULLISH"
        ? "BUY"
        : "SELL"
      : "WAIT";

  let price = L.close;

  let slw = c.slice(Math.max(0, N - 12), N);
  let slo = Math.min(...slw.map(x => x.low));
  let shi = Math.max(...slw.map(x => x.high));

  let sz = Math.max(price * 0.0005, shi - slo);
  let buf = sz * 0.08;

  let el = price;
  let eh = price;
  let sl = price;
  let t1 = price;
  let t2 = price;
  let t3 = price;

  if (sig === "BUY") {
    el = bullF ? a.high : price - sz * 0.12;
    eh = bullF ? d.low : price + sz * 0.03;

    sl = Math.min(
      slo - buf,
      el - sz * 0.18
    );

    let risk = Math.max(
      price - sl,
      sz * 0.12
    );

    t1 = price + risk * 1.5;
    t2 = price + risk * 2.5;
    t3 = price + risk * 3.5;

  } else if (sig === "SELL") {

    el = bearF ? d.high : price - sz * 0.03;
    eh = bearF ? a.low : price + sz * 0.12;

    sl = Math.max(
      shi + buf,
      eh + sz * 0.18
    );

    let risk = Math.max(
      sl - price,
      sz * 0.12
    );

    t1 = price - risk * 1.5;
    t2 = price - risk * 2.5;
    t3 = price - risk * 3.5;
  }

  return {
    price,
    signal: sig,
    confidence: score,
    bias,

    fvg: bullF || bearF,
    liquidity: bullL || bearL,
    structure: bullS || bearS,
    breakRetest: bullR || bearR,

    entryLow: el,
    entryHigh: eh,

    sl,
    tp1: t1,
    tp2: t2,
    tp3: t3,

    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
}

export default async function handler(req, res) {

  try {

    let key = process.env.TWELVE_DATA_API_KEY;

    if (!key) {
      return res.status(500).json({
        error: "TWELVE_DATA_API_KEY is missing in Vercel."
      });
    }

    let symbol = String(
      req.query.symbol || "EUR/USD"
    );

    let interval = String(
      req.query.interval || "15min"
    );

    if (!["5min", "15min", "1h", "4h"].includes(interval)) {
      return res.status(400).json({
        error: "Unsupported timeframe."
      });
    }

    let u =
      `https://api.twelvedata.com/time_series` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${encodeURIComponent(interval)}` +
      `&outputsize=150` +
      `&apikey=${encodeURIComponent(key)}`;

    let r = await fetch(u);
    let d = await r.json();

    if (
      !r.ok ||
      d.status === "error" ||
      !Array.isArray(d.values)
    ) {
      return res.status(502).json({
        error:
          d.message ||
          "Twelve Data failed to return candles."
      });
    }

    let candles = d.values
      .reverse()
      .map(x => ({
        datetime: x.datetime,
        open: n(x.open),
        high: n(x.high),
        low: n(x.low),
        close: n(x.close)
      }))
      .filter(x =>
        [
          x.open,
          x.high,
          x.low,
          x.close
        ].every(Number.isFinite)
      );

    return res.status(200).json({
      ...analyze(candles),
      pair: symbol,
      tf: interval,
      candles: candles.length
    });

  } catch (e) {

    return res.status(500).json({
      error: e.message || "Server error"
    });

  }
}
