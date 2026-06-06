const STORAGE_KEY="westlakeInvoiceApp.v2";
const BUILT_IN_LOGO="logo.png";
const defaultData={
  settings:{businessName:"Westlake Tree Experts",phone:"(610) 291-1176",email:"bwestlake@business.com",address:"30 Ivy Ln\nDouglassville, PA 19518",taxRate:6,logo:null},
  customers:[], invoices:[], estimates:[], counters:{invoice:1001,estimate:501}
};
let data=loadData();
let currentPhotos=[];
let signatureData="";
let signaturePad, signatureCtx, drawing=false;

function loadData(){try{return deepMerge(structuredClone(defaultData),JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"))}catch(e){return structuredClone(defaultData)}}
function deepMerge(a,b){for(const k in b){if(b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k]))a[k]=deepMerge(a[k]||{},b[k]);else a[k]=b[k]}return a}
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));refreshAll()}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function money(n){return Number(n||0).toLocaleString(undefined,{style:"currency",currency:"USD"})}
function today(){return new Date().toISOString().slice(0,10)}
function addDays(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function val(id){return document.getElementById(id)?.value||""}
function setVal(id,v){const el=document.getElementById(id);if(el)el.value=v??""}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>showView(btn.dataset.view)));
  initSignaturePad();
  bindEvents();
  clearInvoiceForm();
  clearEstimateForm();
  refreshAll();
  if("serviceWorker" in navigator){navigator.serviceWorker.register("service-worker.js").catch(()=>{})}
});

function bindEvents(){
  ["invoiceApplyTax","invoiceTaxRate"].forEach(id=>document.getElementById(id).addEventListener("input",calcInvoiceTotals));
  ["estimateApplyTax","estimateTaxRate"].forEach(id=>document.getElementById(id).addEventListener("input",calcEstimateTotals));
  document.getElementById("invoiceCustomerSelect").addEventListener("change",()=>fillCustomer("invoice"));
  document.getElementById("estimateCustomerSelect").addEventListener("change",()=>fillCustomer("estimate"));
  document.getElementById("invoicePhotos").addEventListener("change",handlePhotos);
}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view===id));
  document.getElementById(id).classList.add("active");
  refreshAll();
}
function refreshAll(){renderBrand();renderCustomerOptions();renderDashboard();renderCustomers();renderHistory();renderReports();loadSettingsForm()}
function logoSrc(){return data.settings.logo || BUILT_IN_LOGO}
function renderBrand(){
  const mark=document.getElementById("brandMark");
  if(mark) mark.innerHTML=`<img alt="Logo" src="${logoSrc()}">`;
}

