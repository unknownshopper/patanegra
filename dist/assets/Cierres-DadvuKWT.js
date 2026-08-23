import{c as E,R as o,q as I,d as D,e as L,f as A,m as Y,g as F,j as e}from"./main-D94uhRGu.js";function i(t){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(t)||0)}function H({title:t,body:l}){return`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 18px; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 6px 0; }
    .muted { color: #6b7280; font-size: 12px; }
    .grid { display: grid; gap: 12px; margin-top: 14px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
    .cardTitle { font-weight: 900; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; font-weight: 800; }
    .val { font-weight: 900; }
    .sub { padding-left: 14px; opacity: 0.9; }
    .big { font-size: 22px; font-weight: 950; }
    .twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pill { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; }
  </style>
</head>
<body>
${l}
</body>
</html>`}function c({label:t,value:l}){return e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:"1px solid #e5e7eb"},children:[e.jsx("div",{className:"muted",style:{fontWeight:800},children:t}),e.jsx("div",{style:{fontWeight:950},children:l})]})}function C({label:t,value:l}){return e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,padding:"6px 0 10px 14px",borderBottom:"1px solid #e5e7eb"},children:[e.jsx("div",{className:"muted",style:{fontWeight:900,fontSize:12},children:t}),e.jsx("div",{style:{fontWeight:900,fontSize:14},children:l})]})}function M({title:t,children:l}){return e.jsxs("div",{style:{border:"1px solid #e5e7eb",borderRadius:12,padding:12,background:"#fff"},children:[e.jsx("div",{style:{fontWeight:950,marginBottom:8},children:t}),e.jsx("div",{children:l})]})}function U(){const[t,l]=E(),[z,W]=o.useState(!0),[$,P]=o.useState(null),[v,R]=o.useState([]),[B,k]=o.useState(null),u=String(t.get("q")??"").trim();o.useEffect(()=>{document.title="Patanegra · Cierres"},[]),o.useEffect(()=>{let s=!0;return W(!0),P(null),(async()=>{try{const a=I(D(L,"opsClosings"),A("dayKey","desc"),Y(300)),d=await F(a);if(!s)return;R(d.docs.map(n=>({id:n.id,...n.data()})))}catch{if(!s)return;R([]),P("No se pudo cargar la lista de cierres.")}finally{if(!s)return;W(!1)}})(),()=>{s=!1}},[]);const K=o.useMemo(()=>{if(!u)return v;const s=u.toLowerCase();return v.filter(a=>{const d=String(a.dayKey??a.id??"").toLowerCase(),n=String(a.createdByName??"").toLowerCase();return d.includes(s)||n.includes(s)})},[u,v]),q=o.useCallback(s=>{const a=String(s.dayKey??s.id),d=s.createdByName?String(s.createdByName):"—",n=Number(s.summary?.sum??0),p=Number(s.summary?.salesCount??0),m=Number(s.summary?.byMethod?.efectivo??0),y=Number(s.summary?.byMethod?.propinaEfectivo??0),b=Number(s.summary?.byMethod?.terminal??0),g=Number(s.summary?.byMethod?.propinaTerminal??0),f=Number(s.summary?.byMethod?.transferencia??0),h=Number(s.summary?.byMethod?.propinaTransferencia??0),x=Number(s.summary?.byMethod?.cortesia??0),j=Number(s.summary?.byMethod?.legacy??0),N=Number(s.summary?.discountTotal??0),S=Number(s.summary?.dough?.cm30??0),w=Number(s.summary?.dough?.cm20??0),T=`
<h1>Cierre de caja · ${a}</h1>
<div class="muted">Cerró: ${d}</div>
<div class="grid">
  <div class="card">
    <div class="cardTitle">Resumen</div>
    <div class="row"><div class="label">Total</div><div class="val big">${i(n)}</div></div>
    <div class="row"><div class="label">Tickets</div><div class="val">${String(p)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Pagos</div>
    <div class="row"><div class="label">Efectivo</div><div class="val">${i(m)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${i(y)}</div></div>
    <div class="row"><div class="label">Tarjeta</div><div class="val">${i(b)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${i(g)}</div></div>
    <div class="row"><div class="label">Transferencia</div><div class="val">${i(f)}</div></div>
    <div class="row sub"><div class="label">+ Propina</div><div class="val">${i(h)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Ajustes</div>
    <div class="row"><div class="label">Cortesía</div><div class="val">${i(x)}</div></div>
    <div class="muted" style="margin-top: 4px;">Impacta costos/finanzas (no es ingreso).</div>
    <div style="height: 10px"></div>
    <div class="row"><div class="label">- Descuentos</div><div class="val">${i(N)}</div></div>
    <div class="row"><div class="label">Sin método</div><div class="val">${i(j)}</div></div>
  </div>

  <div class="card">
    <div class="cardTitle">Masas</div>
    <div class="twocol">
      <div class="pill"><div class="muted">30</div><div class="big">${String(S)}</div></div>
      <div class="pill"><div class="muted">20</div><div class="big">${String(w)}</div></div>
    </div>
  </div>
</div>
`,r=window.open("","_blank","noopener,noreferrer");r&&(r.document.open(),r.document.write(H({title:`Cierre ${a}`,body:T})),r.document.close(),r.focus(),r.print())},[i]);return e.jsxs("div",{className:"container",style:{paddingTop:18},children:[e.jsx("div",{className:"row",style:{justifyContent:"space-between",alignItems:"baseline",gap:10,flexWrap:"wrap"},children:e.jsxs("div",{children:[e.jsx("div",{style:{fontWeight:950,fontSize:18},children:"Cierres de caja"}),e.jsx("div",{className:"muted",style:{fontSize:12},children:"Listado de cierres guardados en Firestore."})]})}),e.jsx("div",{style:{height:12}}),e.jsxs("div",{className:"card",style:{margin:0},children:[e.jsxs("div",{className:"row",style:{justifyContent:"space-between",gap:10,flexWrap:"wrap"},children:[e.jsx("div",{style:{fontWeight:900},children:"Buscar"}),e.jsx("input",{className:"input",style:{minWidth:260},placeholder:"YYYY-MM-DD o usuario",value:u,onChange:s=>{const a=new URLSearchParams(t),d=String(s.target.value??"");d.trim()?a.set("q",d):a.delete("q"),l(a)}})]}),e.jsx("div",{style:{height:10}}),z?e.jsx("div",{className:"muted",children:"Cargando…"}):null,$?e.jsx("div",{className:"muted",children:$}):null,z?null:e.jsxs("div",{style:{display:"grid",gap:8},children:[K.length===0?e.jsx("div",{className:"muted",children:"Sin cierres."}):null,K.map(s=>{const a=String(s.dayKey??s.id),d=Number(s.summary?.sum??0),n=Number(s.summary?.salesCount??0),p=s.createdByName?String(s.createdByName):"—",m=B===a,y=Number(s.summary?.byMethod?.efectivo??0),b=Number(s.summary?.byMethod?.propinaEfectivo??0),g=Number(s.summary?.byMethod?.terminal??0),f=Number(s.summary?.byMethod?.propinaTerminal??0),h=Number(s.summary?.byMethod?.transferencia??0),x=Number(s.summary?.byMethod?.propinaTransferencia??0),j=Number(s.summary?.byMethod?.cortesia??0),N=Number(s.summary?.byMethod?.legacy??0),S=Number(s.summary?.discountTotal??0),w=Number(s.summary?.dough?.cm30??0),T=Number(s.summary?.dough?.cm20??0);return e.jsxs("div",{className:"card",style:{margin:0},children:[e.jsxs("button",{className:"row",onClick:()=>k(r=>r===a?null:a),style:{width:"100%",justifyContent:"space-between",gap:12,alignItems:"baseline",background:"transparent",border:"none",padding:0,cursor:"pointer",textAlign:"left",color:"inherit"},"aria-expanded":m,children:[e.jsxs("div",{children:[e.jsxs("div",{style:{fontWeight:950,display:"flex",alignItems:"center",gap:8},children:[e.jsx("span",{children:a}),e.jsx("span",{className:"muted",style:{fontSize:12,fontWeight:900},children:m?"▲":"▼"})]}),e.jsxs("div",{className:"muted",style:{fontSize:12},children:["Cerró: ",p]})]}),e.jsxs("div",{style:{textAlign:"right"},children:[e.jsx("div",{style:{fontWeight:950},children:i(d)}),e.jsxs("div",{className:"muted",style:{fontSize:12},children:[n," venta(s)"]})]})]}),m?e.jsxs("div",{style:{marginTop:12,display:"grid",gap:10},children:[e.jsx("div",{className:"row",style:{justifyContent:"flex-end",gap:8,flexWrap:"wrap"},children:e.jsx("button",{className:"button secondary",onClick:()=>q(s),children:"Imprimir este día"})}),e.jsxs(M,{title:"Pagos",children:[e.jsx(c,{label:"Efectivo",value:i(y)}),e.jsx(C,{label:"+ Propina",value:i(b)}),e.jsx(c,{label:"Tarjeta",value:i(g)}),e.jsx(C,{label:"+ Propina",value:i(f)}),e.jsx(c,{label:"Transferencia",value:i(h)}),e.jsx(C,{label:"+ Propina",value:i(x)}),e.jsx("div",{style:{paddingTop:8}}),e.jsx(c,{label:"Total",value:i(d)})]}),e.jsxs(M,{title:"Ajustes",children:[e.jsx(c,{label:"Cortesía",value:i(j)}),e.jsx("div",{className:"muted",style:{fontSize:12,marginTop:6,lineHeight:1.2},children:"Impacta costos/finanzas (no es ingreso)."}),e.jsx("div",{style:{height:10}}),e.jsx(c,{label:"- Descuentos",value:i(S)}),e.jsx(c,{label:"Sin método",value:i(N)})]}),e.jsx(M,{title:"Masas",children:e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},children:[e.jsxs("div",{style:{border:"1px solid #e5e7eb",borderRadius:12,padding:12,background:"#f8fafc"},children:[e.jsx("div",{className:"muted",style:{fontSize:12,fontWeight:900},children:"30"}),e.jsx("div",{style:{fontSize:24,fontWeight:950,marginTop:2},children:String(w)})]}),e.jsxs("div",{style:{border:"1px solid #e5e7eb",borderRadius:12,padding:12,background:"#f8fafc"},children:[e.jsx("div",{className:"muted",style:{fontSize:12,fontWeight:900},children:"20"}),e.jsx("div",{style:{fontSize:24,fontWeight:950,marginTop:2},children:String(T)})]})]})})]}):null]},s.id)})]})]})]})}export{U as default};
