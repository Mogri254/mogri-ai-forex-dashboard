const markets = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "XAU/USD",
  "USD/CAD",
  "AUD/USD"
];

const tfMap = {
  "5M": "5min",
  "15M": "15min",
  "1H": "1h",
  "4H": "4h"
};

// =====================================================
// MOGRI AI - MARKET DATA CACHE
// Keeps results for 60 seconds so we don't waste API calls
// =====================================================

const CACHE_TIME = 60 * 1000;

const marketCache = new Map();

let scanRunning = false;
let lastScanTime = 0;


// =====================================================
// HELPERS
// =====================================================

function fmt(x, pair) {

  if (x === undefined || x === null || !Number.isFinite(Number(x))) {
    return "—";
  }

  return pair === "XAU/USD"
    ? Number(x).toFixed(2)
    : Number(x).toFixed(5);
}


function setStatus(message) {

  const e = document.querySelector(".demo");

  if (e) {
    e.textContent = message;
  }
}


// =====================================================
// API CACHE
// =====================================================

function cacheKey(pair, tf) {
  return `${pair}_${tf}`;
}


function getCached(pair, tf) {

  const key = cacheKey(pair, tf);
  const item = marketCache.get(key);

  if (!item) {
    return null;
  }

  const age = Date.now() - item.time;

  if (age > CACHE_TIME) {

    marketCache.delete(key);

    return null;
  }

  return item.data;
}


function saveCache(pair, tf, data) {

  marketCache.set(
    cacheKey(pair, tf),
    {
      time: Date.now(),
      data
    }
  );
}


// =====================================================
// MARKET DATA
// =====================================================

async function analyze(pair, tf) {

  const interval = tfMap[tf] || "15min";

  // First check cache
  const cached = getCached(pair, tf);

  if (cached) {

    console.log(
      "CACHE:",
      pair,
      tf
    );

    return cached;
  }


  // Prevent duplicate requests
  const key = cacheKey(pair, tf);

  if (marketCache.has(`${key}_loading`)) {

    return await marketCache.get(
      `${key}_loading`
    );
  }


  const request = fetch(
    `/api/market?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}`
  )
    .then(async response => {

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Invalid response from server."
        );
      }


      if (!response.ok || data.error) {

        throw new Error(
          data.error ||
          "Failed to load market data."
        );
      }


      saveCache(
        pair,
        tf,
        data
      );

      return data;

    })
    .finally(() => {

      marketCache.delete(
        `${key}_loading`
      );

    });


  marketCache.set(
    `${key}_loading`,
    request
  );

  return await request;
}


// =====================================================
// SCANNER CARD
// =====================================================

function card(x) {

  const signal =
    x.signal || "WAIT";

  const c =
    signal === "BUY"
      ? "buy"
      : signal === "SELL"
      ? "sell"
      : "wait";


  return `

    <div class="card">

      <div class="pairrow">

        <b>${x.pair}</b>

        <span class="pill ${c}">
          ${signal}
        </span>

      </div>


      <h3>

        ${x.confidence || 0}%

        <span
          style="
            font-size:11px;
            color:#748092;
          "
        >
          confidence
        </span>

      </h3>


      <div class="bar">

        <i
          style="
            width:${x.confidence || 0}%
          "
        ></i>

      </div>


      <div class="mini">

        <span>
          ${x.tf || "15min"}
        </span>

        <span>

          FVG
          ${x.fvg ? "✓" : "—"}

          •

          LIQ
          ${x.liquidity ? "✓" : "—"}

        </span>

      </div>

    </div>

  `;
}


// =====================================================
// SHOW SELECTED SIGNAL
// =====================================================

function show(x) {

  const signal =
    x.signal || "WAIT";

  const c =
    signal === "BUY"
      ? "buy"
      : signal === "SELL"
      ? "sell"
      : "wait";


  const signalBox =
    document.querySelector("#signal");


  if (!signalBox) {
    return;
  }


  signalBox.className = "signal";


  signalBox.innerHTML = `

    <div class="signal-top">

      <span class="pill ${c}">
        ${signal}
      </span>

      <span>
        ${x.pair}
        •
        ${x.tf}
        •
        ${x.time || ""}
      </span>

    </div>


    <h2>

      ${
        signal === "WAIT"
          ? "NO TRADE — WAIT"
          : signal + " setup detected"
      }

    </h2>


    <div class="levels">


      <div class="level">

        <small>
          PRICE
        </small>

        <b>
          ${fmt(x.price, x.pair)}
        </b>

      </div>


      <div class="level">

        <small>
          ENTRY ZONE
        </small>

        <b>

          ${
            signal === "WAIT"
              ? "—"
              :
                fmt(
                  x.entryLow,
                  x.pair
                )
                +
                " – "
                +
                fmt(
                  x.entryHigh,
                  x.pair
                )
          }

        </b>

      </div>


      <div class="level">

        <small>
          STOP LOSS
        </small>

        <b>

          ${
            signal === "WAIT"
              ? "—"
              : fmt(
                  x.sl,
                  x.pair
                )
          }

        </b>

      </div>


      <div class="level">

        <small>
          TP1 / TP2 / TP3
        </small>

        <b>

          ${
            signal === "WAIT"
              ? "—"
              :
                fmt(x.tp1, x.pair)
                +
                " / "
                +
                fmt(x.tp2, x.pair)
                +
                " / "
                +
                fmt(x.tp3, x.pair)
          }

        </b>

      </div>

    </div>


    <div class="reasons">


      <span class="reason">

        ${x.fvg ? "✓" : "✕"}

        Fair Value Gap

      </span>


      <span class="reason">

        ${x.liquidity ? "✓" : "✕"}

        Liquidity sweep

      </span>


      <span class="reason">

        ${x.structure ? "✓" : "✕"}

        Market structure

      </span>


      <span class="reason">

        ${x.breakRetest ? "✓" : "✕"}

        Breakout / retest

      </span>


      <span class="reason">

        ${
          x.bias === "BULLISH"
            ? "✓ Bullish bias"
            :
          x.bias === "BEARISH"
            ? "✓ Bearish bias"
            :
            "• Neutral bias"
        }

      </span>


    </div>

  `;
}