function renderCustomerOptions(){
  const opts=['<option value="">New / manual customer</option>'].concat(data.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`)).join("");
  ["invoiceCustomerSelect","estimateCustomerSelect"].forEach(id=>{const el=document.getElementById(id); if(el) el.innerHTML=opts});
}
function fillCustomer(type){
  const id=val(type+"CustomerSelect"); if(!id)return;
  const c=data.customers.find(x=>x.id===id); if(!c)return;
  setVal(type+"CustomerName",c.name); setVal(type+"CustomerPhone",c.phone); setVal(type+"CustomerEmail",c.email); setVal(type+"CustomerAddress",c.address);
}

function makeLineItem(containerId, description="", amount=""){
  const wrap=document.createElement("div"); wrap.className="line-item";
  wrap.innerHTML=`<label>Description <input class="li-desc" value="${escapeAttr(description)}" placeholder="Tree removal"></label>
  <label>Amount <input class="li-amount" type="number" step="0.01" value="${amount}" placeholder="0.00"></label>
  <button type="button" class="danger" aria-label="Delete line item">×</button>`;
  wrap.querySelector(".li-amount").addEventListener("input",()=>containerId.includes("invoice")?calcInvoiceTotals():calcEstimateTotals());
  wrap.querySelector("button").addEventListener("click",()=>{wrap.remove(); containerId.includes("invoice")?calcInvoiceTotals():calcEstimateTotals()});
  document.getElementById(containerId).appendChild(wrap);
}
function getLineItems(containerId){return [...document.querySelectorAll(`#${containerId} .line-item`)].map(row=>({description:row.querySelector(".li-desc").value,amount:Number(row.querySelector(".li-amount").value||0)})).filter(x=>x.description||x.amount)}
function addInvoiceLineItem(desc="",amount=""){makeLineItem("invoiceLineItems",desc,amount); calcInvoiceTotals()}
function addEstimateLineItem(desc="",amount=""){makeLineItem("estimateLineItems",desc,amount); calcEstimateTotals()}
function calcTotals(items, applyTax, rate){const subtotal=items.reduce((s,x)=>s+Number(x.amount||0),0);const tax=applyTax?subtotal*(Number(rate||0)/100):0;return{subtotal,tax,total:subtotal+tax}}
function calcInvoiceTotals(){const t=calcTotals(getLineItems("invoiceLineItems"),document.getElementById("invoiceApplyTax").checked,val("invoiceTaxRate"));setText("invoiceSubtotal",money(t.subtotal));setText("invoiceTax",money(t.tax));setText("invoiceTotal",money(t.total));return t}
function calcEstimateTotals(){const t=calcTotals(getLineItems("estimateLineItems"),document.getElementById("estimateApplyTax").checked,val("estimateTaxRate"));setText("estimateSubtotal",money(t.subtotal));setText("estimateTax",money(t.tax));setText("estimateTotal",money(t.total));return t}

function clearInvoiceForm(){
  setVal("invoiceId",""); setVal("invoiceNumber","INV-"+data.counters.invoice); setVal("invoiceDate",today()); setVal("invoiceDueDate",addDays(15)); setVal("invoiceStatus","Draft");
  ["invoiceCustomerName","invoiceCustomerPhone","invoiceCustomerEmail","invoiceCustomerAddress","invoiceNotes","invoiceInternalNotes"].forEach(id=>setVal(id,""));
  document.getElementById("invoiceLineItems").innerHTML=""; addInvoiceLineItem();
  document.getElementById("invoiceApplyTax").checked=false; setVal("invoiceTaxRate",data.settings.taxRate);
  currentPhotos=[]; renderPhotos(); clearSignature(); setText("invoiceFormTitle","New Invoice");
}
function newInvoice(){clearInvoiceForm();showView("invoice")}
function saveInvoice(){
  const items=getLineItems("invoiceLineItems"); if(!val("invoiceCustomerName")) return alert("Customer name is required.");
  const totals=calcInvoiceTotals(); let id=val("invoiceId")||uid(); const existing=data.invoices.find(x=>x.id===id);
  const inv={id,type:"invoice",customerName:val("invoiceCustomerName"),phone:val("invoiceCustomerPhone"),email:val("invoiceCustomerEmail"),address:val("invoiceCustomerAddress"),number:val("invoiceNumber")||("INV-"+data.counters.invoice),date:val("invoiceDate"),dueDate:val("invoiceDueDate"),status:val("invoiceStatus"),items,applyTax:document.getElementById("invoiceApplyTax").checked,taxRate:Number(val("invoiceTaxRate")||0),notes:val("invoiceNotes"),internalNotes:val("invoiceInternalNotes"),photos:currentPhotos,signature:signatureData,subtotal:totals.subtotal,tax:totals.tax,total:totals.total,updatedAt:new Date().toISOString()};
  if(existing){Object.assign(existing,inv)}else{data.invoices.push(inv);data.counters.invoice++}
  ensureCustomerFromRecord(inv); setVal("invoiceId",id); saveData(); alert("Invoice saved.");
}
function editInvoice(id){const inv=data.invoices.find(x=>x.id===id); if(!inv)return; clearInvoiceForm(); setVal("invoiceId",inv.id); setVal("invoiceNumber",inv.number);setVal("invoiceDate",inv.date);setVal("invoiceDueDate",inv.dueDate);setVal("invoiceStatus",inv.status);setVal("invoiceCustomerName",inv.customerName);setVal("invoiceCustomerPhone",inv.phone);setVal("invoiceCustomerEmail",inv.email);setVal("invoiceCustomerAddress",inv.address);setVal("invoiceNotes",inv.notes);setVal("invoiceInternalNotes",inv.internalNotes);document.getElementById("invoiceApplyTax").checked=!!inv.applyTax;setVal("invoiceTaxRate",inv.taxRate);document.getElementById("invoiceLineItems").innerHTML="";(inv.items||[]).forEach(i=>addInvoiceLineItem(i.description,i.amount));currentPhotos=inv.photos||[]; signatureData=inv.signature||""; restoreSignature(); renderPhotos(); calcInvoiceTotals(); setText("invoiceFormTitle","Edit Invoice");showView("invoice")}
function deleteCurrentInvoice(){const id=val("invoiceId"); if(!id)return alert("No saved invoice selected."); if(confirm("Delete this invoice?")){data.invoices=data.invoices.filter(x=>x.id!==id);saveData();clearInvoiceForm();showView("history")}}
function duplicateInvoice(id){const inv=data.invoices.find(x=>x.id===id); if(!inv)return; const copy={...structuredClone(inv),id:uid(),number:"INV-"+data.counters.invoice,date:today(),dueDate:addDays(15),status:"Draft"}; data.counters.invoice++;data.invoices.push(copy);saveData();editInvoice(copy.id)}
function markInvoice(id,status){const inv=data.invoices.find(x=>x.id===id); if(inv){inv.status=status;saveData()}}

function clearEstimateForm(){
  setVal("estimateId",""); setVal("estimateNumber","EST-"+data.counters.estimate); setVal("estimateDate",today()); setVal("estimateExpireDate",addDays(30)); setVal("estimateStatus","Draft");
  ["estimateCustomerName","estimateCustomerPhone","estimateCustomerEmail","estimateCustomerAddress","estimateNotes"].forEach(id=>setVal(id,""));
  document.getElementById("estimateLineItems").innerHTML=""; addEstimateLineItem();
  document.getElementById("estimateApplyTax").checked=false; setVal("estimateTaxRate",data.settings.taxRate); setText("estimateFormTitle","New Estimate");
}
function newEstimate(){clearEstimateForm();showView("estimate")}
function saveEstimate(){
  const items=getLineItems("estimateLineItems"); if(!val("estimateCustomerName")) return alert("Customer name is required.");
  const totals=calcEstimateTotals(); let id=val("estimateId")||uid(); const existing=data.estimates.find(x=>x.id===id);
  const est={id,type:"estimate",customerName:val("estimateCustomerName"),phone:val("estimateCustomerPhone"),email:val("estimateCustomerEmail"),address:val("estimateCustomerAddress"),number:val("estimateNumber")||("EST-"+data.counters.estimate),date:val("estimateDate"),expireDate:val("estimateExpireDate"),status:val("estimateStatus"),items,applyTax:document.getElementById("estimateApplyTax").checked,taxRate:Number(val("estimateTaxRate")||0),notes:val("estimateNotes"),subtotal:totals.subtotal,tax:totals.tax,total:totals.total,updatedAt:new Date().toISOString()};
  if(existing){Object.assign(existing,est)}else{data.estimates.push(est);data.counters.estimate++}
  ensureCustomerFromRecord(est); setVal("estimateId",id); saveData(); alert("Estimate saved.");
}
function editEstimate(id){const est=data.estimates.find(x=>x.id===id); if(!est)return; clearEstimateForm(); setVal("estimateId",est.id); setVal("estimateNumber",est.number);setVal("estimateDate",est.date);setVal("estimateExpireDate",est.expireDate);setVal("estimateStatus",est.status);setVal("estimateCustomerName",est.customerName);setVal("estimateCustomerPhone",est.phone);setVal("estimateCustomerEmail",est.email);setVal("estimateCustomerAddress",est.address);setVal("estimateNotes",est.notes);document.getElementById("estimateApplyTax").checked=!!est.applyTax;setVal("estimateTaxRate",est.taxRate);document.getElementById("estimateLineItems").innerHTML="";(est.items||[]).forEach(i=>addEstimateLineItem(i.description,i.amount));calcEstimateTotals(); setText("estimateFormTitle","Edit Estimate");showView("estimate")}
function deleteCurrentEstimate(){const id=val("estimateId"); if(!id)return alert("No saved estimate selected."); if(confirm("Delete this estimate?")){data.estimates=data.estimates.filter(x=>x.id!==id);saveData();clearEstimateForm();showView("history")}}
function convertEstimateToInvoice(){
  if(!val("estimateId")){saveEstimate()}
  const est=data.estimates.find(x=>x.id===val("estimateId")) || data.estimates.at(-1); if(!est)return;
  const inv={...structuredClone(est),id:uid(),type:"invoice",number:"INV-"+data.counters.invoice,dueDate:addDays(15),status:"Draft",photos:[],signature:"",internalNotes:"",updatedAt:new Date().toISOString()};
  delete inv.expireDate; data.counters.invoice++; data.invoices.push(inv); est.status="Accepted"; saveData(); editInvoice(inv.id);
}

function ensureCustomerFromRecord(r){
  const key=(r.customerName||"").trim().toLowerCase(); if(!key)return;
  let c=data.customers.find(x=>(x.name||"").trim().toLowerCase()===key);
  if(c){c.phone=r.phone||c.phone;c.email=r.email||c.email;c.address=r.address||c.address}
  else data.customers.push({id:uid(),name:r.customerName,phone:r.phone,email:r.email,address:r.address,notes:""});
}
function clearCustomerForm(){["customerId","customerName","customerPhone","customerEmail","customerAddress","customerNotes"].forEach(id=>setVal(id,""))}
function saveCustomer(){if(!val("customerName"))return alert("Customer name is required.");const id=val("customerId")||uid();const rec={id,name:val("customerName"),phone:val("customerPhone"),email:val("customerEmail"),address:val("customerAddress"),notes:val("customerNotes")};const old=data.customers.find(x=>x.id===id); if(old)Object.assign(old,rec); else data.customers.push(rec); saveData(); clearCustomerForm()}
function editCustomer(id){const c=data.customers.find(x=>x.id===id); if(!c)return; setVal("customerId",c.id);setVal("customerName",c.name);setVal("customerPhone",c.phone);setVal("customerEmail",c.email);setVal("customerAddress",c.address);setVal("customerNotes",c.notes);showView("customers")}
function deleteCustomer(){const id=val("customerId"); if(!id)return; if(confirm("Delete this customer?")){data.customers=data.customers.filter(x=>x.id!==id);saveData();clearCustomerForm()}}
function renderCustomers(){const q=(val("customerSearch")||"").toLowerCase(); const list=document.getElementById("customerList"); if(!list)return; list.innerHTML=data.customers.filter(c=>JSON.stringify(c).toLowerCase().includes(q)).map(c=>`<div class="list-item"><h4>${escapeHtml(c.name)}</h4><p>${escapeHtml(c.phone||"")} ${escapeHtml(c.email||"")}</p><p>${escapeHtml(c.address||"").replaceAll("\n","<br>")}</p><button onclick="editCustomer('${c.id}')">Edit</button></div>`).join("")||"<p>No customers yet.</p>"}

function renderDashboard(){const paid=data.invoices.filter(i=>i.status==="Paid");const unpaid=data.invoices.filter(i=>i.status==="Unpaid"||i.status==="Sent"||i.status==="Draft");const overdue=data.invoices.filter(i=>isOverdue(i));const now=new Date();const total=paid.reduce((s,i)=>s+i.total,0);const month=paid.filter(i=>sameMonth(i.date,now)).reduce((s,i)=>s+i.total,0);const outstanding=data.invoices.filter(i=>i.status!=="Paid").reduce((s,i)=>s+i.total,0);setText("dashTotalRevenue",money(total));setText("dashMonthRevenue",money(month));setText("dashOutstanding",money(outstanding));setText("dashPaidCount",paid.length);setText("dashUnpaidCount",unpaid.length);setText("dashOverdueCount",overdue.length);setText("dashCustomerCount",data.customers.length)}
function isOverdue(i){return i.status!=="Paid" && i.dueDate && new Date(i.dueDate+"T23:59:59")<new Date()}
function sameMonth(d,now){const x=new Date(d);return x.getFullYear()===now.getFullYear()&&x.getMonth()===now.getMonth()}
function renderHistory(){const q=(val("historySearch")||"").toLowerCase();const f=val("historyFilter")||"all";const all=[...data.invoices,...data.estimates].sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));let rows=all.filter(r=>JSON.stringify(r).toLowerCase().includes(q));if(f==="invoice")rows=rows.filter(r=>r.type==="invoice");else if(f==="estimate")rows=rows.filter(r=>r.type==="estimate");else if(f!=="all")rows=rows.filter(r=>r.status===f);document.getElementById("historyList").innerHTML=rows.map(r=>`<div class="list-item"><h4>${r.type==="invoice"?"Invoice":"Estimate"} ${escapeHtml(r.number)} <span class="pill ${String(r.status||"").toLowerCase()}">${escapeHtml(r.status||"")}</span></h4><p>${escapeHtml(r.customerName)} • ${escapeHtml(r.date||"")} • <strong>${money(r.total)}</strong></p><div class="row-actions">${r.type==="invoice"?`<button onclick="editInvoice('${r.id}')">Open</button><button onclick="duplicateInvoice('${r.id}')">Duplicate</button><button onclick="markInvoice('${r.id}','Paid')">Mark Paid</button><button onclick="markInvoice('${r.id}','Unpaid')">Mark Unpaid</button><button onclick="printRecord('invoice','${r.id}')">Print/PDF</button>`:`<button onclick="editEstimate('${r.id}')">Open</button><button onclick="printRecord('estimate','${r.id}')">Print/PDF</button>`}</div></div>`).join("")||"<p>No records yet.</p>"}
function renderReports(){const paid=data.invoices.filter(i=>i.status==="Paid");const total=paid.reduce((s,i)=>s+i.total,0);const now=new Date();const month=paid.filter(i=>sameMonth(i.date,now)).reduce((s,i)=>s+i.total,0);const year=paid.filter(i=>new Date(i.date).getFullYear()===now.getFullYear()).reduce((s,i)=>s+i.total,0);setText("reportTotal",money(total));setText("reportMonth",money(month));setText("reportYear",money(year));setText("reportJobs",paid.length);setText("reportAverage",money(paid.length?total/paid.length:0));const byCust={};paid.forEach(i=>byCust[i.customerName]=(byCust[i.customerName]||0)+i.total);document.getElementById("topCustomers").innerHTML=Object.entries(byCust).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,t])=>`<div class="list-item"><h4>${escapeHtml(n)}</h4><p>${money(t)}</p></div>`).join("")||"<p>No paid invoices yet.</p>";const byMonth={};paid.forEach(i=>{const k=(i.date||"").slice(0,7);if(k)byMonth[k]=(byMonth[k]||0)+i.total});const max=Math.max(...Object.values(byMonth),1);document.getElementById("revenueBars").innerHTML=Object.entries(byMonth).sort().slice(-12).map(([m,t])=>`<div class="bar-row"><span>${m.slice(5)}</span><div class="bar" style="width:${Math.max(4,t/max*100)}%"></div><strong>${money(t)}</strong></div>`).join("")||"<p>No revenue chart yet.</p>"}

