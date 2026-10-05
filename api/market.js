// api/market.js

export default async function handler(req, res) {
  try {
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TWELVE_DATA_API_KEY is missing in Vercel."
      });
    }

    const { symbol, interval, mtf } = req.query;

    if (!symbol) {
      return res.status(400).json({
        error: "Missing symbol."
      });
    }

    const allowedIntervals = ["5min", "15min", "1h", "4h"];

    const selectedInterval = interval || "15min";

    if (!allowedIntervals.includes(selectedInterval)) {
      return res.status(400).json({
        error: "Invalid interval. Use 5min, 15min, 1h or 4h."
      });
    }

    /*
    ============================================================
    TWELVE DATA
    ============================================================
    */

    async function getCandles(symbolName, intervalName) {
      const url =
        `https://api.twelvedata.com/time_series` +
        `?symbol=${encodeURIComponent(symbolName)}` +
        `&interval=${intervalName}` +
        `&outputsize=100` +
        `&apikey=${encodeURIComponent(apiKey)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Market data request failed: HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (
        data.status === "error" ||
        data.code ||
        !data.values
      ) {
        throw new Error(
          data.message ||
          "Twelve Data did not return market data."
        );
      }

      return data.values
        .map(candle => ({
          time: candle.datetime,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume || 0)
        }))
        .reverse();
    }

    /*
    ============================================================
    BASIC HELPERS
    ============================================================
    */

    function last(candles) {
      return candles[candles.length - 1];
    }

    function previous(candles) {
      return candles[candles.length - 2];
    }

    function average(values) {
      if (!values.length) return 0;

      return (
        values.reduce((sum, value) => sum + value, 0) /
        values.length
      );
    }

    function body(candle) {
      return Math.abs(candle.close - candle.open);
    }

    function bullish(candle) {
      return candle.close > candle.open;
    }

    function bearish(candle) {
      return candle.close < candle.open;
    }

    /*
    ============================================================
    MARKET STRUCTURE
    ============================================================
    */

    function structure(candles) {
      if (candles.length < 20) {
        return "NEUTRAL";
      }

      const recent = candles.slice(-20);

      const highs = recent.map(c => c.high);
      const lows = recent.map(c => c.low);

      const recentHigh = Math.max(...highs.slice(-8));
      const previousHigh = Math.max(...highs.slice(0, -8));

      const recentLow = Math.min(...lows.slice(-8));
      const previousLow = Math.min(...lows.slice(0, -8));

      if (
        recentHigh > previousHigh &&
        recentLow > previousLow
      ) {
        return "BULLISH";
      }

      if (
        recentHigh < previousHigh &&
        recentLow < previousLow
      ) {
        return "BEARISH";
      }

      return "NEUTRAL";
    }

    /*
    ============================================================
    BOS / CHOCH
    ============================================================
    */

    function bosChoch(candles) {
      if (candles.length < 20) {
        return "NONE";
      }

      const current = last(candles);

      const lookback = candles.slice(-15, -2);

      const highestHigh = Math.max(
        ...lookback.map(c => c.high)
      );

      const lowestLow = Math.min(
        ...lookback.map(c => c.low)
      );

      if (current.close > highestHigh) {
        return "BULLISH BOS";
      }

      if (current.close < lowestLow) {
        return "BEARISH BOS";
      }

      /*
      Check for possible CHOCH.
      */

      const mid = candles.slice(-30, -15);

      if (mid.length >= 5) {
        const midHigh = Math.max(
          ...mid.map(c => c.high)
        );

        const midLow = Math.min(
          ...mid.map(c => c.low)
        );

        if (
          current.close > midHigh &&
          structure(candles) !== "BULLISH"
        ) {
          return "BULLISH CHOCH";
        }

        if (
          current.close < midLow &&
          structure(candles) !== "BEARISH"
        ) {
          return "BEARISH CHOCH";
        }
      }

      return "NONE";
    }

    /*
    ============================================================
    LIQUIDITY SWEEP
    ============================================================
    */

    function liquiditySweep(candles) {
      if (candles.length < 10) {
        return "NONE";
      }

      const current = last(candles);

      const previousCandles = candles.slice(-10, -1);

      const previousHigh = Math.max(
        ...previousCandles.map(c => c.high)
      );

      const previousLow = Math.min(
        ...previousCandles.map(c => c.low)
      );

      /*
      Bearish liquidity sweep:
      Price takes previous high but closes back below it.
      */

      if (
        current.high > previousHigh &&
        current.close < previousHigh
      ) {
        return "BEARISH SWEEP";
      }

      /*
      Bullish liquidity sweep:
      Price takes previous low but closes back above it.
      */

      if (
        current.low < previousLow &&
        current.close > previousLow
      ) {
        return "BULLISH SWEEP";
      }

      return "NONE";
    }

    /*
    ============================================================
    FAIR VALUE GAP
    ============================================================
    */

    function fairValueGap(candles) {
      if (candles.length < 5) {
        return "NONE";
      }

      const a = candles[candles.length - 3];
      const b = candles[candles.length - 2];
      const c = candles[candles.length - 1];

      /*
      Bullish FVG
      */

      if (c.low > a.high) {
        return "BULLISH FVG";
      }

      /*
      Bearish FVG
      */

      if (c.high < a.low) {
        return "BEARISH FVG";
      }

      return "NONE";
    }

    /*
    ============================================================
    MOMENTUM
    ============================================================
    */

    function momentum(candles) {
      if (candles.length < 15) {
        return "NEUTRAL";
      }

      const recent = candles.slice(-5);
      const previousSet = candles.slice(-10, -5);

      const recentMove =
        last(recent).close -
        recent[0].open;

      const previousMove =
        last(previousSet).close -
        previousSet[0].open;

      if (
        recentMove > 0 &&
        recentMove > previousMove
      ) {
        return "BULLISH";
      }

      if (
        recentMove < 0 &&
        recentMove < previousMove
      ) {
        return "BEARISH";
      }

      return "NEUTRAL";
    }

    /*
    ============================================================
    ATR
    ============================================================
    */

    function calculateATR(candles, period = 14) {
      if (candles.length < period + 1) {
        return 0;
      }

      const ranges = [];

      for (
        let i = candles.length - period;
        i < candles.length;
        i++
      ) {
        const current = candles[i];
        const prev = candles[i - 1];

        if (!prev) continue;

        const trueRange = Math.max(
          current.high - current.low,
          Math.abs(current.high - prev.close),
          Math.abs(current.low - prev.close)
        );

        ranges.push(trueRange);
      }

      return average(ranges);
    }

    /*
    ============================================================
    ENTRY / SL / TP
    ============================================================
    */

    function calculateLevels(
      candles,
      direction
    ) {
      const current = last(candles);

      const price = current.close;

      const atr = calculateATR(candles);

      const safeATR =
        atr > 0
          ? atr
          : price * 0.001;

      let entryLow;
      let entryHigh;
      let sl;
      let tp1;
      let tp2;
      let tp3;

      if (direction === "BUY") {
        entryLow = price - safeATR * 0.20;
        entryHigh = price + safeATR * 0.10;

        sl = price - safeATR * 1.20;

        const risk = price - sl;

        tp1 = price + risk * 1.0;
        tp2 = price + risk * 2.0;
        tp3 = price + risk * 3.0;
      }

      if (direction === "SELL") {
        entryLow = price - safeATR * 0.10;
        entryHigh = price + safeATR * 0.20;

        sl = price + safeATR * 1.20;

        const risk = sl - price;

        tp1 = price - risk * 1.0;
        tp2 = price - risk * 2.0;
        tp3 = price - risk * 3.0;
      }

      return {
        entryLow,
        entryHigh,
        sl,
        tp1,
        tp2,
        tp3
      };
    }

    /*
    ============================================================
    SINGLE TIMEFRAME ANALYSIS
    ============================================================
    */

    function singleTimeframeAnalysis(
      candles
    ) {
      const marketStructure =
        structure(candles);

      const bos =
        bosChoch(candles);

      const liquidity =
        liquiditySweep(candles);

      const fvg =
        fairValueGap(candles);

      const marketMomentum =
        momentum(candles);

      return {
        structure: marketStructure,
        bos,
        liquidity,
        fvg,
        momentum: marketMomentum
      };
    }

    /*
    ============================================================
    MULTI-TIMEFRAME SIGNAL ENGINE
    ============================================================
    
    4H  = directional bias
    1H  = market structure
    15M = confirmation
    5M  = entry confirmation
    */

    function buildMTFSignal(
      h4,
      h1,
      m15,
      m5
    ) {
      let bullScore = 0;
      let bearScore = 0;

      /*
      4H BIAS
      */

      if (h4.structure === "BULLISH") {
        bullScore += 2;
      }

      if (h4.structure === "BEARISH") {
        bearScore += 2;
      }

      /*
      1H STRUCTURE
      */

      if (h1.structure === "BULLISH") {
        bullScore += 2;
      }

      if (h1.structure === "BEARISH") {
        bearScore += 2;
      }

      /*
      15M STRUCTURE
      */

      if (m15.structure === "BULLISH") {
        bullScore += 1;
      }

      if (m15.structure === "BEARISH") {
        bearScore += 1;
      }

      /*
      15M BOS / CHOCH
      */

      if (
        m15.bos === "BULLISH BOS" ||
        m15.bos === "BULLISH CHOCH"
      ) {
        bullScore += 1;
      }

      if (
        m15.bos === "BEARISH BOS" ||
        m15.bos === "BEARISH CHOCH"
      ) {
        bearScore += 1;
      }

      /*
      15M LIQUIDITY
      */

      if (
        m15.liquidity ===
        "BULLISH SWEEP"
      ) {
        bullScore += 1;
      }

      if (
        m15.liquidity ===
        "BEARISH SWEEP"
      ) {
        bearScore += 1;
      }

      /*
      15M FVG
      */

      if (
        m15.fvg ===
        "BULLISH FVG"
      ) {
        bullScore += 1;
      }

      if (
        m15.fvg ===
        "BEARISH FVG"
      ) {
        bearScore += 1;
      }

      /*
      5M BOS / CHOCH
      */

      if (
        m5.bos === "BULLISH BOS" ||
        m5.bos === "BULLISH CHOCH"
      ) {
        bullScore += 1;
      }

      if (
        m5.bos === "BEARISH BOS" ||
        m5.bos === "BEARISH CHOCH"
      ) {
        bearScore += 1;
      }

      /*
      5M LIQUIDITY
      */

      if (
        m5.liquidity ===
        "BULLISH SWEEP"
      ) {
        bullScore += 1;
      }

      if (
        m5.liquidity ===
        "BEARISH SWEEP"
      ) {
        bearScore += 1;
      }

      /*
      5M FVG
      */

      if (
        m5.fvg === "BULLISH FVG"
      ) {
        bullScore += 1;
      }

      if (
        m5.fvg === "BEARISH FVG"
      ) {
        bearScore += 1;
      }

      /*
      5M MOMENTUM
      */

      if (
        m5.momentum === "BULLISH"
      ) {
        bullScore += 1;
      }

      if (
        m5.momentum === "BEARISH"
      ) {
        bearScore += 1;
      }

      /*
      ========================================================
      STRICT DIRECTIONAL RULE
      ========================================================
      
      We don't want the system producing BUY/SELL
      just because one timeframe looks good.

      4H + 1H must agree.
      15M must agree.
      5M must confirm.
      */

      const bullishHigherTF =
        h4.structure === "BULLISH" &&
        h1.structure === "BULLISH";

      const bearishHigherTF =
        h4.structure === "BEARISH" &&
        h1.structure === "BEARISH";

      const bullish15M =
        m15.structure === "BULLISH";

      const bearish15M =
        m15.structure === "BEARISH";

      const bullish5M =
        m5.structure === "BULLISH";

      const bearish5M =
        m5.structure === "BEARISH";

      const bullishEntryConfirmation =
        (
          m5.bos === "BULLISH BOS" ||
          m5.bos === "BULLISH CHOCH"
        ) &&
        (
          m5.liquidity === "BULLISH SWEEP" ||
          m5.fvg === "BULLISH FVG" ||
          m5.momentum === "BULLISH"
        );

      const bearishEntryConfirmation =
        (
          m5.bos === "BEARISH BOS" ||
          m5.bos === "BEARISH CHOCH"
        ) &&
        (
          m5.liquidity === "BEARISH SWEEP" ||
          m5.fvg === "BEARISH FVG" ||
          m5.momentum === "BEARISH"
        );

      let signal = "WAIT";
      let confidence = 50;

      /*
      BUY
      */

      if (
        bullishHigherTF &&
        bullish15M &&
        bullish5M &&
        bullishEntryConfirmation &&
        bullScore >= 7 &&
        bullScore > bearScore + 2
      ) {
        signal = "BUY";

        confidence = Math.min(
          95,
          65 +
          (bullScore - bearScore) * 4
        );
      }

      /*
      SELL
      */

      if (
        bearishHigherTF &&
        bearish15M &&
        bearish5M &&
        bearishEntryConfirmation &&
        bearScore >= 7 &&
        bearScore > bullScore + 2
      ) {
        signal = "SELL";

        confidence = Math.min(
          95,
          65 +
          (bearScore - bullScore) * 4
        );
      }

      /*
      WAIT
      */

      if (signal === "WAIT") {
        confidence = Math.min(
          65,
          45 +
          Math.abs(
            bullScore - bearScore
          ) * 3
        );
      }

      return {
        signal,
        confidence,
        bullScore,
        bearScore
      };
    }

    /*
    ============================================================
    MAIN REQUEST
    ============================================================
    */

    /*
    Lightweight single-timeframe request.

    Used by scanner so that scanning does not
    consume 4 API credits per pair.
    */

    if (mtf !== "true") {
      const candles =
        await getCandles(
          symbol,
          selectedInterval
        );

      const analysis =
        singleTimeframeAnalysis(
          candles
        );

      const current =
        last(candles);

      const levels =
        calculateLevels(
          candles,
          "BUY"
        );

      return res.status(200).json({
        ok: true,

        pair: symbol,

        tf: selectedInterval,

        price: current.close,

        signal: "WAIT",

        confidence: 50,

        bias: analysis.structure,

        structure:
          analysis.structure,

        bos:
          analysis.bos,

        liquidity:
          analysis.liquidity,

        fvg:
          analysis.fvg,

        momentum:
          analysis.momentum,

        entryLow:
          levels.entryLow,

        entryHigh:
          levels.entryHigh,

        sl:
          levels.sl,

        tp1:
          levels.tp1,

        tp2:
          levels.tp2,

        tp3:
          levels.tp3,

        time:
          current.time,

        candles
      });
    }

    /*
    ============================================================
    FULL MULTI-TIMEFRAME ANALYSIS
    ============================================================
    */

    const [
      h4Candles,
      h1Candles,
      m15Candles,
      m5Candles
    ] = await Promise.all([
      getCandles(symbol, "4h"),
      getCandles(symbol, "1h"),
      getCandles(symbol, "15min"),
      getCandles(symbol, "5min")
    ]);

    /*
    Analyze each timeframe.
    */

    const h4 =
      singleTimeframeAnalysis(
        h4Candles
      );

    const h1 =
      singleTimeframeAnalysis(
        h1Candles
      );

    const m15 =
      singleTimeframeAnalysis(
        m15Candles
      );

    const m5 =
      singleTimeframeAnalysis(
        m5Candles
      );

    /*
    Build final signal.
    */

    const finalSignal =
      buildMTFSignal(
        h4,
        h1,
        m15,
        m5
      );

    /*
    Current price comes from 5M.
    */

    const current =
      last(m5Candles);

    /*
    Calculate levels only when
    BUY or SELL is confirmed.
    */

    let levels = {
      entryLow: null,
      entryHigh: null,
      sl: null,
      tp1: null,
      tp2: null,
      tp3: null
    };

    if (
      finalSignal.signal === "BUY" ||
      finalSignal.signal === "SELL"
    ) {
      levels =
        calculateLevels(
          m5Candles,
          finalSignal.signal
        );
    }

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return res.status(200).json({
      ok: true,

      pair: symbol,

      tf: "MTF",

      price: current.close,

      signal:
        finalSignal.signal,

      confidence:
        finalSignal.confidence,

      bias:
        h4.structure,

      /*
      4H
      */

      h4Bias:
        h4.structure,

      h4BOS:
        h4.bos,

      h4Liquidity:
        h4.liquidity,

      h4FVG:
        h4.fvg,

      /*
      1H
      */

      h1Structure:
        h1.structure,

      h1BOS:
        h1.bos,

      h1Liquidity:
        h1.liquidity,

      h1FVG:
        h1.fvg,

      /*
      15M
      */

      m15Structure:
        m15.structure,

      m15BOS:
        m15.bos,

      m15Liquidity:
        m15.liquidity,

      m15FVG:
        m15.fvg,

      /*
      5M
      */

      m5Structure:
        m5.structure,

      m5BOS:
        m5.bos,

      m5Liquidity:
        m5.liquidity,

      m5FVG:
        m5.fvg,

      m5Momentum:
        m5.momentum,

      /*
      Scores
      */

      bullScore:
        finalSignal.bullScore,

      bearScore:
        finalSignal.bearScore,

      /*
      Trade levels
      */

      entryLow:
        levels.entryLow,

      entryHigh:
        levels.entryHigh,

      sl:
        levels.sl,

      tp1:
        levels.tp1,

      tp2:
        levels.tp2,

      tp3:
        levels.tp3,

      time:
        current.time,

      /*
      Candle counts
      */

      candles: {
        h4: h4Candles.length,
        h1: h1Candles.length,
        m15: m15Candles.length,
        m5: m5Candles.length
      }
    });

  } catch (error) {
    console.error(
      "MOGRI AI MARKET ERROR:",
      error
    );

    const message =
      error?.message ||
      "Unable to retrieve market data.";

    const isLimitError =
      /limit|credit|quota|rate/i.test(
        message
      );

    return res.status(
      isLimitError ? 429 : 500
    ).json({
      ok: false,

      error:
        isLimitError
          ? "Twelve Data API limit reached. Please wait for the quota to reset before requesting fresh market data."
          : message,

      type:
        isLimitError
          ? "API_LIMIT"
          : "MARKET_DATA_ERROR"
    });
  }
}
