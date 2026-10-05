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

function fmt(x, p) {
  return p === "XAU/USD"
    ? Number(x).toFixed(2)
    : Number(x).toFixed(5);
}

function status(t) {
  const e = document.querySelector(".demo");

  if (e) {
    e.textContent = t;
  }
}

function card(x) {

  let c =
    x.signal === "BUY"
      ? "buy"
      : x.signal === "SELL"
      ? "sell"
      : "wait";

  return `
    <div class="card">

      <div class="pairrow">
        <b>${x.pair}</b>

        <span class="pill ${c}">
          ${x.signal}
        </span>
      </div>

      <h3>
        ${x.confidence}%
        <span style="font-size:11px;color:#748092">
          confidence
        </span>
      </h3>

      <div class="bar">
        <i style="width:${x.confidence}%"></i>
      </div>

      <div class="mini">
        <span>${x.tf}</span>

        <span>
          FVG ${x.fvg ? "✓" : "—"}
          •
          LIQ ${x.liquidity ? "✓" : "—"}
        </span>
      </div>

    </div>
  `;
}

function show(x) {

  let c =
    x.signal === "BUY"
      ? "buy"
      : x.signal === "SELL"
      ? "sell"
      : "wait";

  document.querySelector("#signal").className =
    "signal";

  document.querySelector("#signal").innerHTML = `

    <div class="signal-top">

      <span class="pill ${c}">
        ${x.signal}
      </span>

      <span>
        ${x.pair} • ${x.tf} • ${x.time}
      </span>

    </div>

    <h2>
      ${
        x.signal === "WAIT"
          ? "NO TRADE — WAIT"
          : x.signal + " setup detected"
      }
    </h2>

    <div class="levels">

      <div class="level">
        <small>PRICE</small>
        <b>${fmt(x.price, x.pair)}</b>
      </div>

      <div class="level">
        <small>ENTRY ZONE</small>

        <b>
          ${
            x.signal === "WAIT"
              ? "—"
              : fmt(x.entryLow, x.pair) +
                " – " +
                fmt(x.entryHigh, x.pair)
          }
        </b>

      </div>

      <div class="level">
        <small>STOP LOSS</small>

        <b>
          ${
            x.signal === "WAIT"
              ? "—"
              : fmt(x.sl, x.pair)
          }
        </b>

      </div>

      <div class="level">

        <small>
          TP1 / TP2 / TP3
        </small>

        <b>
          ${
            x.signal === "WAIT"
              ? "—"
              : fmt(x.tp1, x.pair) +
                " / " +
                fmt(x.tp2, x.pair) +
                " / " +
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
            : x.bias === "BEARISH"
            ? "✓ Bearish bias"
            : "• Neutral bias"
        }
      </span>

    </div>
  `;
}

function history(x) {

  if (x.signal === "WAIT") {
    return;
  }

  const e = document.querySelector("#history");

  e.innerHTML = `
    <div class="row">

      <b>${x.pair}</b>

      <span>${x.signal}</span>

      <span>${x.confidence}%</span>

      <span>${x.time}</span>

    </div>
  ` + e.innerHTML;
}

async function analyze(pair, tf) {

  const r = await fetch(
    `/api/market?symbol=${encodeURIComponent(pair)}&interval=${encodeURIComponent(
      tfMap[tf] || "15min"
    )}`
  );

  const d = await r.json();

  if (!r.ok || d.error) {
    throw Error(
      d.error || "Failed to load market data"
    );
  }

  return d;
}

async function scan() {

  status("● LIVE DATA • PAPER MODE");

  let xs = [];

  for (const p of markets) {

    try {

      xs.push(
        await analyze(p, "15M")
      );

    } catch (e) {

      console.error(p, e);

    }
  }

  document.querySelector("#markets").innerHTML =
    xs.length
      ? xs.map(card).join("")
      : `
        <div class="card">

          <b>
            Market data unavailable
          </b>

          <p class="muted">
            Check the Twelve Data key
            and redeploy.
          </p>

        </div>
      `;

  document.querySelector("#setups").textContent =
    xs.filter(
      x => x.signal !== "WAIT"
    ).length;

  document.querySelector("#confidence").textContent =
    xs.length
      ? Math.round(
          xs.reduce(
            (a, x) => a + x.confidence,
            0
          ) / xs.length
        ) + "%"
      : "—";
}

document.querySelector("#scan").onclick =
  async () => {

    let b =
      document.querySelector("#scan");

    b.disabled = true;
    b.textContent = "Scanning…";

    try {

      await scan();

    } catch (e) {

      alert(e.message);

    }

    b.disabled = false;
    b.textContent = "↻ Scan Markets";
  };

document.querySelector("#analyze").onclick =
  async () => {

    let b =
      document.querySelector("#analyze");

    b.disabled = true;
    b.textContent = "Analyzing…";

    try {

      let x = await analyze(
        document.querySelector("#pair").value,
        document.querySelector("#tf").value
      );

      show(x);
      history(x);

    } catch (e) {

      document.querySelector("#signal").innerHTML = `

        <div class="signal-top">

          <span class="pill wait">
            ERROR
          </span>

        </div>

        <h2>
          Failed to load data
        </h2>

        <p class="muted">
          ${e.message}
        </p>

      `;

    }

    b.disabled = false;
    b.textContent = "Analyze Selected";
  };

scan();
