const symbols=["BTCUSDT","ETHUSDT","SOLUSDT"];
const names={BTCUSDT:"BTC/USDT",ETHUSDT:"ETH/USDT",SOLUSDT:"SOL/USDT"};
const state={};
const interval="15m";
const BUILD="V3.2";
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function fmtPrice(v){v=num(v);if(v>=1000)return "$"+v.toLocaleString(undefined,{maximumFractionDigits:2});if(v>=1)return "$"+v.toLocaleString(undefined,{maximumFractionDigits:3});return "$"+v.toLocaleString(undefined,{maximumFractionDigits:6})}
function clamp(v,a=0,b=100){v=num(v,50);return Math.max(a,Math.min(b,v))}
function avg(a){const clean=a.map(Number).filter(Number.isFinite);return clean.length?clean.reduce((x,y)=>x+y,0)/clean.length:0}
function ema(values,n){if(values.length<n)return null;let e=avg(values.slice(0,n)),k=2/(n+1);for(let i=n;i<values.length;i++)e=values[i]*k+e*(1-k);return e}
function rsi(values,n=14){if(values.length<=n)return 50;let gains=0,losses=0;for(let i=1;i<=n;i++){let d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d}let ag=gains/n,al=losses/n;for(let i=n+1;i<values.length;i++){let d=values[i]-values[i-1];ag=((ag*(n-1))+Math.max(d,0))/n;al=((al*(n-1))+Math.max(-d,0))/n}if(al===0)return 100;return 100-(100/(1+ag/al))}
function atr(c,n=14){if(c.length<=n)return 0;const tr=[];for(let i=1;i<c.length;i++){const h=c[i][2],l=c[i][3],pc=c[i-1][4];tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return avg(tr.slice(-n))}
function technical(candles,ticker){
  const raw=Array.isArray(candles)?candles:[];
  const c=raw.map(x=>({ts:num(x?.[0]),o:num(x?.[1]),h:num(x?.[2]),l:num(x?.[3]),c:num(x?.[4]),v:num(x?.[5])}))
    .filter(x=>x.c>0&&x.h>0&&x.l>0);
  const closes=c.map(x=>x.c), volumes=c.map(x=>x.v), last=closes.at(-1);
  if(closes.length<50||!Number.isFinite(last)||last<=0) return null;
  const e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes,14);
  let macdSeries=[];
  for(let i=26;i<=closes.length;i++){const s=closes.slice(0,i);const a=ema(s,12),b=ema(s,26);if(Number.isFinite(a)&&Number.isFinite(b))macdSeries.push(a-b)}
  const signal=ema(macdSeries,9),macd=macdSeries.at(-1),atrVal=atr(c,14);
  const ret5=closes.length>5?(last/closes.at(-6)-1)*100:0;
  const ret20=closes.length>20?(last/closes.at(-21)-1)*100:0;
  const volAvg=avg(volumes.slice(-21,-1)),volRatio=volAvg>0?num(volumes.at(-1))/volAvg:1;
  const trend=Number.isFinite(e20)&&Number.isFinite(e50)?(last>e20&&e20>e50?88:last<e20&&e20<e50?25:55):50;
  const rsiScore=r>=55&&r<=70?82:r>70?55:r>=45?60:r>=30?40:68;
  const macdScore=Number.isFinite(signal)&&Number.isFinite(macd)?(macd>signal&&macd>0?85:macd>signal?72:macd<signal&&macd<0?25:45):50;
  const momentum=clamp(50+num(ret5)*9+num(ret20)*3);
  const volume=clamp(50+(num(volRatio,1)-1)*35);
  const atrPct=last>0?(num(atrVal)/last*100):0;
  const risk=clamp(100-atrPct*45);
  const pct24=num(ticker?.price24hPcnt,0)*100;
  const technicalScore=Math.round(avg([trend,rsiScore,macdScore,momentum]));
  const marketScore=Math.round(avg([technicalScore,volume,50+pct24*2]));
  const finalScore=Math.round(avg([technicalScore,momentum,marketScore,risk]));
  let signalLabel=finalScore>=72?"BUY WATCH":finalScore>=58?"WATCH":"WAIT";
  if(r>78||r<22) signalLabel=finalScore>=75&&r<78?"BUY WATCH":"WAIT";
  return {rsi:num(r,50),ema20:e20,ema50:e50,macd:num(macd),signal:num(signal),atr:num(atrVal),ret5:num(ret5),ret20:num(ret20),volRatio:num(volRatio,1),technicalScore:clamp(Math.round(technicalScore)),marketScore:clamp(Math.round(marketScore)),risk:clamp(Math.round(risk)),finalScore:clamp(Math.round(finalScore)),signalLabel,last};
}
async function getTickers(){const r=await fetch("https://api.bitget.com/api/v3/market/tickers?category=SPOT",{cache:"no-store"});if(!r.ok)throw Error("Bitget HTTP "+r.status);const j=await r.json();if(j.code!=="00000")throw Error(j.msg||"Bitget API error");return j.data.filter(x=>symbols.includes(x.symbol))}
async function getCandles(symbol){const u=`https://api.bitget.com/api/v3/market/candles?category=SPOT&symbol=${symbol}&interval=${interval}&type=market&limit=200`;const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw Error("Candle HTTP "+r.status);const j=await r.json();if(j.code!=="00000")throw Error(j.msg||"Candle API error");return j.data.sort((a,b)=>Number(a[0])-Number(b[0]))}
function renderMarkets(data){document.getElementById("marketGrid").innerHTML=data.map(t=>{const p=Number(t.price24hPcnt)*100,cls=p>=0?"up":"down";return `<div class="market-card"><div class="symbol">${names[t.symbol]}</div><div class="price">${fmtPrice(t.lastPrice)}</div><div class="${cls}">${p>=0?"+":""}${p.toFixed(2)}%</div><small>24H • High ${fmtPrice(t.highPrice24h)} • Low ${fmtPrice(t.lowPrice24h)}</small></div>`}).join("")}
function renderBoard(data){const rows=data.map(t=>{const a=state[t.symbol]?.analysis||{};const p=Number(t.price24hPcnt)*100,cls=p>=0?"green":"down";const sig=a.signalLabel||"LOADING";const score=(a && Number.isFinite(Number(a.finalScore)))?Math.round(Number(a.finalScore)):"--";return `<div class="row"><b>${names[t.symbol]}</b><strong>${score}/100</strong><em class="${sig==="BUY WATCH"?"green":""}">${sig}</em><span class="${cls}">${p>=0?"+":""}${p.toFixed(2)}%</span><button class="mini" onclick="review('${t.symbol}')">Review</button></div>`}).join("");document.getElementById("opportunityBoard").innerHTML='<div class="row head"><span>Asset</span><span>AI Score</span><span>Signal</span><span>24H</span><span>Action</span></div>'+rows;document.getElementById("signals").textContent=data.filter(t=>(state[t.symbol]?.analysis?.finalScore||0)>=70).length}
function review(symbol){const t=state[symbol]?.ticker,a=state[symbol]?.analysis;if(!a)return alert("Analysis is still loading.");alert(`${names[symbol]}\n\nAI score: ${a.finalScore}/100\nSignal: ${a.signalLabel}\nTechnical: ${a.technicalScore}/100\nMomentum: ${Math.round(a.ret5>=0?Math.min(99,50+a.ret5*9):Math.max(1,50+a.ret5*9))}/100\nRisk: ${Math.round(a.risk)}/100\nRSI: ${a.rsi.toFixed(1)}\nEMA20: ${fmtPrice(a.ema20)}\nEMA50: ${fmtPrice(a.ema50)}\nMACD: ${a.macd.toFixed(4)}\nVolume ratio: ${a.volRatio.toFixed(2)}x\n\nPaper signal only. No order is created.`)}
async function refreshAll(){const status=document.getElementById("dataStatus");try{const tickers=await getTickers();for(const t of tickers){state[t.symbol]={ticker:t};try{const candles=await getCandles(t.symbol);const analysis=technical(candles,t);state[t.symbol].analysis=analysis;if(!analysis) console.warn("Insufficient/invalid candle data for",t.symbol)}catch(e){console.error("Analysis error",t.symbol,e);state[t.symbol].analysis=null}}renderMarkets(tickers);renderBoard(tickers);status.textContent="LIVE • BITGET • "+BUILD;document.querySelector(".top-status").classList.remove("offline");document.getElementById("lastUpdate").textContent=new Date().toLocaleTimeString()}catch(e){status.textContent="OFFLINE";document.querySelector(".top-status").classList.add("offline");console.error(e)}}
function runScan(){const ready=symbols.map(s=>state[s]?.analysis).filter(Boolean);if(!ready.length)return alert("AI analysis is still loading.");const best=ready.slice().sort((a,b)=>b.finalScore-a.finalScore)[0];const bestSym=symbols.find(s=>state[s]?.analysis===best);alert(`Multi-agent market scan complete.\n\nTop paper candidate: ${names[bestSym]}\nAI score: ${best.finalScore}/100\nSignal: ${best.signalLabel}\nTechnical: ${best.technicalScore}/100\nRisk: ${Math.round(best.risk)}/100\n\nThis is a rules-based V3 analysis engine using live Bitget candles. News, fundamental context, backtesting and secure paper execution are next stages. No real order is placed.`)}
function stopAI(){alert("AI trading is locked. This site cannot place real orders.")}
refreshAll();setInterval(refreshAll,30000);

