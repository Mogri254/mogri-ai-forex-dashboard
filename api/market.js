// =====================================================
// MOGRI AI FOREX SIGNAL ANALYZER
// api/market.js
// REAL MARKET DATA • MTF • ORDER BLOCK ENGINE
// =====================================================

export default async function handler(req, res) {
  try {
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "TWELVE_DATA_API_KEY is missing in Vercel."
      });
    }

    const { symbol, interval, mtf } = req.query;

    if (!symbol) {
      return res.status(400).json({
        ok: false,
        error: "Missing symbol."
      });
    }

    const allowedIntervals = [
      "5min",
      "15min",
      "1h",
      "4h"
    ];

    const selectedInterval = interval || "15min";

    if (!allowedIntervals.includes(selectedInterval)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid interval. Use 5min, 15min, 1h or 4h."
      });
    }

    // =================================================
    // TWELVE DATA
    // =================================================

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

    // =================================================
    // HELPERS
    // =================================================

    function last(candles) {
      return candles[candles.length - 1];
    }

    function average(values) {
      if (!values.length) return 0;

      return (
        values.reduce(
          (sum, value) => sum + value,
          0
        ) / values.length
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

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    // =================================================
    // MARKET STRUCTURE
    // =================================================

    function structure(candles) {
      if (candles.length < 20) {
        return "NEUTRAL";
      }

      const recent = candles.slice(-20);

      const highs = recent.map(c => c.high);
      const lows = recent.map(c => c.low);

      const recentHigh =
        Math.max(...highs.slice(-8));

      const previousHigh =
        Math.max(...highs.slice(0, -8));

      const recentLow =
        Math.min(...lows.slice(-8));

      const previousLow =
        Math.min(...lows.slice(0, -8));

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

    // =================================================
    // BOS / CHOCH
    // =================================================

    function bosChoch(candles) {
      if (candles.length < 20) {
        return "NONE";
      }

      const current = last(candles);

      const lookback =
        candles.slice(-15, -2);

      const highestHigh =
        Math.max(
          ...lookback.map(c => c.high)
        );

      const lowestLow =
        Math.min(
          ...lookback.map(c => c.low)
        );

      if (current.close > highestHigh) {
        return "BULLISH BOS";
      }

      if (current.close < lowestLow) {
        return "BEARISH BOS";
      }

      const mid =
        candles.slice(-30, -15);

      if (mid.length >= 5) {
        const midHigh =
          Math.max(
            ...mid.map(c => c.high)
          );

        const midLow =
          Math.min(
            ...mid.map(c => c.low)
          );

        const currentStructure =
          structure(candles);

        if (
          current.close > midHigh &&
          currentStructure !== "BULLISH"
        ) {
          return "BULLISH CHOCH";
        }

        if (
          current.close < midLow &&
          currentStructure !== "BEARISH"
        ) {
          return "BEARISH CHOCH";
        }
      }

      return "NONE";
    }

    // =================================================
    // LIQUIDITY SWEEP
    // =================================================

    function liquiditySweep(candles) {
      if (candles.length < 10) {
        return "NONE";
      }

      const current = last(candles);

      const previousCandles =
        candles.slice(-10, -1);

      const previousHigh =
        Math.max(
          ...previousCandles.map(c => c.high)
        );

      const previousLow =
        Math.min(
          ...previousCandles.map(c => c.low)
        );

      // Price takes buy-side liquidity and closes back below
      if (
        current.high > previousHigh &&
        current.close < previousHigh
      ) {
        return "BEARISH SWEEP";
      }

      // Price takes sell-side liquidity and closes back above
      if (
        current.low < previousLow &&
        current.close > previousLow
      ) {
        return "BULLISH SWEEP";
      }

      return "NONE";
    }

    // =================================================
    // FAIR VALUE GAP
    // =================================================

    function fairValueGap(candles) {
      if (candles.length < 5) {
        return "NONE";
      }

      const a =
        candles[candles.length - 3];

      const c =
        candles[candles.length - 1];

      if (c.low > a.high) {
        return "BULLISH FVG";
      }

      if (c.high < a.low) {
        return "BEARISH FVG";
      }

      return "NONE";
    }

    // =================================================
    // ORDER BLOCK
    //
    // Logic:
    // Bullish OB:
    // Last meaningful bearish candle before
    // a strong bullish displacement/BOS.
    //
    // Bearish OB:
    // Last meaningful bullish candle before
    // a strong bearish displacement/BOS.
    // =================================================

    function detectOrderBlock(candles) {
      if (candles.length < 25) {
        return {
          type: "NONE",
          high: null,
          low: null,
          time: null,
          status: "NONE",
          strength: 0
        };
      }

      const current = last(candles);

      // Recent average body size
      const bodySample = candles
        .slice(-30, -3)
        .map(c => body(c));

      const averageBody =
        average(bodySample);

      const displacementMinimum =
        Math.max(
          averageBody * 1.35,
          bodySample.length
            ? averageBody * 0.8
            : 0
        );

      let bestBullish = null;
      let bestBearish = null;

      /*
       * Search recent candles.
       * We avoid using the very latest candle as
       * the OB candle because the latest candle
       * is still the confirmation candle.
       */
      const start =
        Math.max(3, candles.length - 18);

      const end =
        candles.length - 2;

      for (let i = start; i <= end; i++) {
        const ob = candles[i];

        if (!ob) continue;

        const next = candles[i + 1];

        if (!next) continue;

        // ---------------------------------------------
        // BULLISH ORDER BLOCK
        // Bearish candle followed by strong bullish
        // displacement that breaks nearby structure.
        // ---------------------------------------------

        if (bearish(ob)) {
          const forward =
            candles.slice(
              i + 1,
              Math.min(i + 5, candles.length)
            );

          const highestForward =
            Math.max(
              ...forward.map(c => c.high)
            );

          const bullishDisplacement =
            forward.some(
              c =>
                bullish(c) &&
                body(c) >= displacementMinimum
            );

          const breaksStructure =
            highestForward >
            Math.max(
              ...candles
                .slice(
                  Math.max(0, i - 8),
                  i
                )
                .map(c => c.high)
            );

          if (
            bullishDisplacement &&
            breaksStructure
          ) {
            const score =
              (bullishDisplacement ? 2 : 0) +
              (breaksStructure ? 2 : 0) +
              (body(ob) <= averageBody ? 1 : 0);

            if (
              !bestBullish ||
              score > bestBullish.strength
            ) {
              bestBullish = {
                type: "BULLISH OB",
                high: ob.high,
                low: ob.low,
                time: ob.time,
                strength: score
              };
            }
          }
        }

        // ---------------------------------------------
        // BEARISH ORDER BLOCK
        // Bullish candle followed by strong bearish
        // displacement that breaks nearby structure.
        // ---------------------------------------------

        if (bullish(ob)) {
          const forward =
            candles.slice(
              i + 1,
              Math.min(i + 5, candles.length)
            );

          const lowestForward =
            Math.min(
              ...forward.map(c => c.low)
            );

          const bearishDisplacement =
            forward.some(
              c =>
                bearish(c) &&
                body(c) >= displacementMinimum
            );

          const breaksStructure =
            lowestForward <
            Math.min(
              ...candles
                .slice(
                  Math.max(0, i - 8),
                  i
                )
                .map(c => c.low)
            );

          if (
            bearishDisplacement &&
            breaksStructure
          ) {
            const score =
              (bearishDisplacement ? 2 : 0) +
              (breaksStructure ? 2 : 0) +
              (body(ob) <= averageBody ? 1 : 0);

            if (
              !bestBearish ||
              score > bestBearish.strength
            ) {
              bestBearish = {
                type: "BEARISH OB",
                high: ob.high,
                low: ob.low,
                time: ob.time,
                strength: score
              };
            }
          }
        }
      }

      // ---------------------------------------------
      // Choose the most recent valid OB.
      // ---------------------------------------------

      let selected = null;

      if (
        bestBullish &&
        bestBearish
      ) {
        const bullishIndex =
          candles.findIndex(
            c => c.time === bestBullish.time
          );

        const bearishIndex =
          candles.findIndex(
            c => c.time === bestBearish.time
          );

        selected =
          bullishIndex > bearishIndex
            ? bestBullish
            : bestBearish;

      } else if (bestBullish) {
        selected = bestBullish;
      } else if (bestBearish) {
        selected = bestBearish;
      }

      if (!selected) {
        return {
          type: "NONE",
          high: null,
          low: null,
          time: null,
          status: "NONE",
          strength: 0
        };
      }

      // ---------------------------------------------
      // Current price relationship to OB
      // ---------------------------------------------

      if (
        current.close >= selected.low &&
        current.close <= selected.high
      ) {
        selected.status = "IN_ZONE";
      } else if (
        current.close > selected.high
      ) {
        selected.status = "ABOVE_ZONE";
      } else if (
        current.close < selected.low
      ) {
        selected.status = "BELOW_ZONE";
      } else {
        selected.status = "AWAY";
      }

      return selected;
    }

    // =================================================
    // MOMENTUM
    // =================================================

    function momentum(candles) {
      if (candles.length < 15) {
        return "NEUTRAL";
      }

      const recent =
        candles.slice(-5);

      const previousSet =
        candles.slice(-10, -5);

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

    // =================================================
    // ATR
    // =================================================

    function calculateATR(
      candles,
      period = 14
    ) {
      if (
        candles.length <
        period + 1
      ) {
        return 0;
      }

      const ranges = [];

      for (
        let i =
          candles.length - period;
        i < candles.length;
        i++
      ) {
        const current =
          candles[i];

        const previous =
          candles[i - 1];

        if (!previous) continue;

        const trueRange =
          Math.max(
            current.high -
              current.low,

            Math.abs(
              current.high -
                previous.close
            ),

            Math.abs(
              current.low -
                previous.close
            )
          );

        ranges.push(trueRange);
      }

      return average(ranges);
    }

    // =================================================
    // TRADE LEVELS
    //
    // If a valid directional OB exists, use the OB
    // as the primary entry zone.
    // Otherwise fall back to ATR levels.
    // =================================================

    function calculateLevels(
      candles,
      direction,
      ob = null
    ) {
      const current =
        last(candles);

      const price =
        current.close;

      const atr =
        calculateATR(
          candles,
          14
        );

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

      // =============================================
      // ORDER BLOCK ENTRY
      // =============================================

      const usableOB =
        ob &&
        ob.type ===
          (direction === "BUY"
            ? "BULLISH OB"
            : "BEARISH OB") &&
        Number.isFinite(ob.low) &&
        Number.isFinite(ob.high);

      if (usableOB) {
        entryLow = ob.low;
        entryHigh = ob.high;

        if (direction === "BUY") {
          sl =
            ob.low -
            safeATR * 0.20;

          const entry =
            (entryLow + entryHigh) / 2;

          const risk =
            entry - sl;

          tp1 =
            entry +
            risk * 1;

          tp2 =
            entry +
            risk * 2;

          tp3 =
            entry +
            risk * 3;
        } else {
          sl =
            ob.high +
            safeATR * 0.20;

          const entry =
            (entryLow + entryHigh) / 2;

          const risk =
            sl - entry;

          tp1 =
            entry -
            risk * 1;

          tp2 =
            entry -
            risk * 2;

          tp3 =
            entry -
            risk * 3;
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

      // =============================================
      // ATR FALLBACK
      // =============================================

      if (direction === "BUY") {
        entryLow =
          price -
          safeATR * 0.20;

        entryHigh =
          price +
          safeATR * 0.10;

        sl =
          price -
          safeATR * 1.20;

        const risk =
          price - sl;

        tp1 =
          price +
          risk * 1;

        tp2 =
          price +
          risk * 2;

        tp3 =
          price +
          risk * 3;
      }

      if (direction === "SELL") {
        entryLow =
          price -
          safeATR * 0.10;

        entryHigh =
          price +
          safeATR * 0.20;

        sl =
          price +
          safeATR * 1.20;

        const risk =
          sl - price;

        tp1 =
          price -
          risk * 1;

        tp2 =
          price -
          risk * 2;

        tp3 =
          price -
          risk * 3;
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

    // =================================================
    // ANALYZE TIMEFRAME
    // =================================================

    function analyzeTimeframe(candles) {
      const ob =
        detectOrderBlock(candles);

      return {
        structure:
          structure(candles),

        bos:
          bosChoch(candles),

        liquidity:
          liquiditySweep(candles),

        fvg:
          fairValueGap(candles),

        momentum:
          momentum(candles),

        orderBlock: ob
      };
    }

    // =================================================
    // SCORE TIMEFRAME
    // =================================================

    function scoreTimeframe(
      analysis
    ) {
      let bull = 0;
      let bear = 0;

      // Structure = 2
      if (
        analysis.structure ===
        "BULLISH"
      ) {
        bull += 2;
      }

      if (
        analysis.structure ===
        "BEARISH"
      ) {
        bear += 2;
      }

      // BOS / CHOCH = 2
      if (
        analysis.bos ===
          "BULLISH BOS" ||
        analysis.bos ===
          "BULLISH CHOCH"
      ) {
        bull += 2;
      }

      if (
        analysis.bos ===
          "BEARISH BOS" ||
        analysis.bos ===
          "BEARISH CHOCH"
      ) {
        bear += 2;
      }

      // Liquidity = 1
      if (
        analysis.liquidity ===
        "BULLISH SWEEP"
      ) {
        bull += 1;
      }

      if (
        analysis.liquidity ===
        "BEARISH SWEEP"
      ) {
        bear += 1;
      }

      // FVG = 1
      if (
        analysis.fvg ===
        "BULLISH FVG"
      ) {
        bull += 1;
      }

      if (
        analysis.fvg ===
        "BEARISH FVG"
      ) {
        bear += 1;
      }

      // Momentum = 1
      if (
        analysis.momentum ===
        "BULLISH"
      ) {
        bull += 1;
      }

      if (
        analysis.momentum ===
        "BEARISH"
      ) {
        bear += 1;
      }

      // =============================================
      // ORDER BLOCK = 2
      // =============================================

      if (
        analysis.orderBlock?.type ===
        "BULLISH OB"
      ) {
        bull += 2;
      }

      if (
        analysis.orderBlock?.type ===
        "BEARISH OB"
      ) {
        bear += 2;
      }

      // Extra point when price is actually
      // inside the relevant OB.
      if (
        analysis.orderBlock?.type ===
          "BULLISH OB" &&
        analysis.orderBlock?.status ===
          "IN_ZONE"
      ) {
        bull += 1;
      }

      if (
        analysis.orderBlock?.type ===
          "BEARISH OB" &&
        analysis.orderBlock?.status ===
          "IN_ZONE"
      ) {
        bear += 1;
      }

      return {
        bull,
        bear
      };
    }

    // =================================================
    // MTF SIGNAL ENGINE
    // =================================================

    function buildMTFSignal(
      h4,
      h1,
      m15,
      m5
    ) {
      const h4Score =
        scoreTimeframe(h4);

      const h1Score =
        scoreTimeframe(h1);

      const m15Score =
        scoreTimeframe(m15);

      const m5Score =
        scoreTimeframe(m5);

      const bullScore =
        h4Score.bull * 2 +
        h1Score.bull * 2 +
        m15Score.bull * 2 +
        m5Score.bull * 3;

      const bearScore =
        h4Score.bear * 2 +
        h1Score.bear * 2 +
        m15Score.bear * 2 +
        m5Score.bear * 3;

      /*
       * Maximum possible:
       *
       * Each timeframe can reach:
       * structure 2
       * BOS 2
       * liquidity 1
       * FVG 1
       * momentum 1
       * OB 2
       * OB in zone 1
       *
       * = 10
       *
       * Weighted:
       * H4  x2 = 20
       * H1  x2 = 20
       * M15 x2 = 20
       * M5  x3 = 30
       *
       * Absolute theoretical max = 90.
       *
       * We use 90 so confidence is scaled correctly.
       */

      const maxScore = 90;

      const higherBullish =
        h4.structure === "BULLISH" &&
        h1.structure === "BULLISH";

      const higherBearish =
        h4.structure === "BEARISH" &&
        h1.structure === "BEARISH";

      const m15Bullish =
        m15.structure === "BULLISH";

      const m15Bearish =
        m15.structure === "BEARISH";

      const m5Bullish =
        m5.structure === "BULLISH";

      const m5Bearish =
        m5.structure === "BEARISH";

      // =============================================
      // 5M SNIPER BUY CONDITIONS
      // =============================================

      const bullishBOS =
        m5.bos === "BULLISH BOS" ||
        m5.bos === "BULLISH CHOCH";

      const bearishBOS =
        m5.bos === "BEARISH BOS" ||
        m5.bos === "BEARISH CHOCH";

      const bullishConfirmation =
        m5.liquidity ===
          "BULLISH SWEEP" ||
        m5.fvg ===
          "BULLISH FVG" ||
        m5.momentum ===
          "BULLISH";

      const bearishConfirmation =
        m5.liquidity ===
          "BEARISH SWEEP" ||
        m5.fvg ===
          "BEARISH FVG" ||
        m5.momentum ===
          "BEARISH";

      const bullishOB =
        m5.orderBlock?.type ===
        "BULLISH OB";

      const bearishOB =
        m5.orderBlock?.type ===
        "BEARISH OB";

      /*
       * Sniper logic:
       *
       * BOS + confirmation + matching OB.
       *
       * The OB does not have to be currently touched
       * to create a signal. The dashboard will show
       * the OB zone so the user can wait for the
       * retracement.
       */

      const bullEntry =
        bullishBOS &&
        bullishConfirmation &&
        bullishOB;

      const bearEntry =
        bearishBOS &&
        bearishConfirmation &&
        bearishOB;

      let signal = "WAIT";

      // =============================================
      // BUY
      // =============================================

      if (
        higherBullish &&
        m15Bullish &&
        m5Bullish &&
        bullEntry &&
        bullScore >= 27 &&
        bullScore > bearScore + 5
      ) {
        signal = "BUY";
      }

      // =============================================
      // SELL
      // =============================================

      if (
        higherBearish &&
        m15Bearish &&
        m5Bearish &&
        bearEntry &&
        bearScore >= 27 &&
        bearScore > bullScore + 5
      ) {
        signal = "SELL";
      }

      // =============================================
      // CONFIDENCE
      // =============================================

      const winningScore =
        signal === "BUY"
          ? bullScore
          : signal === "SELL"
          ? bearScore
          : Math.max(
              bullScore,
              bearScore
            );

      let confidence;

      if (
        signal === "BUY" ||
        signal === "SELL"
      ) {
        confidence =
          Math.round(
            clamp(
              65 +
                (winningScore / maxScore) *
                  30,
              65,
              95
            )
          );
      } else {
        const gap =
          Math.abs(
            bullScore -
            bearScore
          );

        confidence =
          Math.round(
            Math.min(
              64,
              25 +
                (winningScore / maxScore) *
                  30 +
                Math.min(
                  gap * 2,
                  10
                )
            )
          );
      }

      return {
        signal,
        confidence,
        bullScore,
        bearScore,
        maxScore,

        sniper:
          signal === "BUY" ||
          signal === "SELL",

        bullEntry,
        bearEntry
      };
    }

    // =================================================
    // SINGLE TIMEFRAME REQUEST
    // =================================================

    if (mtf !== "true") {
      const candles =
        await getCandles(
          symbol,
          selectedInterval
        );

      const analysis =
        analyzeTimeframe(
          candles
        );

      const scores =
        scoreTimeframe(
          analysis
        );

      const current =
        last(candles);

      const total =
        scores.bull +
        scores.bear;

      let signal = "WAIT";

      if (
        scores.bull >= 7 &&
        scores.bull >
          scores.bear + 2
      ) {
        signal = "BUY";
      }

      if (
        scores.bear >= 7 &&
        scores.bear >
          scores.bull + 2
      ) {
        signal = "SELL";
      }

      const winningScore =
        Math.max(
          scores.bull,
          scores.bear
        );

      let confidence;

      if (
        signal === "BUY" ||
        signal === "SELL"
      ) {
        confidence =
          Math.round(
            Math.min(
              95,
              60 +
                winningScore * 4
            )
          );
      } else {
        confidence =
          Math.round(
            Math.min(
              59,
              25 +
                winningScore * 4
            )
          );
      }

      let levels = {
        entryLow: null,
        entryHigh: null,
        sl: null,
        tp1: null,
        tp2: null,
        tp3: null
      };

      if (
        signal === "BUY" ||
        signal === "SELL"
      ) {
        levels =
          calculateLevels(
            candles,
            signal,
            analysis.orderBlock
          );
      }

      return res.status(200).json({
        ok: true,

        pair: symbol,
        tf: selectedInterval,

        price:
          current.close,

        signal,
        confidence,

        bias:
          analysis.structure,

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

        // Order Block
        orderBlock:
          analysis.orderBlock,

        obType:
          analysis.orderBlock.type,

        obHigh:
          analysis.orderBlock.high,

        obLow:
          analysis.orderBlock.low,

        obTime:
          analysis.orderBlock.time,

        obStatus:
          analysis.orderBlock.status,

        obStrength:
          analysis.orderBlock.strength,

        bullScore:
          scores.bull,

        bearScore:
          scores.bear,

        scoreTotal:
          total,

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

        candles:
          candles.length
      });
    }

    // =================================================
    // FULL MTF ANALYSIS
    // =================================================

    const [
      h4Candles,
      h1Candles,
      m15Candles,
      m5Candles
    ] =
      await Promise.all([
        getCandles(
          symbol,
          "4h"
        ),

        getCandles(
          symbol,
          "1h"
        ),

        getCandles(
          symbol,
          "15min"
        ),

        getCandles(
          symbol,
          "5min"
        )
      ]);

    const h4 =
      analyzeTimeframe(
        h4Candles
      );

    const h1 =
      analyzeTimeframe(
        h1Candles
      );

    const m15 =
      analyzeTimeframe(
        m15Candles
      );

    const m5 =
      analyzeTimeframe(
        m5Candles
      );

    const finalSignal =
      buildMTFSignal(
        h4,
        h1,
        m15,
        m5
      );

    const current =
      last(m5Candles);

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
          finalSignal.signal,
          m5.orderBlock
        );
    }

    // =================================================
    // MTF RESPONSE
    // =================================================

    return res.status(200).json({
      ok: true,

      pair: symbol,

      tf: "MTF",

      price:
        current.close,

      signal:
        finalSignal.signal,

      confidence:
        finalSignal.confidence,

      sniper:
        finalSignal.sniper,

      bias:
        h4.structure,

      // ===============================================
      // 4H
      // ===============================================

      h4Bias:
        h4.structure,

      h4BOS:
        h4.bos,

      h4Liquidity:
        h4.liquidity,

      h4FVG:
        h4.fvg,

      h4Momentum:
        h4.momentum,

      h4OrderBlock:
        h4.orderBlock,

      h4OBType:
        h4.orderBlock.type,

      h4OBHigh:
        h4.orderBlock.high,

      h4OBLow:
        h4.orderBlock.low,

      h4OBStatus:
        h4.orderBlock.status,

      // ===============================================
      // 1H
      // ===============================================

      h1Structure:
        h1.structure,

      h1BOS:
        h1.bos,

      h1Liquidity:
        h1.liquidity,

      h1FVG:
        h1.fvg,

      h1Momentum:
        h1.momentum,

      h1OrderBlock:
        h1.orderBlock,

      h1OBType:
        h1.orderBlock.type,

      h1OBHigh:
        h1.orderBlock.high,

      h1OBLow:
        h1.orderBlock.low,

      h1OBStatus:
        h1.orderBlock.status,

      // ===============================================
      // 15M
      // ===============================================

      m15Structure:
        m15.structure,

      m15BOS:
        m15.bos,

      m15Liquidity:
        m15.liquidity,

      m15FVG:
        m15.fvg,

      m15Momentum:
        m15.momentum,

      m15OrderBlock:
        m15.orderBlock,

      m15OBType:
        m15.orderBlock.type,

      m15OBHigh:
        m15.orderBlock.high,

      m15OBLow:
        m15.orderBlock.low,

      m15OBStatus:
        m15.orderBlock.status,

      // ===============================================
      // 5M
      // ===============================================

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

      m5OrderBlock:
        m5.orderBlock,

      m5OBType:
        m5.orderBlock.type,

      m5OBHigh:
        m5.orderBlock.high,

      m5OBLow:
        m5.orderBlock.low,

      m5OBTime:
        m5.orderBlock.time,

      m5OBStatus:
        m5.orderBlock.status,

      m5OBStrength:
        m5.orderBlock.strength,

      // ===============================================
      // SCORES
      // ===============================================

      bullScore:
        finalSignal.bullScore,

      bearScore:
        finalSignal.bearScore,

      maxScore:
        finalSignal.maxScore,

      bullEntry:
        finalSignal.bullEntry,

      bearEntry:
        finalSignal.bearEntry,

      // ===============================================
      // TRADE LEVELS
      // ===============================================

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

      // ===============================================
      // MARKET TIMESTAMP
      // ===============================================

      time:
        current.time,

      candles: {
        h4:
          h4Candles.length,

        h1:
          h1Candles.length,

        m15:
          m15Candles.length,

        m5:
          m5Candles.length
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
      isLimitError
        ? 429
        : 500
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
