import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://htnzusdfrltzwzpaxzyh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_y6-fjFPlv0nW8cV5r-2lPg_BlBl2IPr";
const LOGIN_EMAILS = { s: "s@bird.local", emad: "admin@bird.local" };

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false }
});

const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let operations = [];
let pendingBackup = null;
let pendingDeleteOperation = null;
let monthlyChart = null;
let mixChart = null;

let selectedGregorianPeriod = null;


function isEditor(){ return currentProfile?.role === "editor"; }
function isAdmin(){ return currentProfile?.role === "viewer_admin"; }

function showToast(msg){
  const t=$("toast");
  t.textContent=msg;
  t.hidden=false;
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.hidden=true,3000);
}

function todayISO(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function esc(v=""){
  return String(v)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeDigits(value){
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٫،,]/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9.\-]/g, "");
}

function parseAmount(value){
  const normalized=normalizeDigits(value);
  if(!normalized) return NaN;
  const parts=normalized.split(".");
  const clean=parts.length<=2 ? normalized : `${parts.shift()}.${parts.join("")}`;
  return Number(clean);
}

function parseInteger(value){
  const n=parseInt(normalizeDigits(value),10);
  return Number.isFinite(n)?n:null;
}

function makeId(){
  if(globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if(globalThis.crypto?.getRandomValues){
    const bytes=new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6]=(bytes[6]&0x0f)|0x40;
    bytes[8]=(bytes[8]&0x3f)|0x80;
    const h=[...bytes].map(b=>b.toString(16).padStart(2,"0"));
    return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10).join("")}`;
  }
  return `bird-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function num(v){
  return new Intl.NumberFormat("en-US").format(Number(v||0));
}

function formatAmountNumber(v){
  const n = Number(v || 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

/*
  MONEY v3.8 — FORCED GEOMETRIC ORDER

  IMPORTANT:
  The page is Arabic/RTL, so "500 ر.س" means:
  RIGHT SIDE  = 500
  LEFT SIDE   = ر.س

  We do NOT ask the bidi algorithm to decide anything.
  The two pieces are separate grid cells in a forced LTR coordinate system:

      [currency cell][number cell]
         LEFT           RIGHT

  Therefore the number is physically on the right, always.
*/
function moneyMarkup(v){
  return `
    <span class="money-force" dir="ltr">
      <span class="money-force-currency"><img src="./riyal-symbol.png" alt="ريال سعودي" class="riyal-symbol"></span>
      <span class="money-force-number" dir="ltr">${formatAmountNumber(v)}</span>
    </span>
  `;
}

function setMoney(id,v){
  const el=$(id);
  if(!el) return;
  el.innerHTML=moneyMarkup(v);
}

function moneyText(v){
  return `${formatAmountNumber(v)} ر.س`;
}

/* Money is HTML, not a bidi-sensitive text string. */


function shortGregorian(v){
  if(!v) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{
    year:"numeric",month:"long",day:"numeric"
  }).format(new Date(`${v}T12:00:00`));
}

function gregorianMonthKey(isoDate){
  return String(isoDate||"").slice(0,7);
}

function currentGregorianKey(){
  return gregorianMonthKey(todayISO());
}

function gregorianPeriodLabel(key){
  if(!key) return "من البداية";
  const [year,month]=key.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{
    year:"numeric",month:"long"
  }).format(new Date(year,month-1,1,12,0,0));
}

