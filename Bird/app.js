
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://htnzusdfrltzwzpaxzyh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_y6-fjFPlv0nW8cV5r-2lPg_BlBl2IPr";

const LOGIN_EMAILS = {
  s: "s@bird.local",
  emad: "admin@bird.local"
};

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

const $ = (id) => document.getElementById(id);

const authView = $("authView");
const appView = $("appView");
const loginForm = $("loginForm");
const loginBtn = $("loginBtn");
const loginError = $("loginError");
const logoutBtn = $("logoutBtn");
const editorPanel = $("editorPanel");
const adminPanel = $("adminPanel");
const operationForm = $("operationForm");
const cancelEditBtn = $("cancelEditBtn");
const operationsBody = $("operationsBody");
const operationsTable = $("operationsTable");
const loadingState = $("loadingState");
const emptyState = $("emptyState");
const filterType = $("filterType");
const searchInput = $("searchInput");
const actionsHead = $("actionsHead");
const exportBtn = $("exportBtn");
const importFile = $("importFile");
const restoreDialog = $("restoreDialog");
const confirmRestoreBtn = $("confirmRestoreBtn");
const restoreSummary = $("restoreSummary");

let currentUser = null;
let currentProfile = null;
let operations = [];
let pendingBackup = null;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.hidden = true, 3000);
}

function formatMoney(value) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function isEditor() {
  return currentProfile?.role === "editor";
}

function isAdminViewer() {
  return currentProfile?.role === "viewer_admin";
}

function resetForm() {
  $("editingId").value = "";
  $("type").value = "sale";
  $("date").value = todayISO();
  $("amount").value = "";
  $("quantity").value = "";
  $("category").value = "";
  $("notes").value = "";
  $("saveBtn").textContent = "حفظ العملية";
  cancelEditBtn.hidden = true;
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", currentUser.id)
    .single();

  if (error) throw error;
  currentProfile = data;
}

async function loadOperations() {
  loadingState.hidden = false;
  emptyState.hidden = true;
  operationsTable.hidden = true;

  const { data, error } = await supabase
    .from("operations")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  loadingState.hidden = true;

  if (error) {
    showToast("تعذر تحميل البيانات");
    throw error;
  }

  operations = data || [];
  render();
}

function renderStats() {
  const sales = operations.filter(x => x.type === "sale").reduce((s,x) => s + Number(x.amount || 0), 0);
  const expenses = operations.filter(x => x.type === "expense").reduce((s,x) => s + Number(x.amount || 0), 0);
  $("salesTotal").textContent = formatMoney(sales);
  $("expensesTotal").textContent = formatMoney(expenses);
  $("netTotal").textContent = formatMoney(sales - expenses);
  $("operationsCount").textContent = operations.length.toLocaleString("ar-SA");
}

function filteredOperations() {
  const type = filterType.value;
  const q = searchInput.value.trim().toLowerCase();

  return operations.filter(op => {
    const typeOk = type === "all" || op.type === type;
    const haystack = `${op.category || ""} ${op.notes || ""}`.toLowerCase();
    return typeOk && (!q || haystack.includes(q));
  });
}

function renderTable() {
  const rows = filteredOperations();
  actionsHead.hidden = !isEditor();

  if (!rows.length) {
    operationsTable.hidden = true;
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  operationsTable.hidden = false;

  operationsBody.innerHTML = rows.map(op => `
    <tr>
      <td>${escapeHtml(op.date)}</td>
      <td><span class="badge ${op.type}">${op.type === "sale" ? "بيع" : "مصروف"}</span></td>
      <td>${escapeHtml(formatMoney(op.amount))}</td>
      <td>${op.quantity ?? "—"}</td>
      <td>${escapeHtml(op.category || "—")}</td>
      <td>${escapeHtml(op.notes || "—")}</td>
      ${isEditor() ? `
      <td>
        <div class="row-actions">
          <button class="ghost" data-action="edit" data-id="${escapeHtml(op.id)}">تعديل</button>
          <button class="danger" data-action="delete" data-id="${escapeHtml(op.id)}">حذف</button>
        </div>
      </td>` : ""}
    </tr>
  `).join("");
}

function render() {
  renderStats();
  renderTable();
}

async function enterApp(session) {
  currentUser = session.user;
  await loadProfile();

  authView.hidden = true;
  appView.hidden = false;

  editorPanel.hidden = !isEditor();
  adminPanel.hidden = !isAdminViewer();

  $("accountLabel").textContent = isEditor()
    ? `المستخدم: ${currentProfile.username} — تسجيل وتعديل`
    : `المستخدم: ${currentProfile.username} — متابعة وإدارة النسخ الاحتياطية`;

  resetForm();
  await loadOperations();
}

async function leaveApp() {
  currentUser = null;
  currentProfile = null;
  operations = [];
  appView.hidden = true;
  authView.hidden = false;
  loginForm.reset();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "جاري الدخول…";

  try {
    const username = $("username").value.trim().toLowerCase();
    const email = LOGIN_EMAILS[username];

    if (!email) {
      throw new Error("اسم المستخدم غير صحيح");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: $("password").value
    });

    if (error) throw error;
    await enterApp(data.session);
  } catch (err) {
    console.error(err);
    loginError.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "دخول";
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await leaveApp();
});

operationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isEditor()) return;

  const id = $("editingId").value;
  const payload = {
    type: $("type").value,
    date: $("date").value,
    amount: Number($("amount").value),
    quantity: $("quantity").value === "" ? null : Number($("quantity").value),
    category: $("category").value.trim(),
    notes: $("notes").value.trim(),
    updated_at: new Date().toISOString()
  };

  try {
    if (id) {
      const { error } = await supabase
        .from("operations")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      showToast("تم تعديل العملية");
    } else {
      payload.id = crypto.randomUUID();
      payload.created_at = new Date().toISOString();
      const { error } = await supabase
        .from("operations")
        .insert(payload);
      if (error) throw error;
      showToast("تمت إضافة العملية");
    }

    resetForm();
    await loadOperations();
  } catch (err) {
    console.error(err);
    showToast("تعذر حفظ العملية");
  }
});

cancelEditBtn.addEventListener("click", resetForm);

operationsBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || !isEditor()) return;

  const op = operations.find(x => x.id === btn.dataset.id);
  if (!op) return;

  if (btn.dataset.action === "edit") {
    $("editingId").value = op.id;
    $("type").value = op.type;
    $("date").value = op.date;
    $("amount").value = op.amount;
    $("quantity").value = op.quantity ?? "";
    $("category").value = op.category || "";
    $("notes").value = op.notes || "";
    $("saveBtn").textContent = "حفظ التعديل";
    cancelEditBtn.hidden = false;
    editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (btn.dataset.action === "delete") {
    if (!confirm("حذف هذه العملية نهائيًا؟")) return;

    const { error } = await supabase
      .from("operations")
      .delete()
      .eq("id", op.id);

    if (error) {
      console.error(error);
      showToast("تعذر حذف العملية");
      return;
    }

    showToast("تم حذف العملية");
    await loadOperations();
  }
});

filterType.addEventListener("change", renderTable);
searchInput.addEventListener("input", renderTable);

exportBtn.addEventListener("click", async () => {
  if (!isAdminViewer()) return;

  try {
    const { data, error } = await supabase
      .from("operations")
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      operations: data || []
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bird-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast("تم تنزيل النسخة الاحتياطية");
  } catch (err) {
    console.error(err);
    showToast("تعذر إنشاء النسخة الاحتياطية");
  }
});

importFile.addEventListener("change", async () => {
  if (!isAdminViewer()) return;

  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (
      parsed?.version !== 1 ||
      !Array.isArray(parsed?.operations)
    ) {
      throw new Error("INVALID_BACKUP");
    }

    pendingBackup = parsed;
    restoreSummary.textContent = `عدد العمليات في النسخة: ${parsed.operations.length}`;
    restoreDialog.showModal();
  } catch (err) {
    console.error(err);
    showToast("ملف النسخة الاحتياطية غير صالح");
  }
});

confirmRestoreBtn.addEventListener("click", async (e) => {
  if (!isAdminViewer() || !pendingBackup) return;
  e.preventDefault();

  confirmRestoreBtn.disabled = true;
  confirmRestoreBtn.textContent = "جاري الاستعادة…";

  try {
    const { data, error } = await supabase.rpc("restore_operations", {
      p_backup: pendingBackup
    });

    if (error) throw error;

    restoreDialog.close();
    pendingBackup = null;
    showToast(`تمت الاستعادة بنجاح (${data} عملية)`);
    await loadOperations();
  } catch (err) {
    console.error(err);
    showToast("فشلت الاستعادة. تأكد من أن الملف صحيح.");
  } finally {
    confirmRestoreBtn.disabled = false;
    confirmRestoreBtn.textContent = "استعادة الآن";
  }
});

(async function init() {
  $("date").value = todayISO();

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    try {
      await enterApp(session);
    } catch (err) {
      console.error(err);
      await supabase.auth.signOut();
      await leaveApp();
    }
  } else {
    await leaveApp();
  }
})();