// =====================================================
// HISTORY
// =====================================================

function history(x) {

  if (!x || x.signal === "WAIT") {
    return;
  }


  const e =
    document.querySelector("#history");


  if (!e) {
    return;
  }


  e.innerHTML = `

    <div class="row">

      <b>
        ${x.pair}
      </b>

      <span>
        ${x.signal}
      </span>

      <span>
        ${x.confidence}%
      </span>

      <span>
        ${x.time || ""}
      </span>

    </div>

  ` + e.innerHTML;
}


// =====================================================
// RENDER SCANNER
// =====================================================

function renderScanner(results) {

  const box =
    document.querySelector("#markets");


  if (!box) {
    return;
  }


  if (!results.length) {

    box.innerHTML = `

      <div class="card">

        <b>
          Market data unavailable
        </b>

        <p class="muted">

          No market data was returned.

        </p>

      </div>

    `;

    return;
  }


  box.innerHTML =
    results
      .map(card)
      .join("");


  const strong =
    results.filter(
      x =>
        x.signal === "BUY" ||
        x.signal === "SELL"
    );


  const setupBox =
    document.querySelector("#setups");


  if (setupBox) {
    setupBox.textContent =
      strong.length;
  }


  const confidenceBox =
    document.querySelector("#confidence");


  if (confidenceBox) {

    confidenceBox.textContent =
      Math.round(
        results.reduce(
          (sum, x) =>
            sum +
            Number(
              x.confidence || 0
            ),
          0
        ) /
        results.length
      ) + "%";
  }
}


// =====================================================
// SCAN MARKETS
// =====================================================

async function scan() {

  if (scanRunning) {
    return;
  }


  scanRunning = true;


  setStatus(
    "● SCANNING LIVE DATA • PAPER MODE"
  );


  const button =
    document.querySelector("#scan");


  if (button) {
    button.disabled = true;
    button.textContent =
      "Scanning…";
  }


  const results = [];


  try {

    /*
      IMPORTANT:

      We scan only once.

      Each market costs approximately
      1 Twelve Data API credit.

      Free plan = 8 credits/minute.

      6 markets = 6 credits.
    */


    for (const pair of markets) {

      try {

        const data =
          await analyze(
            pair,
            "15M"
          );


        results.push(data);


      } catch (error) {

        console.error(
          pair,
          error
        );

      }
    }


    renderScanner(results);


    lastScanTime =
      Date.now();


    setStatus(
      "● LIVE DATA • PAPER MODE"
    );


  } catch (error) {

    console.error(error);


    setStatus(
      "● DATA ERROR"
    );


  } finally {

    scanRunning = false;


    if (button) {

      button.disabled = false;

      button.textContent =
        "↻ Scan Markets";

    }

  }
}


// =====================================================
// ANALYZE SELECTED
// =====================================================

async function analyzeSelected() {

  const button =
    document.querySelector("#analyze");


  const pair =
    document.querySelector("#pair").value;


  const tf =
    document.querySelector("#tf").value;


  if (button) {

    button.disabled = true;

    button.textContent =
      "Checking…";

  }


  try {

    /*
      If the selected pair was already
      scanned within 60 seconds,
      this uses CACHE.

      It does NOT call Twelve Data again.
    */


    const data =
      await analyze(
        pair,
        tf
      );


    show(data);

    history(data);


    setStatus(
      "● LIVE DATA • PAPER MODE"
    );


  } catch (error) {

    console.error(error);


    const box =
      document.querySelector("#signal");


    if (box) {

      box.innerHTML = `

        <div class="signal-top">

          <span class="pill wait">
            DATA LIMIT
          </span>

        </div>


        <h2>
          Market data unavailable
        </h2>


        <p class="muted">

          ${error.message}

        </p>


        <p class="muted">

          Please wait for the API
          credit limit to reset,
          then try again.

        </p>

      `;

    }


    setStatus(
      "● WAITING FOR API LIMIT"
    );


  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "Analyze Selected";

    }

  }
}


// =====================================================
// BUTTONS
// =====================================================

const scanButton =
  document.querySelector("#scan");


if (scanButton) {

  scanButton.onclick =
    scan;

}


const analyzeButton =
  document.querySelector("#analyze");


if (analyzeButton) {

  analyzeButton.onclick =
    analyzeSelected;

}


// =====================================================
// INITIAL LOAD
// =====================================================

setStatus(
  "● LIVE DATA • PAPER MODE"
);


// Don't automatically scan on page load.
// User chooses when to scan.
//
// This saves API credits.

console.log(
  "MOGRI AI initialized."
);

console.log(
  "API calls are cached for 60 seconds."