function moveGregorianMonth(key,offset){
  const [year,month]=key.split("-").map(Number);
  const d=new Date(year,month-1+offset,1,12,0,0);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function initializeCurrentGregorianPeriod(){
  selectedGregorianPeriod=currentGregorianKey();
}

function periodOperations(){
  if(!selectedGregorianPeriod) return operations;
  return operations.filter(op=>gregorianMonthKey(op.date)===selectedGregorianPeriod);
}

function renderPeriodBar(){
  $("periodCaption").textContent=selectedGregorianPeriod ? "إحصائيات الشهر" : "إحصائيات المشروع";
  $("periodLabel").textContent=selectedGregorianPeriod ? gregorianPeriodLabel(selectedGregorianPeriod) : "من البداية";
  $("periodGregorianHint").textContent=selectedGregorianPeriod ? "بالتاريخ الميلادي" : "كل الفترات";

  $("recordsPeriodText").textContent=selectedGregorianPeriod
    ? `عمليات ${gregorianPeriodLabel(selectedGregorianPeriod)}`
    : "كل العمليات من بداية المشروع";

  $("financePeriodText").textContent=selectedGregorianPeriod
    ? `تحليل ${gregorianPeriodLabel(selectedGregorianPeriod)}`
    : "التحليل الكامل من بداية المشروع";

  $("allTimeBtn").classList.toggle("active",!selectedGregorianPeriod);
}

$("prevMonthBtn").addEventListener("click",()=>{
  if(!selectedGregorianPeriod){
    selectedGregorianPeriod=moveGregorianMonth(currentGregorianKey(),-1);
  }else{
    selectedGregorianPeriod=moveGregorianMonth(selectedGregorianPeriod,-1);
  }
  renderPeriodBar();
  renderAll();
});

$("nextMonthBtn").addEventListener("click",()=>{
  const currentKey=currentGregorianKey();
  if(!selectedGregorianPeriod){
    selectedGregorianPeriod=currentKey;
  }else{
    const nextKey=moveGregorianMonth(selectedGregorianPeriod,1);
    if(nextKey>currentKey) return;
    selectedGregorianPeriod=nextKey;
  }
  renderPeriodBar();
  renderAll();
});

$("allTimeBtn").addEventListener("click",()=>{
  selectedGregorianPeriod=selectedGregorianPeriod ? null : currentGregorianKey();
  renderPeriodBar();
  renderAll();
});

function route(name){
  if((name==="sale"||name==="expense")&&!isEditor()) name="home";
  if(name==="backup"&&!isAdmin()) name="home";

  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(`page-${name}`)?.classList.add("active");
  document.querySelectorAll(".nav-pill").forEach(b=>b.classList.toggle("active",b.dataset.route===name));

  $("periodBar").hidden=name==="sale"||name==="expense"||name==="backup";
  window.scrollTo({top:0,behavior:"smooth"});
  if(name==="finance") renderFinance();
}

document.addEventListener("click",e=>{
  const b=e.target.closest("[data-route]");
  if(b){ e.preventDefault(); route(b.dataset.route); }
});

async function loadProfile(){
  const {data,error}=await supabase.from("profiles").select("id,username,role").eq("id",currentUser.id).single();
  if(error) throw error;
  currentProfile=data;
}

async function loadOperations(){
  $("loadingState").hidden=false;
  const {data,error}=await supabase.from("operations").select("*").order("date",{ascending:false}).order("created_at",{ascending:false});
  $("loadingState").hidden=true;
  if(error) throw error;

  operations=data||[];
  renderPeriodBar();
  renderAll();
}

function getStats(list=periodOperations()){
  const salesOps=list.filter(x=>x.type==="sale");
  const expOps=list.filter(x=>x.type==="expense");
  const sales=salesOps.reduce((s,x)=>s+Number(x.amount||0),0);
  const expenses=expOps.reduce((s,x)=>s+Number(x.amount||0),0);
  const birds=salesOps.reduce((s,x)=>s+Number(x.quantity||0),0);
  return {salesOps,expOps,sales,expenses,net:sales-expenses,birds};
}

function birdsText(total){
  total=Number(total||0);
  const pairs=Math.floor(total/2);
  return {
    main:`${num(pairs)} جوز${total%2 ? " ونص" : ""}`,
    sub:`${num(total)} حبة`
  };
}

function renderHome(){
  const list=periodOperations();
  const s=getStats(list);

  setMoney("salesTotal",s.sales);
  setMoney("expensesTotal",s.expenses);
  setMoney("netTotal",s.net);

  const b=birdsText(s.birds);
  $("birdsTotal").textContent=b.main;
  $("birdsPieces").textContent=b.sub;

  const latest=list.slice(0,3);
  $("latestEmpty").hidden=latest.length>0;
  $("latestList").innerHTML=latest.map(op=>`
    <article class="latest-item">
      <div class="latest-top">
        <span class="badge ${op.type}">${op.type==="sale"?"بيع":"مصروف"}</span>
        <strong>${moneyMarkup(op.amount)}</strong>
      </div>
      <small>
        ${esc(shortGregorian(op.date))}
        ${op.category?`<br>${esc(op.category)}`:""}
      </small>
    </article>
  `).join("");
}

function filteredOps(){
  const type=$("filterType").value;
  const q=$("searchInput").value.trim().toLowerCase();
  return periodOperations().filter(op=>{
    const typeOk=type==="all"||op.type===type;
    const text=`${op.category||""} ${op.notes||""}`.toLowerCase();
    return typeOk&&(!q||text.includes(q));
  });
}

function actionHTML(op){
  if(!isEditor()) return "";
  return `<div class="row-actions">
    <button class="edit-btn" data-act="edit" data-id="${esc(op.id)}"><svg><use href="#i-edit"></use></svg></button>
    <button class="delete-btn" data-act="delete" data-id="${esc(op.id)}"><svg><use href="#i-trash"></use></svg></button>
  </div>`;
}

function renderRecords(){
  const rows=filteredOps();
  $("actionsHead").hidden=!isEditor();
  $("emptyState").hidden=rows.length>0;
  $("operationsTable").hidden=rows.length===0;

  $("operationsBody").innerHTML=rows.map(op=>`
    <tr>
      <td class="date-cell">
        <strong>${esc(shortGregorian(op.date))}</strong>
        <small dir="ltr">${esc(shortGregorian(op.date))}</small>
      </td>
      <td><span class="badge ${op.type}">${op.type==="sale"?"بيع":"مصروف"}</span></td>
      <td><strong>${moneyMarkup(op.amount)}</strong></td>
      <td>${op.quantity!=null?esc(num(op.quantity)):"—"}</td>
      <td>${esc(op.category||"—")}</td>
      <td>${esc(op.notes||"—")}</td>
      ${isEditor()?`<td>${actionHTML(op)}</td>`:""}
    </tr>
  `).join("");

  $("operationsCards").innerHTML=rows.map(op=>`
    <article class="operation-card">
      <div class="operation-card-top">
        <span class="badge ${op.type}">${op.type==="sale"?"بيع":"مصروف"}</span>
        <strong>${moneyMarkup(op.amount)}</strong>
      </div>
      <div class="operation-card-date">
        ${esc(shortGregorian(op.date))}<br>
        <span dir="ltr">${esc(shortGregorian(op.date))}</span>
      </div>
      <div class="operation-card-meta">
        ${op.quantity!=null?`<span class="meta-chip">🕊️ ${esc(num(op.quantity))} حبة</span>`:""}
        ${op.category?`<span class="meta-chip">${esc(op.category)}</span>`:""}
      </div>
      ${op.notes?`<div class="operation-card-note">${esc(op.notes)}</div>`:""}
      ${isEditor()?`<div class="operation-card-actions">
        <button class="edit-btn" data-act="edit" data-id="${esc(op.id)}">تعديل</button>
        <button class="delete-btn" data-act="delete" data-id="${esc(op.id)}">حذف</button>
      </div>`:""}
    </article>
  `).join("");
}

function renderAll(){
  renderHome();
  renderRecords();
  if(currentProfile) renderFinance();
}


function resetSale(){
  $("saleEditingId").value="";
  $("saleDate").value=todayISO();
  $("saleAmount").value="";
  $("saleQuantity").value="";
  $("saleCategory").value="";
  $("saleNotes").value="";
  $("saleEditBanner").hidden=true;
  $("salePageTitle").textContent="تسجيل بيع";
  $("saleSaveBtn").innerHTML='<svg><use href="#i-check"></use></svg><span>حفظ البيع</span>';
}

function clearExpenseCategory(){
  document.querySelectorAll('input[name="expenseCategory"]').forEach(r=>r.checked=false);
}

function setExpenseCategory(value){
  let found=false;
  document.querySelectorAll('input[name="expenseCategory"]').forEach(r=>{
    r.checked=r.value===value;
    if(r.checked) found=true;
  });
  if(!found&&value){
    const other=[...document.querySelectorAll('input[name="expenseCategory"]')].find(r=>r.value==="أخرى");
    if(other) other.checked=true;
  }
}

function selectedExpenseCategory(){
  return document.querySelector('input[name="expenseCategory"]:checked')?.value||"";
}

function resetExpense(){
  $("expenseEditingId").value="";
  $("expenseDate").value=todayISO();
  $("expenseAmount").value="";
  $("expenseNotes").value="";
  clearExpenseCategory();
  $("expenseEditBanner").hidden=true;
  $("expensePageTitle").textContent="تسجيل مصروف";
  $("expenseSaveBtn").innerHTML='<svg><use href="#i-check"></use></svg><span>حفظ المصروف</span>';
}

$("cancelSaleEdit").addEventListener("click",()=>{resetSale();route("records")});
$("cancelExpenseEdit").addEventListener("click",()=>{resetExpense();route("records")});

$("saleForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isEditor()) return;

  const date=$("saleDate").value;
  const amount=parseAmount($("saleAmount").value);
  const quantity=parseInteger($("saleQuantity").value);

  if(!date){ showToast("اختر تاريخ البيع"); return; }
  if(!Number.isFinite(amount)||amount<=0){ showToast("اكتب مبلغ البيع بشكل صحيح"); return; }

  const id=$("saleEditingId").value;
  const payload={
    type:"sale",date,amount,quantity,
    category:$("saleCategory").value.trim(),
    notes:$("saleNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const btn=$("saleSaveBtn");
  btn.disabled=true; btn.textContent="جاري الحفظ...";

  try{
if(id){
      const {error}=await supabase.from("operations").update(payload).eq("id",id);
      if(error) throw error;
      showToast("تم تعديل البيع ✓");
    }else{
      payload.id=makeId();
      payload.created_at=new Date().toISOString();
      const {data:inserted,error}=await supabase.from("operations").insert([payload]).select("id").single();
      if(error) throw error;
      if(!inserted?.id) throw new Error("لم يتم تأكيد إنشاء البيع");
      showToast("تم حفظ البيع ✓");
    }

    selectedGregorianPeriod=gregorianMonthKey(date);
    resetSale();
    await loadOperations();
    route("home");
  }catch(err){
    console.error("SALE SAVE ERROR",err);
    showToast(`تعذر حفظ البيع${err?.message?": "+err.message:""}`);
  }finally{
    btn.disabled=false;
    if(!$("saleEditingId").value) btn.innerHTML='<svg><use href="#i-check"></use></svg><span>حفظ البيع</span>';
  }
});

$("expenseForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isEditor()) return;

  const date=$("expenseDate").value;
  const amount=parseAmount($("expenseAmount").value);
  const category=selectedExpenseCategory();

  if(!date){ showToast("اختر تاريخ المصروف"); return; }
  if(!Number.isFinite(amount)||amount<=0){ showToast("اكتب مبلغ المصروف بشكل صحيح"); return; }
  if(!category){ showToast("اختر نوع المصروف"); return; }

  const id=$("expenseEditingId").value;
  const payload={
    type:"expense",date,amount,quantity:null,category,
    notes:$("expenseNotes").value.trim(),
    updated_at:new Date().toISOString()
  };

  const btn=$("expenseSaveBtn");
  btn.disabled=true; btn.textContent="جاري الحفظ...";

  try{
if(id){
      const {error}=await supabase.from("operations").update(payload).eq("id",id);
      if(error) throw error;
      showToast("تم تعديل المصروف ✓");
    }else{
      payload.id=makeId();
      payload.created_at=new Date().toISOString();
      const {data:inserted,error}=await supabase.from("operations").insert([payload]).select("id").single();
      if(error) throw error;
      if(!inserted?.id) throw new Error("لم يتم تأكيد إنشاء المصروف");
      showToast("تم حفظ المصروف ✓");
    }

    selectedGregorianPeriod=gregorianMonthKey(date);
    resetExpense();
    await loadOperations();
    route("home");
  }catch(err){
    console.error("EXPENSE SAVE ERROR",err);
    showToast(`تعذر حفظ المصروف${err?.message?": "+err.message:""}`);
  }finally{
    btn.disabled=false;
    if(!$("expenseEditingId").value) btn.innerHTML='<svg><use href="#i-check"></use></svg><span>حفظ المصروف</span>';
  }
});

function beginEdit(op){
  if(op.type==="sale"){
    $("saleEditingId").value=op.id;
    $("saleDate").value=op.date;
    $("saleAmount").value=op.amount;
    $("saleQuantity").value=op.quantity??"";
    $("saleCategory").value=op.category||"";
    $("saleNotes").value=op.notes||"";
    $("saleEditBanner").hidden=false;
    $("salePageTitle").textContent="تعديل عملية بيع";
    $("saleSaveBtn").innerHTML='<svg><use href="#i-edit"></use></svg><span>حفظ التعديل</span>';
    route("sale");
  }else{
    $("expenseEditingId").value=op.id;
    $("expenseDate").value=op.date;
    $("expenseAmount").value=op.amount;
    $("expenseNotes").value=op.notes||"";
    setExpenseCategory(op.category||"أخرى");
    $("expenseEditBanner").hidden=false;
    $("expensePageTitle").textContent="تعديل عملية مصروف";
    $("expenseSaveBtn").innerHTML='<svg><use href="#i-edit"></use></svg><span>حفظ التعديل</span>';
    route("expense");
  }
}

function requestDelete(op){
  pendingDeleteOperation=op;
  const typeLabel=op.type==="sale"?"بيع":"مصروف";
  $("deleteDialogText").textContent=`سيتم حذف عملية ${typeLabel} نهائيًا.`;
  $("deleteDialogSummary").innerHTML=`
    <strong>${moneyMarkup(op.amount)}</strong>
    <span>${esc(shortGregorian(op.date))}</span>
    ${op.category?`<br><span>${esc(op.category)}</span>`:""}
  `;
  $("deleteDialog").showModal();
}

$("cancelDeleteBtn").addEventListener("click",()=>{ pendingDeleteOperation=null; });

$("confirmDeleteBtn").addEventListener("click",async e=>{
  e.preventDefault();
  if(!pendingDeleteOperation) return;
  const op=pendingDeleteOperation;
  const btn=$("confirmDeleteBtn");
  btn.disabled=true; btn.textContent="جاري الحذف...";

  try{
    const {error}=await supabase.from("operations").delete().eq("id",op.id);
    if(error) throw error;
    $("deleteDialog").close();
    pendingDeleteOperation=null;
    showToast("تم حذف العملية ✓");
    await loadOperations();
  }catch(err){
    console.error(err);
    showToast("تعذر حذف العملية");
  }finally{
    btn.disabled=false; btn.textContent="حذف";
  }
});

async function handleAction(e){
  const b=e.target.closest("[data-act]");
  if(!b||!isEditor()) return;
  const op=operations.find(x=>x.id===b.dataset.id);
  if(!op) return;
  if(b.dataset.act==="edit") beginEdit(op);
  if(b.dataset.act==="delete") requestDelete(op);
}

$("operationsBody").addEventListener("click",handleAction);
$("operationsCards").addEventListener("click",handleAction);
$("filterType").addEventListener("change",renderRecords);
$("searchInput").addEventListener("input",renderRecords);

function rankHTML(items,emptyText){
  if(!items.length) return `<div class="empty-mini">${emptyText}</div>`;
  return items.map((op,i)=>`
    <div class="rank-item">
      <span class="rank-num">${i+1}</span>
      <div>
        <strong>${esc(op.category||(op.type==="sale"?"بيع":"مصروف"))}</strong>
        <small>${esc(shortGregorian(op.date))}<br><span dir="ltr">${esc(shortGregorian(op.date))}</span>${op.notes?`<br>${esc(op.notes)}`:""}</small>
      </div>
      <strong>${moneyMarkup(op.amount)}</strong>
    </div>
  `).join("");
}

function renderFinance(){
  if(!currentProfile) return;

  const list=periodOperations();
  const s=getStats(list);

  setMoney("finSales",s.sales);
  setMoney("finExpenses",s.expenses);
  setMoney("finNet",s.net);
  setMoney("finAvgSale",s.salesOps.length?s.sales/s.salesOps.length:0);
  setMoney("finAvgExpense",s.expOps.length?s.expenses/s.expOps.length:0);
  $("finExpenseRatio").textContent=`${s.sales?((s.expenses/s.sales)*100).toFixed(1):"0.0"}%`;

  let labels=[],salesData=[],expData=[];

  if(selectedGregorianPeriod){
    $("mainChartTitle").textContent=`الحركة اليومية — ${gregorianPeriodLabel(selectedGregorianPeriod)}`;

    const dayMap={};
    list.forEach(op=>{
      const day=Number(String(op.date||"").slice(8,10));
      if(!day) return;
      dayMap[day] ||= {sale:0,expense:0};
      dayMap[day][op.type]+=Number(op.amount||0);
    });

    const [year,month]=selectedGregorianPeriod.split("-").map(Number);
    const maxDay=new Date(year,month,0).getDate();
    labels=Array.from({length:maxDay},(_,i)=>String(i+1));
    salesData=labels.map(d=>dayMap[Number(d)]?.sale||0);
    expData=labels.map(d=>dayMap[Number(d)]?.expense||0);
  }else{
    $("mainChartTitle").textContent="الحركة الشهرية — من البداية";

    const monthMap={};
    operations.forEach(op=>{
      const key=gregorianMonthKey(op.date);
      if(!key) return;
      monthMap[key] ||= {sale:0,expense:0,label:gregorianPeriodLabel(key)};
      monthMap[key][op.type]+=Number(op.amount||0);
    });

    const keys=Object.keys(monthMap).sort();
    labels=keys.map(k=>monthMap[k].label);
    salesData=keys.map(k=>monthMap[k].sale);
    expData=keys.map(k=>monthMap[k].expense);
  }

  if(monthlyChart) monthlyChart.destroy();
  monthlyChart=new Chart($("monthlyChart"),{
    type:"bar",
    data:{
      labels,
      datasets:[
        {label:"المبيعات",data:salesData,backgroundColor:"rgba(23,132,90,.72)",borderColor:"#17845a",borderWidth:1,borderRadius:5},
        {label:"المصروفات",data:expData,backgroundColor:"rgba(223,123,52,.72)",borderColor:"#df7b34",borderWidth:1,borderRadius:5}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}},scales:{y:{beginAtZero:true}}}
  });

  if(mixChart) mixChart.destroy();
  mixChart=new Chart($("mixChart"),{
    type:"doughnut",
    data:{labels:["المبيعات","المصروفات"],datasets:[{data:[s.sales,s.expenses],backgroundColor:["#27a46f","#e58a47"],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"66%",plugins:{legend:{position:"bottom"}}}
  });

  $("topSales").innerHTML=rankHTML([...s.salesOps].sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5),"لا توجد عمليات بيع في هذه الفترة.");
  $("topExpenses").innerHTML=rankHTML([...s.expOps].sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5),"لا توجد مصروفات في هذه الفترة.");
}