function initSignaturePad(){signaturePad=document.getElementById("signaturePad");signatureCtx=signaturePad.getContext("2d");signatureCtx.lineWidth=3;signatureCtx.lineCap="round";["mousedown","touchstart"].forEach(e=>signaturePad.addEventListener(e,startDraw,{passive:false}));["mousemove","touchmove"].forEach(e=>signaturePad.addEventListener(e,draw,{passive:false}));["mouseup","mouseleave","touchend"].forEach(e=>signaturePad.addEventListener(e,endDraw,{passive:false}))}
function pos(e){const r=signaturePad.getBoundingClientRect();const p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*(signaturePad.width/r.width),y:(p.clientY-r.top)*(signaturePad.height/r.height)}}
function startDraw(e){e.preventDefault();drawing=true;const p=pos(e);signatureCtx.beginPath();signatureCtx.moveTo(p.x,p.y)}
function draw(e){if(!drawing)return;e.preventDefault();const p=pos(e);signatureCtx.lineTo(p.x,p.y);signatureCtx.stroke()}
function endDraw(){if(!drawing)return;drawing=false;signatureData=signaturePad.toDataURL("image/png")}
function clearSignature(){if(!signatureCtx)return;signatureCtx.clearRect(0,0,signaturePad.width,signaturePad.height);signatureData=""}
function restoreSignature(){clearSignature(); if(signatureData){const img=new Image();img.onload=()=>signatureCtx.drawImage(img,0,0,signaturePad.width,signaturePad.height);img.src=signatureData}}

