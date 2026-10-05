const markets=["EUR/USD","GBP/USD","USD/JPY","XAU/USD","USD/CAD","AUD/USD"];
const state={};
const rand=(a,b)=>Math.round((a+Math.random()*(b-a))*100)/100;
function engine(pair,tf){
  // Demo scoring engine. Replace this data layer with a real price-feed later.
  const bullish=Math.random()>.48, fvg=Math.random()>.25, liq=Math.random()>.30, structure=Math.random()>.25;
  let score=45+(fvg?15:0)+(liq?15:0)+(structure?15:0)+(bullish?5:0);
  const strong=score>=80;
  const base={ "EUR/USD":1.1725,"GBP/USD":1.3460,"USD/JPY":148.2,"XAU/USD":3875,"USD/CAD":1.3820,"AUD/USD":0.6580}[pair];
  const p=base*(1+((Math.random()-.5)*.002));
  const entry=pair==="XAU/USD"?p.toFixed(2):p.toFixed(5);
  const risk=pair==="XAU/USD"?8:p*.0009;
  const sl=bullish?p-risk:p+risk;
  const tp1=bullish?p+risk*1.8:p-risk*1.8, tp2=bullish?p+risk*2.8:p-risk*2.8;
  return {pair,tf,bullish,score,strong,fvg,liq,structure,entry,sl,tp1,tp2,time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})};
}
function fmt(x,pair){return pair==="XAU/USD"?Number(x).toFixed(2):Number(x).toFixed(5)}
function renderCard(x){
 return `<div class="card"><div class="pairrow"><b>${x.pair}</b><span class="pill ${x.strong?(x.bullish?"buy":"sell"):"wait"}">${x.strong?(x.bullish?"BUY":"SELL"):"WAIT"}</span></div>
 <h3>${x.score}% <span style="font-size:11px;color:#748092">confidence</span></h3><div class="bar"><i style="width:${x.score}%"></i></div>
 <div class="mini"><span>${x.tf}</span><span>FVG ${x.fvg?"✓":"—"} • LIQ ${x.liq?"✓":"—"}</span></div></div>`;
}
function scan(){
 const xs=markets.map(p=>engine(p,"15M")); markets.forEach((p,i)=>state[p]=xs[i]);
 document.querySelector("#markets").innerHTML=xs.map(renderCard).join("");
 const strong=xs.filter(x=>x.strong); document.querySelector("#setups").textContent=strong.length;
 document.querySelector("#confidence").textContent=Math.round(xs.reduce((a,x)=>a+x.score,0)/xs.length)+"%";
}
function show(x){
 const cls=x.strong?(x.bullish?"buy":"sell"):"wait", side=x.strong?(x.bullish?"BUY":"SELL"):"WAIT";
 document.querySelector("#signal").className="signal";
 document.querySelector("#signal").innerHTML=`<div class="signal-top"><span class="pill ${cls}">${side}</span><span>${x.pair} • ${x.tf} • ${x.time}</span></div>
 <h2>${x.strong?side+" setup detected":"NO TRADE — WAIT"}</h2>
 <div class="levels">${x.strong?`<div class="level"><small>ENTRY ZONE</small><b>${x.entry}</b></div><div class="level"><small>STOP LOSS</small><b>${fmt(x.sl,x.pair)}</b></div><div class="level"><small>TP1</small><b>${fmt(x.tp1,x.pair)}</b></div><div class="level"><small>TP2</small><b>${fmt(x.tp2,x.pair)}</b></div>`:`<div class="level"><small>CONFIDENCE</small><b>${x.score}%</b></div><div class="level"><small>REASON</small><b>Confluence too weak</b></div>`}</div>
 <div class="reasons"><span class="reason">${x.fvg?"✓":"✕"} Fair Value Gap</span><span class="reason">${x.liq?"✓":"✕"} Liquidity sweep</span><span class="reason">${x.structure?"✓":"✕"} Market structure</span><span class="reason">${x.bullish?"✓ Bullish bias":"✓ Bearish bias"}</span></div>`;
}
function history(x){
 const el=document.querySelector("#history"); el.innerHTML=`<div class="row"><b>${x.pair}</b><span>${x.bullish?"BUY":"SELL"}</span><span>${x.score}%</span><span>${x.time}</span></div>`+el.innerHTML;
}
document.querySelector("#scan").onclick=scan;
document.querySelector("#analyze").onclick=()=>{const x=engine(document.querySelector("#pair").value,document.querySelector("#tf").value);show(x);if(x.strong)history(x)};
scan();