/* backup remains admin-only */
$("exportBtn").addEventListener("click",async()=>{
  if(!isAdmin()) return;
  const {data,error}=await supabase.from("operations").select("*").order("date",{ascending:true}).order("created_at",{ascending:true});
  if(error){showToast("تعذر إنشاء النسخة");return;}
  const backup={version:1,exported_at:new Date().toISOString(),operations:data||[]};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`bird-backup-${todayISO()}.json`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  showToast("تم تنزيل النسخة ✓");
});

$("importFile").addEventListener("change",async()=>{
  if(!isAdmin()) return;
  const file=$("importFile").files?.[0];
  $("importFile").value="";
  if(!file) return;
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed?.version!==1||!Array.isArray(parsed.operations)) throw new Error("INVALID");
    pendingBackup=parsed;
    $("restoreSummary").textContent=`عدد العمليات: ${parsed.operations.length}`;
    $("restoreDialog").showModal();
  }catch{
    showToast("ملف النسخة غير صالح");
  }
});

$("confirmRestoreBtn").addEventListener("click",async e=>{
  if(!isAdmin()||!pendingBackup) return;
  e.preventDefault();
  const b=$("confirmRestoreBtn");
  b.disabled=true;b.textContent="جاري الاستعادة...";
  try{
    const {data,error}=await supabase.rpc("restore_operations",{p_backup:pendingBackup});
    if(error) throw error;
    $("restoreDialog").close();
    pendingBackup=null;
    showToast(`تمت الاستعادة (${data} عملية)`);
    await loadOperations();
    route("home");
  }catch(err){
    console.error(err);showToast("فشلت الاستعادة");
  }finally{
    b.disabled=false;b.textContent="استعادة الآن";
  }
});