function handlePhotos(e){[...e.target.files].forEach(file=>{const reader=new FileReader();reader.onload=()=>{currentPhotos.push(reader.result);renderPhotos()};reader.readAsDataURL(file)})}
function renderPhotos(){const el=document.getElementById("photoPreview"); if(el)el.innerHTML=currentPhotos.map((p,i)=>`<div><img src="${p}"><button type="button" onclick="removePhoto(${i})">Remove</button></div>`).join("")}
function removePhoto(i){currentPhotos.splice(i,1);renderPhotos()}

function printCurrentInvoice(){if(!val("invoiceId")){saveInvoice()} const rec=data.invoices.find(x=>x.id===val("invoiceId"))||data.invoices.at(-1); if(rec)printRecord("invoice",rec.id)}
function printCurrentEstimate(){if(!val("estimateId")){saveEstimate()} const rec=data.estimates.find(x=>x.id===val("estimateId"))||data.estimates.at(-1); if(rec)printRecord("estimate",rec.id)}
function printRecord(type,id){const rec=(type==="invoice"?data.invoices:data.estimates).find(x=>x.id===id); if(!rec)return;document.getElementById("printArea").innerHTML=recordHtml(rec);setTimeout(()=>window.print(),100)}
function shareCurrentInvoice(){const rec=data.invoices.find(x=>x.id===val("invoiceId")); if(!rec)return alert("Save the invoice first."); const text=`${rec.number} for ${rec.customerName}: ${money(rec.total)}. Use Print / Save PDF to make a customer copy.`; if(navigator.share) navigator.share({title:rec.number,text}); else alert(text)}
function recordHtml(r){const s=data.settings;return `<div class="print-document"><div class="print-header"><div><img class="print-logo" src="${logoSrc()}" onerror="this.style.display='none'"><p><strong>${escapeHtml(s.businessName)}</strong><br>${escapeHtml(s.phone)}<br>${escapeHtml(s.email)}<br>${escapeHtml(s.address).replaceAll("\n","<br>")}</p></div><div class="print-title"><h2>${r.type==="invoice"?"INVOICE":"ESTIMATE"}</h2><p><strong># ${escapeHtml(r.number)}</strong><br>Date: ${escapeHtml(r.date||"")}<br>${r.type==="invoice"?"Due: "+escapeHtml(r.dueDate||""):"Expires: "+escapeHtml(r.expireDate||"")}<br>Status: ${escapeHtml(r.status||"")}</p></div></div><div class="print-grid"><div><h3>Bill To</h3><p>${escapeHtml(r.customerName)}<br>${escapeHtml(r.address||"").replaceAll("\n","<br>")}<br>${escapeHtml(r.phone||"")}<br>${escapeHtml(r.email||"")}</p></div><div><h3>Notes</h3><p>${escapeHtml(r.notes||"").replaceAll("\n","<br>")}</p></div></div><table class="print-table"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${(r.items||[]).map(i=>`<tr><td>${escapeHtml(i.description)}</td><td>${money(i.amount)}</td></tr>`).join("")}</tbody></table><div class="print-totals"><div><span>Subtotal</span><strong>${money(r.subtotal)}</strong></div>${r.applyTax?`<div><span>Sales Tax (${r.taxRate}%)</span><strong>${money(r.tax)}</strong></div>`:""}<div class="grand"><span>Total</span><strong>${money(r.total)}</strong></div></div>${r.signature?`<h3>Customer Signature</h3><img class="signature-img" src="${r.signature}">`:""}${(r.photos||[]).length?`<div class="page-break"></div><h3>Job Photos</h3><div class="print-photos">${r.photos.map(p=>`<img src="${p}">`).join("")}</div>`:""}</div>`}

