// MOGRI AI FOREX SIGNAL ANALYZER
// Server-side market analysis for Vercel
// IMPORTANT: This file contains NO browser/document/window code.

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).json({ ok: true });
    }

    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "TWELVE_DATA_API_KEY is missing in Vercel environment variables.",
        type: "CONFIG_ERROR"
      });
    }

    const symbol = String(req.query?.symbol || "EUR/USD").trim();
    const interval = String(req.query?.interval || "15min").trim();
    const mtf = String(req.query?.mtf || "false").toLowerCase() === "true";

    const allowedIntervals = ["5min", "15min", "1h", "4h"];

    if (!allowedIntervals.includes(interval) && !mtf) {
      return res.status(400).json({
        ok: false,
        error: "Invalid interval.",
        allowed: allowedIntervals
      });
    }

    const allowedSymbols = [
      "EUR/USD",
      "GBP/USD",
      "USD/JPY",
      "XAU/USD",
      "USD/CAD",
      "AUD/USD"
    ];

    if (!allowedSymbols.includes(symbol)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid symbol.",
        allowed: allowedSymbols
      });
    }

    // ---------------------------------------------------------
    // TWELVE DATA FETCH
    // ---------------------------------------------------------

    async function getCandles(pair, tf) {
      const params = new URLSearchParams({
        symbol: pair,
        interval: tf,
        outputsize: "100",
        apikey: apiKey
      });

      const url = `https://api.twelvedata.com/time_series?${params.toString()}`;

      const response = await fetch(url);
      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Twelve Data returned an invalid JSON response.");
      }

      if (!response.ok) {
        throw new Error(
          `Twelve Data HTTP ${response.status}: ${
            data?.message || "Unknown API error"
          }`
        );
      }

      if (data?.status === "error") {
        const message = data?.message || "Twelve Data API error.";

        if (
          /limit|quota|credit|rate/i.test(message)
        ) {
          const error = new Error(message);
          error.code = "API_LIMIT";
          throw error;
        }

        const error = new Error(message);
        error.code = "TWELVE_DATA_ERROR";
        throw error;
      }

      if (!Array.isArray(data?.values) || data.values.length < 20) {
        const error = new Error(
          "Twelve Data returned insufficient candle data."
        );
        error.code = "NO_CANDLE_DATA";
        throw error;
      }

      return data.values
        .map(c => ({
          time: c.datetime,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0)
        }))
        .filter(
          c =>
            Number.isFinite(c.open) &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close)
        )
        .reverse();
    }

    // ---------------------------------------------------------
    // BASIC HELPERS
    // ---------------------------------------------------------

    const last = arr => arr[arr.length - 1];

    const previous = arr => arr[arr.length - 2];

    function body(c) {
      return Math.abs(c.close - c.open);
    }

    function bullish(c) {
      return c.close > c.open;
    }

    function bearish(c) {
      return c.close < c.open;
    }

    function average(values) {
      if (!values.length) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function roundPrice(value, price) {
      if (!Number.isFinite(value)) return null;

      let decimals = 5;

      if (price >= 1000) decimals = 2;
      else if (price >= 100) decimals = 3;
      else if (price >= 10) decimals = 3;
      else if (price >= 1) decimals = 5;
      else decimals = 5;

      return Number(value.toFixed(decimals));
    }

    // ---------------------------------------------------------
    // ATR
    // ---------------------------------------------------------

    function calculateATR(candles, period = 14) {
      if (candles.length < period + 1) return 0;

      const trs = [];

      for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const p = candles[i - 1];

        const tr = Math.max(
          c.high - c.low,
          Math.abs(c.high - p.close),
          Math.abs(c.low - p.close)
        );

        trs.push(tr);
      }

      return average(trs.slice(-period));
    }

    // ---------------------------------------------------------
    // MARKET STRUCTURE
    // ---------------------------------------------------------

    function detectStructure(candles) {
      const recent = candles.slice(-30);

      if (recent.length < 10) {
        return {
          direction: "NEUTRAL",
          label: "NEUTRAL",
          strength: 0
        };
      }

      const highs = recent.map(c => c.high);
      const lows = recent.map(c => c.low);

      const midpoint = Math.floor(recent.length / 2);

      const oldHigh = Math.max(...highs.slice(0, midpoint));
      const newHigh = Math.max(...highs.slice(midpoint));

      const oldLow = Math.min(...lows.slice(0, midpoint));
      const newLow = Math.min(...lows.slice(midpoint));

      const price = last(candles).close;

      let direction = "NEUTRAL";
      let strength = 0;

      if (newHigh > oldHigh && newLow > oldLow) {
        direction = "BULLISH";
        strength = 2;
      } else if (newHigh < oldHigh && newLow < oldLow) {
        direction = "BEARISH";
        strength = 2;
      } else if (price > oldHigh) {
        direction = "BULLISH";
        strength = 1;
      } else if (price < oldLow) {
        direction = "BEARISH";
        strength = 1;
      }

      return {
        direction,
        label: direction,
        strength
      };
    }

    // ---------------------------------------------------------
    // BOS / CHOCH
    // ---------------------------------------------------------

    function detectBOS(candles) {
      if (candles.length < 12) {
        return {
          type: "NONE",
          direction: "NEUTRAL",
          strength: 0
        };
      }

      const current = last(candles);
      const previousCandles = candles.slice(-12, -1);

      const recentHigh = Math.max(
        ...previousCandles.map(c => c.high)
      );

      const recentLow = Math.min(
        ...previousCandles.map(c => c.low)
      );

      if (current.close > recentHigh) {
        return {
          type: "BOS",
          direction: "BULLISH",
          strength: 2
        };
      }

      if (current.close < recentLow) {
        return {
          type: "BOS",
          direction: "BEARISH",
          strength: 2
        };
      }

      return {
        type: "NONE",
        direction: "NEUTRAL",
        strength: 0
      };
    }

    // ---------------------------------------------------------
    // LIQUIDITY SWEEP
    // ---------------------------------------------------------

    function detectLiquidity(candles) {
      if (candles.length < 12) {
        return {
          type: "NONE",
          direction: "NEUTRAL",
          strength: 0
        };
      }

      const current = last(candles);
      const previousCandles = candles.slice(-12, -1);

      const previousHigh = Math.max(
        ...previousCandles.map(c => c.high)
      );

      const previousLow = Math.min(
        ...previousCandles.map(c => c.low)
      );

      // High sweep then close back below
      if (
        current.high > previousHigh &&
        current.close < previousHigh
      ) {
        return {
          type: "HIGH SWEEP",
          direction: "BEARISH",
          strength: 2
        };
      }

      // Low sweep then close back above
      if (
        current.low < previousLow &&
        current.close > previousLow
      ) {
        return {
          type: "LOW SWEEP",
          direction: "BULLISH",
          strength: 2
        };
      }

      return {
        type: "NONE",
        direction: "NEUTRAL",
        strength: 0
      };
    }

    // ---------------------------------------------------------
    // FVG
    // ---------------------------------------------------------

    function detectFVG(candles) {
      if (candles.length < 5) {
        return {
          type: "NONE",
          direction: "NEUTRAL",
          low: null,
          high: null,
          strength: 0
        };
      }

      for (let i = candles.length - 1; i >= 2; i--) {
        const a = candles[i - 2];
        const c = candles[i];

        // Bullish FVG
        if (c.low > a.high) {
          return {
            type: "BULLISH FVG",
            direction: "BULLISH",
            low: a.high,
            high: c.low,
            strength: 2
          };
        }

        // Bearish FVG
        if (c.high < a.low) {
          return {
            type: "BEARISH FVG",
            direction: "BEARISH",
            low: c.high,
            high: a.low,
            strength: 2
          };
        }
      }

      return {
        type: "NONE",
        direction: "NEUTRAL",
        low: null,
        high: null,
        strength: 0
      };
    }

    // ---------------------------------------------------------
    // MOMENTUM
    // ---------------------------------------------------------

    function detectMomentum(candles) {
      const recent = candles.slice(-10);

      if (recent.length < 5) {
        return {
          direction: "NEUTRAL",
          strength: 0
        };
      }

      const bullishCount = recent.filter(bullish).length;
      const bearishCount = recent.filter(bearish).length;

      const lastCandle = last(candles);
      const avgBody = average(recent.map(body));

      if (
        bullishCount > bearishCount &&
        body(lastCandle) >= avgBody
      ) {
        return {
          direction: "BULLISH",
          strength: 2
        };
      }

      if (
        bearishCount > bullishCount &&
        body(lastCandle) >= avgBody
      ) {
        return {
          direction: "BEARISH",
          strength: 2
        };
      }

      return {
        direction: "NEUTRAL",
        strength: 0
      };
    }

    // ---------------------------------------------------------
    // ORDER BLOCK
    // ---------------------------------------------------------

    function detectOrderBlock(candles) {
      if (candles.length < 15) {
        return {
          type: "NONE",
          high: null,
          low: null,
          time: null,
          status: "NONE",
          strength: 0
        };
      }

      const atr = calculateATR(candles, 14);

      if (!atr) {
        return {
          type: "NONE",
          high: null,
          low: null,
          time: null,
          status: "NONE",
          strength: 0
        };
      }

      const recent = candles.slice(-20);

      for (let i = recent.length - 4; i >= 1; i--) {
        const ob = recent[i];
        const next = recent[i + 1];
        const after = recent[i + 2];

        if (!ob || !next || !after) continue;

        const displacement =
          Math.abs(after.close - ob.close);

        // Bullish order block
        if (
          bearish(ob) &&
          bullish(next) &&
          bullish(after) &&
          after.close > ob.high &&
          displacement >= atr * 0.5
        ) {
          const currentPrice = last(candles).close;

          let status = "AWAY";

          if (
            currentPrice >= ob.low &&
            currentPrice <= ob.high
          ) {
            status = "IN_ZONE";
          } else if (currentPrice > ob.high) {
            status = "ABOVE_ZONE";
          } else if (currentPrice < ob.low) {
            status = "BELOW_ZONE";
          }

          return {
            type: "BULLISH",
            high: ob.high,
            low: ob.low,
            time: ob.time,
            status,
            strength: 2
          };
        }

        // Bearish order block
        if (
          bullish(ob) &&
          bearish(next) &&
          bearish(after) &&
          after.close < ob.low &&
          displacement >= atr * 0.5
        ) {
          const currentPrice = last(candles).close;

          let status = "AWAY";

          if (
            currentPrice >= ob.low &&
            currentPrice <= ob.high
          ) {
            status = "IN_ZONE";
          } else if (currentPrice > ob.high) {
            status = "ABOVE_ZONE";
          } else if (currentPrice < ob.low) {
            status = "BELOW_ZONE";
          }

          return {
            type: "BEARISH",
            high: ob.high,
            low: ob.low,
            time: ob.time,
            status,
            strength: 2
          };
        }
      }

      return {
        type: "NONE",
        high: null,
        low: null,
        time: null,
        status: "NONE",
        strength: 0
      };
    }

    // ---------------------------------------------------------
    // SCORE
    // ---------------------------------------------------------

    function calculateScore(
      structure,
      bos,
      liquidity,
      fvg,
      momentum,
      ob
    ) {
      let bull = 0;
      let bear = 0;

      if (structure.direction === "BULLISH") {
        bull += 25;
      }

      if (structure.direction === "BEARISH") {
        bear += 25;
      }

      if (bos.direction === "BULLISH") {
        bull += 20;
      }

      if (bos.direction === "BEARISH") {
        bear += 20;
      }

      if (liquidity.direction === "BULLISH") {
        bull += 15;
      }

      if (liquidity.direction === "BEARISH") {
        bear += 15;
      }

      if (fvg.direction === "BULLISH") {
        bull += 15;
      }

      if (fvg.direction === "BEARISH") {
        bear += 15;
      }

      if (momentum.direction === "BULLISH") {
        bull += 15;
      }

      if (momentum.direction === "BEARISH") {
        bear += 15;
      }

      if (ob.type === "BULLISH") {
        bull += 10;
      }

      if (ob.type === "BEARISH") {
        bear += 10;
      }

      return {
        bull: Math.min(bull, 100),
        bear: Math.min(bear, 100)
      };
    }

    // ---------------------------------------------------------
    // TRADE LEVELS
    // ---------------------------------------------------------

    function calculateLevels(
      candles,
      direction,
      ob
    ) {
      const price = last(candles).close;
      const atr = calculateATR(candles, 14);

      if (!atr || !["BUY", "SELL"].includes(direction)) {
        return {
          entryLow: null,
          entryHigh: null,
          sl: null,
          tp1: null,
          tp2: null,
          tp3: null
        };
      }

      let entryLow;
      let entryHigh;
      let sl;

      if (
        direction === "BUY" &&
        ob.type === "BULLISH" &&
        Number.isFinite(ob.low) &&
        Number.isFinite(ob.high)
      ) {
        entryLow = ob.low;
        entryHigh = ob.high;
        sl = ob.low - atr * 0.20;
      } else if (
        direction === "SELL" &&
        ob.type === "BEARISH" &&
        Number.isFinite(ob.low) &&
        Number.isFinite(ob.high)
      ) {
        entryLow = ob.low;
        entryHigh = ob.high;
        sl = ob.high + atr * 0.20;
      } else if (direction === "BUY") {
        entryLow = price - atr * 0.25;
        entryHigh = price + atr * 0.10;
        sl = entryLow - atr * 0.50;
      } else {
        entryLow = price - atr * 0.10;
        entryHigh = price + atr * 0.25;
        sl = entryHigh + atr * 0.50;
      }

      const entry =
        direction === "BUY"
          ? (entryLow + entryHigh) / 2
          : (entryLow + entryHigh) / 2;

      const risk = Math.abs(entry - sl);

      if (!risk) {
        return {
          entryLow: null,
          entryHigh: null,
          sl: null,
          tp1: null,
          tp2: null,
          tp3: null
        };
      }

      let tp1;
      let tp2;
      let tp3;

      if (direction === "BUY") {
        tp1 = entry + risk;
        tp2 = entry + risk * 2;
        tp3 = entry + risk * 3;
      } else {
        tp1 = entry - risk;
        tp2 = entry - risk * 2;
        tp3 = entry - risk * 3;
      }

      return {
        entryLow: roundPrice(entryLow, price),
        entryHigh: roundPrice(entryHigh, price),
        sl: roundPrice(sl, price),
        tp1: roundPrice(tp1, price),
        tp2: roundPrice(tp2, price),
        tp3: roundPrice(tp3, price)
      };
    }

    // ---------------------------------------------------------
    // ANALYZE ONE TIMEFRAME
    // ---------------------------------------------------------

    function analyzeCandles(pair, tf, candles) {
      const price = last(candles).close;

      const structure = detectStructure(candles);
      const bos = detectBOS(candles);
      const liquidity = detectLiquidity(candles);
      const fvg = detectFVG(candles);
      const momentum = detectMomentum(candles);
      const orderBlock = detectOrderBlock(candles);

      const scores = calculateScore(
        structure,
        bos,
        liquidity,
        fvg,
        momentum,
        orderBlock
      );

      let signal = "WAIT";
      let confidence = 50;

      const lead = Math.abs(scores.bull - scores.bear);

      if (
        scores.bull >= 60 &&
        scores.bull > scores.bear &&
        lead >= 15
      ) {
        signal = "BUY";
        confidence = clamp(
          55 + Math.round(scores.bull * 0.40),
          55,
          95
        );
      } else if (
        scores.bear >= 60 &&
        scores.bear > scores.bull &&
        lead >= 15
      ) {
        signal = "SELL";
        confidence = clamp(
          55 + Math.round(scores.bear * 0.40),
          55,
          95
        );
      } else {
        confidence = clamp(
          40 + Math.round(lead * 0.35),
          40,
          64
        );
      }

      const levels = calculateLevels(
        candles,
        signal,
        orderBlock
      );

      return {
        pair,
        tf,
        price: roundPrice(price, price),

        signal,
        confidence,

        bias: structure.direction,

        structure: structure.direction,
        bos: bos.type,
        bosDirection: bos.direction,

        liquidity: liquidity.type,
        liquidityDirection: liquidity.direction,

        fvg: fvg.type,
        fvgDirection: fvg.direction,

        momentum: momentum.direction,

        orderBlock,
        obType: orderBlock.type,
        obHigh: orderBlock.high
          ? roundPrice(orderBlock.high, price)
          : null,
        obLow: orderBlock.low
          ? roundPrice(orderBlock.low, price)
          : null,
        obTime: orderBlock.time,
        obStatus: orderBlock.status,
        obStrength: orderBlock.strength,

        bullScore: scores.bull,
        bearScore: scores.bear,
        scoreTotal: Math.max(
          scores.bull,
          scores.bear
        ),

        ...levels,

        time: last(candles).time,
        candleCount: candles.length
      };
    }

    // ---------------------------------------------------------
    // MTF ANALYSIS
    // ---------------------------------------------------------

    if (mtf) {
      const [h4, h1, m15, m5] = await Promise.all([
        getCandles(symbol, "4h"),
        getCandles(symbol, "1h"),
        getCandles(symbol, "15min"),
        getCandles(symbol, "5min")
      ]);

      const H4 = analyzeCandles(symbol, "4H", h4);
      const H1 = analyzeCandles(symbol, "1H", h1);
      const M15 = analyzeCandles(symbol, "15M", m15);
      const M5 = analyzeCandles(symbol, "5M", m5);

      let signal = "WAIT";
      let confidence = 50;

      const bullishAlignment =
        H4.signal === "BUY" ||
        H4.bias === "BULLISH";

      const bearishAlignment =
        H4.signal === "SELL" ||
        H4.bias === "BEARISH";

      if (
        bullishAlignment &&
        H1.bias === "BULLISH" &&
        M15.bias === "BULLISH" &&
        M5.bias === "BULLISH"
      ) {
        signal = "BUY";

        confidence = clamp(
          Math.round(
            (
              H4.confidence +
              H1.confidence +
              M15.confidence +
              M5.confidence
            ) / 4
          ),
          65,
          95
        );
      } else if (
        bearishAlignment &&
        H1.bias === "BEARISH" &&
        M15.bias === "BEARISH" &&
        M5.bias === "BEARISH"
      ) {
        signal = "SELL";

        confidence = clamp(
          Math.round(
            (
              H4.confidence +
              H1.confidence +
              M15.confidence +
              M5.confidence
            ) / 4
          ),
          65,
          95
        );
      } else {
        const scores = [
          H4.confidence,
          H1.confidence,
          M15.confidence,
          M5.confidence
        ];

        confidence = clamp(
          Math.round(average(scores)),
          25,
          64
        );
      }

      const levels =
        signal === "BUY"
          ? calculateLevels(m15, "BUY", M15.orderBlock)
          : signal === "SELL"
          ? calculateLevels(m15, "SELL", M15.orderBlock)
          : {
              entryLow: null,
              entryHigh: null,
              sl: null,
              tp1: null,
              tp2: null,
              tp3: null
            };

      return res.status(200).json({
        ok: true,
        pair: symbol,
        tf: "MTF",

        price: M15.price,

        signal,
        confidence,

        sniper: signal !== "WAIT",

        bias: H4.bias,

        h4: H4,
        h1: H1,
        m15: M15,
        m5: M5,

        structure4H: H4.structure,
        structure1H: H1.structure,
        structure15M: M15.structure,
        structure5M: M5.structure,

        bos4H: H4.bos,
        bos1H: H1.bos,
        bos15M: M15.bos,
        bos5M: M5.bos,

        liquidity4H: H4.liquidity,
        liquidity1H: H1.liquidity,
        liquidity15M: M15.liquidity,
        liquidity5M: M5.liquidity,

        fvg4H: H4.fvg,
        fvg1H: H1.fvg,
        fvg15M: M15.fvg,
        fvg5M: M5.fvg,

        obType: M15.obType,
        obHigh: M15.obHigh,
        obLow: M15.obLow,
        obTime: M15.obTime,
        obStatus: M15.obStatus,
        obStrength: M15.obStrength,

        bullScore: Math.round(
          (
            H4.bullScore +
            H1.bullScore +
            M15.bullScore +
            M5.bullScore
          ) / 4
        ),

        bearScore: Math.round(
          (
            H4.bearScore +
            H1.bearScore +
            M15.bearScore +
            M5.bearScore
          ) / 4
        ),

        ...levels,

        time: M15.time,

        candleCount4H: h4.length,
        candleCount1H: h1.length,
        candleCount15M: m15.length,
        candleCount5M: m5.length
      });
    }

    // ---------------------------------------------------------
    // SINGLE TIMEFRAME
    // ---------------------------------------------------------

    const candles = await getCandles(symbol, interval);

    const result = analyzeCandles(
      symbol,
      interval,
      candles
    );

    return res.status(200).json({
      ok: true,
      ...result,
      candles: candles.length
    });

  } catch (error) {
    console.error("MOGRI MARKET API ERROR:", error);

    const code = error?.code;

    if (code === "API_LIMIT") {
      return res.status(429).json({
        ok: false,
        type: "API_LIMIT",
        error:
          "Twelve Data API limit reached. Please wait for the quota to reset."
      });
    }

    if (code === "TWELVE_DATA_ERROR") {
      return res.status(502).json({
        ok: false,
        type: "TWELVE_DATA_ERROR",
        error: error.message
      });
    }

    if (code === "NO_CANDLE_DATA") {
      return res.status(502).json({
        ok: false,
        type: "NO_CANDLE_DATA",
        error: error.message
      });
    }

    return res.status(500).json({
      ok: false,
      type: "SERVER_ERROR",
      error: error?.message || "Market server error."
    });
  }
}