/* auth */
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("loginError").hidden=true;
  const b=$("loginBtn");
  b.disabled=true;b.textContent="جاري الدخول...";

  try{
    const username=$("username").value.trim().toLowerCase();
    const email=LOGIN_EMAILS[username];
    if(!email) throw new Error("INVALID_USER");

    const {data,error}=await supabase.auth.signInWithPassword({email,password:$("password").value});
    if(error) throw error;
    await enter(data.session);
  }catch(err){
    console.error(err);
    $("loginError").textContent="اسم المستخدم أو كلمة المرور غير صحيحة.";
    $("loginError").hidden=false;
  }finally{
    b.disabled=false;b.innerHTML='دخول <span>←</span>';
  }
});

$("logoutBtn").addEventListener("click",async()=>{await supabase.auth.signOut();leave();});

async function enter(session){
  currentUser=session.user;
  await loadProfile();

  $("authView").hidden=true;
  $("appView").hidden=false;

  document.querySelectorAll(".editor-only").forEach(x=>x.hidden=!isEditor());
  document.querySelectorAll(".admin-only").forEach(x=>x.hidden=!isAdmin());

  $("accountName").textContent=currentProfile.username;
  $("accountRole").textContent=isEditor()?"تسجيل وتعديل":"متابعة وإدارة";
  $("welcomeTitle").textContent=isEditor()?"حيّاك الله 👋":"أهلاً يا Emad 👋";
  $("welcomeText").textContent=isEditor()
    ?"الإحصائيات الآن معتمدة على الشهر الميلادي."
    :"تابع الوضع المالي حسب الأشهر الميلادية والنسخ الاحتياطية.";

  resetSale();
  resetExpense();
  initializeCurrentGregorianPeriod();
  await loadOperations();
  route("home");
}

function leave(){
  currentUser=null;currentProfile=null;operations=[];
  $("appView").hidden=true;$("authView").hidden=false;$("loginForm").reset();
}

(async function init(){
  $("saleDate").value=todayISO();
  $("expenseDate").value=todayISO();

  const {data:{session}}=await supabase.auth.getSession();
  if(session){
    try{await enter(session);}
    catch(err){console.error(err);await supabase.auth.signOut();leave();}
  }else leave();
})();