/* V4 Backtest Lab */
const btCache={};
async function getHistorical(symbol,tf){
  const key=symbol+tf;
  if(btCache[key]) return btCache[key];
  const u=`https://api.bitget.com/api/v3/market/candles?category=SPOT&symbol=${symbol}&interval=${tf}&type=market&limit=200`;
  const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw Error('Historical HTTP '+r.status);
  const j=await r.json(); if(j.code!=='00000') throw Error(j.msg||'Historical API error');
  const rows=j.data.sort((a,b)=>Number(a[0])-Number(b[0])).map(x=>({ts:num(x[0]),o:num(x[1]),h:num(x[2]),l:num(x[3]),c:num(x[4]),v:num(x[5])})).filter(x=>x.c>0&&x.h>0&&x.l>0);
  btCache[key]=rows; return rows;
}
function scoreAt(candles){
  if(candles.length<55)return null;
  const closes=candles.map(x=>x.c), volumes=candles.map(x=>x.v), last=closes.at(-1);
  const e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes,14); let ms=[];
  for(let i=26;i<=closes.length;i++){const s=closes.slice(0,i),a=ema(s,12),b=ema(s,26);if(Number.isFinite(a)&&Number.isFinite(b))ms.push(a-b)}
  const sig=ema(ms,9),macd=ms.at(-1),atrVal=atr(candles,14);
  const ret5=closes.length>5?(last/closes.at(-6)-1)*100:0, ret20=closes.length>20?(last/closes.at(-21)-1)*100:0;
  const va=avg(volumes.slice(-21,-1)),vr=va>0?last*0+num(volumes.at(-1))/va:1;
  const trend=last>e20&&e20>e50?88:last<e20&&e20<e50?25:55;
  const rs=r>=55&&r<=70?82:r>70?55:r>=45?60:r>=30?40:68;
  const mscr=Number.isFinite(sig)&&Number.isFinite(macd)?(macd>sig&&macd>0?85:macd>sig?72:macd<sig&&macd<0?25:45):50;
  const mom=clamp(50+ret5*9+ret20*3), volume=clamp(50+(vr-1)*35), risk=clamp(100-(num(atrVal)/last*100)*45);
  const tech=Math.round(avg([trend,rs,mscr,mom])), market=Math.round(avg([tech,volume,50])), final=Math.round(avg([tech,mom,market,risk]));
  return {score:clamp(final),rsi:r};
}
function fmtDate(ts){return new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function money(v){return '₹'+Math.round(v).toLocaleString('en-IN')}
function drawBacktest(points){const canvas=document.getElementById('btChart'),ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth||600,h=220;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);if(points.length<2)return;const vals=points.map(x=>x.equity),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;ctx.strokeStyle='#d6ad4d';ctx.lineWidth=2;ctx.beginPath();points.forEach((p,i)=>{const x=i*(w-8)/(points.length-1)+4,y=h-12-((p.equity-min)/range)*(h-28);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.fillStyle='#858991';ctx.font='11px sans-serif';ctx.fillText('Equity curve',8,15);ctx.fillText(money(max),8,32);ctx.fillText(money(min),8,h-4)}
async function runBacktest(){
  const symbol=document.getElementById('btSymbol').value,tf=document.getElementById('btInterval').value,capital=Math.max(1000,num(document.getElementById('btCapital').value,1000000)),fee=num(document.getElementById('btFee').value,.1)/100,slip=num(document.getElementById('btSlip').value,.05)/100;
  const status=document.getElementById('btStatus');status.textContent='Loading historical candles…';
  try{
    const c=await getHistorical(symbol,tf); if(c.length<80)throw Error('Not enough historical candles returned for a meaningful test.');
    let cash=capital,position=null,trades=[],curve=[{ts:c[0].ts,equity:cash}];
    for(let i=55;i<c.length;i++){
      const window=c.slice(0,i+1), bar=c[i], prev=c[i-1], a=scoreAt(window); if(!a)continue;
      if(!position && a.score>=72){const entry=bar.c*(1+slip), riskPct=.01, riskCash=cash*riskPct, stop=entry*(1-.015), qty=riskCash/(entry-stop), maxQty=(cash*.05)/entry;qty=Math.min(qty,maxQty);const cost=qty*entry*(1+fee);if(cost<=cash){cash-=cost;position={entry,qty,entryTs:bar.ts,stop,target:entry*(1+.03)}}}
      if(position){let exit=null,reason='Signal';if(bar.l<=position.stop){exit=position.stop*(1-slip);reason='Stop'}else if(bar.h>=position.target){exit=position.target*(1-slip);reason='Target'}else if(a.score<55){exit=bar.c*(1-slip);reason='Signal'}if(exit!==null){const gross=(exit-position.entry)*position.qty, fees=(exit*position.qty*fee), pnl=gross-fees;cash+=exit*position.qty-fees;trades.push({entryTs:position.entryTs,exitTs:bar.ts,side:'LONG',pnl,ret:pnl/(position.entry*position.qty)*100,reason});position=null}}
      const equity=cash+(position?position.qty*bar.c:0);curve.push({ts:bar.ts,equity});
    }
    if(position){const bar=c.at(-1),exit=bar.c*(1-slip),gross=(exit-position.entry)*position.qty,fees=exit*position.qty*fee,pnl=gross-fees;cash+=exit*position.qty-fees;trades.push({entryTs:position.entryTs,exitTs:bar.ts,side:'LONG',pnl,ret:pnl/(position.entry*position.qty)*100,reason:'End'});position=null;curve.push({ts:bar.ts,equity:cash})}
    const final= cash, totalRet=(final/capital-1)*100, wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<=0),winRate=trades.length?wins.length/trades.length*100:0, grossWin=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.pnl,0)),pf=grossLoss?grossWin/grossLoss:(grossWin?Infinity:0);let peak=capital,maxDD=0;for(const p of curve){peak=Math.max(peak,p.equity);maxDD=Math.max(maxDD,(peak-p.equity)/peak*100)}
    document.getElementById('btMetrics').innerHTML=`<div class="bt-metric"><small>Final equity</small><b>${money(final)}</b></div><div class="bt-metric"><small>Total return</small><b class="${totalRet>=0?'positive':'negative'}">${totalRet>=0?'+':''}${totalRet.toFixed(2)}%</b></div><div class="bt-metric"><small>Win rate</small><b>${winRate.toFixed(1)}%</b></div><div class="bt-metric"><small>Max drawdown</small><b class="negative">${maxDD.toFixed(2)}%</b></div><div class="bt-metric"><small>Profit factor</small><b>${Number.isFinite(pf)?pf.toFixed(2):'∞'}</b></div><div class="bt-metric"><small>Trades</small><b>${trades.length}</b></div>`;
    document.getElementById('btTrades').innerHTML='<div class="row head"><span>Entry</span><span>Exit</span><span>Side</span><span>P&amp;L</span><span>Return</span></div>'+trades.slice(-30).reverse().map(t=>`<div class="row"><span>${fmtDate(t.entryTs)}</span><span>${fmtDate(t.exitTs)}</span><span>${t.side}</span><b class="${t.pnl>=0?'positive':'negative'}">${t.pnl>=0?'+':''}${money(t.pnl)}</b><span class="${t.ret>=0?'positive':'negative'}">${t.ret>=0?'+':''}${t.ret.toFixed(2)}%</span></div>`).join('');
    drawBacktest(curve);status.textContent=`${names[symbol]} • ${tf} • ${c.length} candles`;
  }catch(e){status.textContent='Backtest error';document.getElementById('btMetrics').textContent=e.message;console.error(e)}
}