function loadSettingsForm(){setVal("settingsBusinessName",data.settings.businessName);setVal("settingsPhone",data.settings.phone);setVal("settingsEmail",data.settings.email);setVal("settingsAddress",data.settings.address);setVal("settingsTaxRate",data.settings.taxRate)}
function saveSettings(){data.settings.businessName=val("settingsBusinessName");data.settings.phone=val("settingsPhone");data.settings.email=val("settingsEmail");data.settings.address=val("settingsAddress");data.settings.taxRate=Number(val("settingsTaxRate")||6);const file=document.getElementById("settingsLogo").files[0];if(file){const reader=new FileReader();reader.onload=()=>{data.settings.logo=reader.result;saveData();alert("Settings saved.")};reader.readAsDataURL(file)}else{saveData();alert("Settings saved.")}}
function exportBackup(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="westlake-invoice-backup-"+today()+".json";a.click();URL.revokeObjectURL(a.href)}
function importBackup(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{data=JSON.parse(reader.result);saveData();alert("Backup imported.")}catch(err){alert("Invalid backup file.")}};reader.readAsText(file)}
function resetDemoData(){if(confirm("This will permanently clear all local app data on this device. Continue?")){data=structuredClone(defaultData);saveData();location.reload()}}

function setText(id,v){const el=document.getElementById(id); if(el)el.textContent=v}
function escapeHtml(str=""){return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function escapeAttr(str=""){return escapeHtml(str).replaceAll("\n"," ")}
