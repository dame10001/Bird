"use strict";

// =============================
// الإعدادات والحالة العامة
// =============================
const STORAGE_KEY = "pigeonProjectOperations_v1";
const DEFAULT_PAGE = "home";

const state = {
  operations: loadOperations(),
  selectedMonth: startOfMonth(new Date()),
  activePage: DEFAULT_PAGE,
  selectedOperationId: null,
  dailyChart: null,
  expenseChart: null,
  toastTimer: null,
  librariesPromise: null,
};

const refs = {};

// ألوان ثابتة وواضحة للرسوم البيانية.
const chartColors = {
  revenue: "#1f6f5f",
  revenueSoft: "rgba(31, 111, 95, 0.16)",
  expense: "#b65f3c",
  expenseSoft: "rgba(182, 95, 60, 0.16)",
  categories: ["#1f6f5f", "#5b7fa3", "#c7954c", "#a86782", "#7c6ca8"],
};

// =============================
// بدء التطبيق
// =============================
document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  cacheElements();
  bindEvents();
  setDefaultFormDates();
  updateHijriDateDisplays();
  renderApp();
  loadOptionalLibraries();
}


// تحميل المكتبات الخفيفة دون تعطيل تشغيل التطبيق الأساسي.
function loadOptionalLibraries() {
  if (state.librariesPromise) return state.librariesPromise;

  state.librariesPromise = Promise.all([
    loadExternalScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js", "Chart"),
  ]).then(() => {
    if (state.activePage === "stats") renderCharts();
    return true;
  }).catch((error) => {
    console.warn("Optional libraries could not be loaded:", error);
    state.librariesPromise = null;
    return false;
  });

  return state.librariesPromise;
}

function loadExternalScript(source, globalName) {
  if (window[globalName]) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-library="${globalName}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.dataset.library = globalName;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${globalName}`));
    document.head.appendChild(script);
  });
}

function cacheElements() {
  refs.pages = [...document.querySelectorAll(".page")];
  refs.navItems = [...document.querySelectorAll(".nav-item")];
  refs.goButtons = [...document.querySelectorAll("[data-go]")];

  refs.monthName = document.getElementById("monthName");
  refs.monthYear = document.getElementById("monthYear");
  refs.previousMonthBtn = document.getElementById("previousMonthBtn");
  refs.nextMonthBtn = document.getElementById("nextMonthBtn");
  refs.currentMonthBtn = document.getElementById("currentMonthBtn");

  refs.homeSummary = document.getElementById("homeSummary");
  refs.statsSummary = document.getElementById("statsSummary");
  refs.recentOperations = document.getElementById("recentOperations");
  refs.allOperations = document.getElementById("allOperations");
  refs.recordCount = document.getElementById("recordCount");

  refs.saleForm = document.getElementById("saleForm");
  refs.saleDate = document.getElementById("saleDate");
  refs.saleDateDisplay = document.getElementById("saleDateDisplay");
  refs.saleQuantity = document.getElementById("saleQuantity");
  refs.salePairsHint = document.getElementById("salePairsHint");
  refs.saleAmount = document.getElementById("saleAmount");
  refs.saleNotes = document.getElementById("saleNotes");
  refs.saleHijriDate = document.getElementById("saleHijriDate");

  refs.expenseForm = document.getElementById("expenseForm");
  refs.expenseDate = document.getElementById("expenseDate");
  refs.expenseDateDisplay = document.getElementById("expenseDateDisplay");
  refs.expenseAmount = document.getElementById("expenseAmount");
  refs.expenseNotes = document.getElementById("expenseNotes");
  refs.expenseHijriDate = document.getElementById("expenseHijriDate");
  refs.expenseCategories = document.getElementById("expenseCategories");

  refs.dailyChartCanvas = document.getElementById("dailyChart");
  refs.expenseChartCanvas = document.getElementById("expenseChart");
  refs.expenseLegend = document.getElementById("expenseLegend");

  refs.operationSheet = document.getElementById("operationSheet");
  refs.operationDetails = document.getElementById("operationDetails");
  refs.editOperationBtn = document.getElementById("editOperationBtn");
  refs.deleteOperationBtn = document.getElementById("deleteOperationBtn");

  refs.editModal = document.getElementById("editModal");
  refs.editForm = document.getElementById("editForm");
  refs.confirmModal = document.getElementById("confirmModal");
  refs.confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  refs.toast = document.getElementById("toast");
}

function bindEvents() {
  refs.navItems.forEach((button) => {
    button.addEventListener("click", () => navigateTo(button.dataset.page));
  });

  refs.goButtons.forEach((button) => {
    button.addEventListener("click", () => navigateTo(button.dataset.go));
  });

  refs.previousMonthBtn.addEventListener("click", () => changeMonth(-1));
  refs.nextMonthBtn.addEventListener("click", () => changeMonth(1));
  refs.currentMonthBtn.addEventListener("click", goToCurrentMonth);

  refs.saleDate.addEventListener("change", handleNativeDateChange);
  refs.saleDate.addEventListener("input", handleNativeDateChange);
  refs.saleQuantity.addEventListener("input", updateSalePairsHint);
  refs.expenseDate.addEventListener("change", handleNativeDateChange);
  refs.expenseDate.addEventListener("input", handleNativeDateChange);

  refs.saleForm.addEventListener("submit", handleSaleSubmit);
  refs.expenseForm.addEventListener("submit", handleExpenseSubmit);

  refs.expenseCategories.addEventListener("change", handleCategorySelection);

  refs.recentOperations.addEventListener("click", handleOperationClick);
  refs.allOperations.addEventListener("click", handleOperationClick);

  refs.operationSheet.addEventListener("click", handleSheetClose);
  refs.editModal.addEventListener("click", handleEditClose);
  refs.confirmModal.addEventListener("click", handleConfirmClose);

  refs.editOperationBtn.addEventListener("click", openEditModal);
  refs.deleteOperationBtn.addEventListener("click", openDeleteConfirmation);
  refs.confirmDeleteBtn.addEventListener("click", deleteSelectedOperation);
  refs.editForm.addEventListener("submit", handleEditSubmit);
  refs.editForm.addEventListener("change", handleEditFormChange);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllModals();
  });
}

// =============================
// التنقل والشهور
// =============================
function navigateTo(pageName) {
  state.activePage = pageName;

  refs.pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageName);
  });

  refs.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });

  if (pageName === "stats") {
    requestAnimationFrame(renderCharts);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function changeMonth(offset) {
  state.selectedMonth = new Date(
    state.selectedMonth.getFullYear(),
    state.selectedMonth.getMonth() + offset,
    1
  );
  renderApp();
}

function goToCurrentMonth() {
  state.selectedMonth = startOfMonth(new Date());
  renderApp();
  showToast("تم الرجوع إلى الشهر الحالي");
}

// =============================
// إضافة العمليات
// =============================
function handleSaleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.saleForm);
  const date = normalizeDateInput(formData.get("date"));
  const quantity = Number(formData.get("quantity"));
  const amount = Number(formData.get("amount"));
  const notes = String(formData.get("notes") || "").trim();

  if (!isValidDate(date) || !Number.isFinite(quantity) || quantity < 1 || !isPositiveAmount(amount)) {
    showToast("تحقق من التاريخ والعدد وقيمة البيع", "error");
    focusFirstInvalid(refs.saleForm);
    return;
  }

  const operation = {
    id: createId(),
    type: "sale",
    date,
    amount: roundMoney(amount),
    quantity: Math.floor(quantity),
    category: "",
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };

  state.operations.push(operation);
  saveOperations();
  state.selectedMonth = startOfMonth(parseLocalDate(date));

  refs.saleForm.reset();
  refs.saleDate.value = toISODateValue(new Date());
  syncMainDateDisplays();
  updateHijriDateDisplays();
  updateSalePairsHint();
  renderApp();
  navigateTo("home");
  showToast("تم حفظ عملية البيع بنجاح");
}

function handleExpenseSubmit(event) {
  event.preventDefault();

  const formData = new FormData(refs.expenseForm);
  const date = normalizeDateInput(formData.get("date"));
  const amount = Number(formData.get("amount"));
  const category = formData.get("category");
  const notes = String(formData.get("notes") || "").trim();

  if (!isValidDate(date) || !isPositiveAmount(amount) || !category) {
    showToast("تحقق من نوع المصروف والمبلغ والتاريخ", "error");
    focusFirstInvalid(refs.expenseForm);
    return;
  }

  const operation = {
    id: createId(),
    type: "expense",
    date,
    amount: roundMoney(amount),
    quantity: null,
    category,
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };

  state.operations.push(operation);
  saveOperations();
  state.selectedMonth = startOfMonth(parseLocalDate(date));

  refs.expenseForm.reset();
  refs.expenseDate.value = toISODateValue(new Date());
  syncMainDateDisplays();
  refs.expenseForm.querySelector('input[name="category"][value="أعلاف"]').checked = true;
  syncExpenseCategoryCards();
  updateHijriDateDisplays();
  renderApp();
  navigateTo("home");
  showToast("تم حفظ المصروف بنجاح");
}

function handleCategorySelection() {
  syncExpenseCategoryCards();
}

function syncExpenseCategoryCards() {
  refs.expenseCategories.querySelectorAll(".category-card").forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("selected", input.checked);
  });
}

function updateSalePairsHint() {
  if (!refs.salePairsHint || !refs.saleQuantity) return;
  const quantity = Math.max(0, Number(refs.saleQuantity.value) || 0);
  refs.salePairsHint.textContent = quantity > 0
    ? `${formatNumber(quantity)} حمامة = ${formatNumber(quantity / 2)} جوز`
    : "كل جوز يساوي حمامتين";
}

// =============================
// عرض البيانات
// =============================
function renderApp() {
  renderMonthHeader();

  const monthOperations = getSelectedMonthOperations();
  const totals = calculateTotals(monthOperations);

  renderSummary(refs.homeSummary, totals);
  renderSummary(refs.statsSummary, totals);
  renderOperations(refs.recentOperations, monthOperations.slice(0, 5), true);
  renderOperations(refs.allOperations, monthOperations, false);
  renderRecordCount(monthOperations.length);

  if (state.activePage === "stats") {
    requestAnimationFrame(renderCharts);
  }
}

function renderMonthHeader() {
  refs.monthName.textContent = new Intl.DateTimeFormat("ar-SA", {
    month: "long",
  }).format(state.selectedMonth);

  refs.monthYear.textContent = new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
  }).format(state.selectedMonth);
}

function renderSummary(container, totals) {
  const profitClass = totals.profit < 0 ? "negative" : "";

  container.innerHTML = `
    ${summaryCardTemplate("الإيرادات", totals.revenue, "sale", "fa-arrow-trend-up")}
    ${summaryCardTemplate("المصروفات", totals.expenses, "expense", "fa-arrow-trend-down")}
    ${summaryCardTemplate("صافي الربح", totals.profit, `profit ${profitClass}`, "fa-scale-balanced")}
    ${pigeonSummaryCardTemplate(totals.pigeons)}
  `;
}

function summaryCardTemplate(label, value, className, icon) {
  return `
    <article class="summary-card ${className}">
      <div class="summary-card-head">
        <span class="summary-card-label">${label}</span>
        <span class="summary-card-icon"><i class="fa-solid ${icon}"></i></span>
      </div>
      <div class="summary-card-value">
        <strong>${formatNumber(value)}</strong>
        <span>ر.س</span>
      </div>
    </article>
  `;
}

function pigeonSummaryCardTemplate(quantity) {
  const pigeons = Math.max(0, Number(quantity) || 0);
  const pairs = pigeons / 2;
  return `
    <article class="summary-card pigeons">
      <div class="summary-card-head">
        <span class="summary-card-label">الحمام المباع</span>
        <span class="summary-card-icon"><i class="fa-solid fa-dove"></i></span>
      </div>
      <div class="summary-card-value pigeon-value">
        <strong>${formatNumber(pigeons)}</strong>
        <span>حمامة</span>
      </div>
      <div class="summary-card-note">يعادل ${formatNumber(pairs)} جوز</div>
    </article>
  `;
}

function renderOperations(container, operations, compact) {
  if (!operations.length) {
    container.innerHTML = emptyStateTemplate();
    return;
  }

  container.innerHTML = operations
    .map((operation) => operationItemTemplate(operation, compact))
    .join("");
}

function operationItemTemplate(operation, compact) {
  const isSale = operation.type === "sale";
  const title = isSale
    ? `بيع${operation.quantity ? ` · ${formatNumber(operation.quantity)} حمامة` : ""}`
    : operation.category || "مصروف";
  const notes = operation.notes ? escapeHtml(operation.notes) : "بدون ملاحظات";
  const meta = compact
    ? `${formatGregorianDate(operation.date)} · ${notes}`
    : `${formatGregorianDate(operation.date)} · ${formatHijriDate(operation.date)}${operation.notes ? ` · ${notes}` : ""}`;

  return `
    <button class="operation-item ${operation.type}" type="button" data-operation-id="${operation.id}" aria-label="عرض تفاصيل ${isSale ? "البيع" : "المصروف"}">
      <span class="operation-icon"><i class="fa-solid ${isSale ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i></span>
      <span class="operation-main">
        <span class="operation-title">${escapeHtml(title)}</span>
        <span class="operation-meta">${meta}</span>
      </span>
      <span class="operation-amount">${isSale ? "+" : "-"}${formatNumber(operation.amount)} ر.س</span>
    </button>
  `;
}

function emptyStateTemplate() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>
      <h3>لا توجد عمليات في هذا الشهر</h3>
      <p>ابدأ بتسجيل بيع أو مصروف جديد.</p>
    </div>
  `;
}

function renderRecordCount(count) {
  const label = count === 0 ? "لا توجد عمليات" : count === 1 ? "عملية واحدة" : `${formatNumber(count)} عمليات`;
  refs.recordCount.textContent = label;
}

// =============================
// تفاصيل العملية والتعديل والحذف
// =============================
function handleOperationClick(event) {
  const item = event.target.closest("[data-operation-id]");
  if (!item) return;

  state.selectedOperationId = item.dataset.operationId;
  openOperationSheet();
}

function openOperationSheet() {
  const operation = getSelectedOperation();
  if (!operation) return;

  refs.operationDetails.innerHTML = operationDetailsTemplate(operation);
  openModal(refs.operationSheet);
}

function operationDetailsTemplate(operation) {
  const isSale = operation.type === "sale";
  const title = isSale ? "عملية بيع" : `مصروف - ${operation.category}`;
  const extraRows = isSale
    ? `
      <div class="detail-row"><span>العدد</span><strong>${formatNumber(operation.quantity || 0)} حمامة</strong></div>
      <div class="detail-row"><span>بالجوز</span><strong>${formatNumber((operation.quantity || 0) / 2)} جوز</strong></div>
    `
    : `<div class="detail-row"><span>نوع المصروف</span><strong>${escapeHtml(operation.category || "—")}</strong></div>`;

  return `
    <div class="operation-details-header">
      <span class="operation-icon ${operation.type}"><i class="fa-solid ${isSale ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i></span>
      <div>
        <h2 id="operationSheetTitle">${escapeHtml(title)}</h2>
        <p>${formatGregorianDate(operation.date)}</p>
      </div>
    </div>

    <div class="detail-amount ${operation.type}">
      <span>${isSale ? "قيمة البيع" : "قيمة المصروف"}</span>
      <strong>${formatNumber(operation.amount)} ر.س</strong>
    </div>

    <div class="details-list">
      <div class="detail-row"><span>التاريخ الميلادي</span><strong>${formatGregorianDate(operation.date)}</strong></div>
      <div class="detail-row"><span>تاريخ أم القرى</span><strong>${formatHijriDate(operation.date)}</strong></div>
      ${extraRows}
      <div class="detail-row"><span>الملاحظات</span><strong>${escapeHtml(operation.notes || "لا توجد ملاحظات")}</strong></div>
    </div>
  `;
}

function openEditModal() {
  const operation = getSelectedOperation();
  if (!operation) return;

  closeModal(refs.operationSheet);
  refs.editForm.innerHTML = editFormTemplate(operation);
  openModal(refs.editModal);
}

function editFormTemplate(operation) {
  const isSale = operation.type === "sale";

  if (isSale) {
    return `
      <div class="form-grid two-columns">
        <div class="field-group"><label for="editDate">التاريخ</label><input id="editDate" class="compact-date-input" name="date" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="2026/7/31" value="${formatDateInputDisplay(operation.date)}" required></div>
        <div class="field-group"><label for="editQuantity">العدد</label><input id="editQuantity" name="quantity" type="number" min="1" step="1" value="${operation.quantity || 1}" required></div>
      </div>
      <div class="field-group"><label for="editAmount">قيمة البيع</label><div class="input-with-suffix"><input id="editAmount" name="amount" type="number" min="0.01" step="0.01" value="${operation.amount}" required><span>ر.س</span></div></div>
      <div class="field-group"><label for="editNotes">الملاحظات</label><textarea id="editNotes" name="notes" rows="4">${escapeHtml(operation.notes || "")}</textarea></div>
      <div class="hijri-inline"><i class="fa-regular fa-moon"></i><span>التاريخ الهجري:</span><strong data-edit-hijri>${formatHijriDate(operation.date)}</strong></div>
      <button class="save-button" type="submit"><i class="fa-solid fa-check"></i> حفظ التعديلات</button>
    `;
  }

  const categories = ["أعلاف", "علاج", "شبوك", "قيمة الذبح", "أخرى"];
  return `
    <div class="field-group"><label for="editDate">التاريخ</label><input id="editDate" class="compact-date-input" name="date" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="2026/7/31" value="${formatDateInputDisplay(operation.date)}" required></div>
    <div class="field-group"><label for="editCategory">نوع المصروف</label>
      <select id="editCategory" name="category" class="native-select" required>
        ${categories.map((category) => `<option value="${category}" ${operation.category === category ? "selected" : ""}>${category}</option>`).join("")}
      </select>
    </div>
    <div class="field-group"><label for="editAmount">المبلغ</label><div class="input-with-suffix"><input id="editAmount" name="amount" type="number" min="0.01" step="0.01" value="${operation.amount}" required><span>ر.س</span></div></div>
    <div class="field-group"><label for="editNotes">الملاحظات</label><textarea id="editNotes" name="notes" rows="4">${escapeHtml(operation.notes || "")}</textarea></div>
    <div class="hijri-inline"><i class="fa-regular fa-moon"></i><span>التاريخ الهجري:</span><strong data-edit-hijri>${formatHijriDate(operation.date)}</strong></div>
    <button class="save-button expense-save" type="submit"><i class="fa-solid fa-check"></i> حفظ التعديلات</button>
  `;
}

function handleEditFormChange(event) {
  if (event.target.name !== "date") return;
  const hijriTarget = refs.editForm.querySelector("[data-edit-hijri]");
  const normalizedDate = normalizeDateInput(event.target.value);
  if (hijriTarget) {
    hijriTarget.textContent = normalizedDate ? formatHijriDate(normalizedDate) : "—";
  }
}

function handleEditSubmit(event) {
  event.preventDefault();

  const operation = getSelectedOperation();
  if (!operation) return;

  const formData = new FormData(refs.editForm);
  const date = normalizeDateInput(formData.get("date"));
  const amount = Number(formData.get("amount"));
  const notes = String(formData.get("notes") || "").trim();

  if (!isValidDate(date) || !isPositiveAmount(amount)) {
    showToast("تحقق من التاريخ والمبلغ", "error");
    return;
  }

  operation.date = date;
  operation.amount = roundMoney(amount);
  operation.notes = notes;
  operation.updatedAt = new Date().toISOString();

  if (operation.type === "sale") {
    const quantity = Number(formData.get("quantity"));
    if (!Number.isFinite(quantity) || quantity < 1) {
      showToast("أدخل عددًا صحيحًا أكبر من صفر", "error");
      return;
    }
    operation.quantity = Math.floor(quantity);
  } else {
    operation.category = formData.get("category") || "أخرى";
  }

  saveOperations();
  state.selectedMonth = startOfMonth(parseLocalDate(date));
  closeModal(refs.editModal);
  renderApp();
  showToast("تم تعديل العملية بنجاح");
}

function openDeleteConfirmation() {
  closeModal(refs.operationSheet);
  openModal(refs.confirmModal);
}

function deleteSelectedOperation() {
  const index = state.operations.findIndex((operation) => operation.id === state.selectedOperationId);
  if (index === -1) return;

  state.operations.splice(index, 1);
  saveOperations();
  state.selectedOperationId = null;
  closeModal(refs.confirmModal);
  renderApp();
  showToast("تم حذف العملية");
}

function handleSheetClose(event) {
  if (event.target.matches("[data-close-modal], [data-close-modal] *")) {
    closeModal(refs.operationSheet);
  }
}

function handleEditClose(event) {
  if (event.target.matches("[data-close-edit], [data-close-edit] *")) {
    closeModal(refs.editModal);
  }
}

function handleConfirmClose(event) {
  if (event.target.matches("[data-close-confirm], [data-close-confirm] *")) {
    closeModal(refs.confirmModal);
  }
}

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");

  if (![refs.operationSheet, refs.editModal, refs.confirmModal].some((item) => item.classList.contains("open"))) {
    document.body.style.overflow = "";
  }
}

function closeAllModals() {
  [refs.operationSheet, refs.editModal, refs.confirmModal].forEach(closeModal);
}

function getSelectedOperation() {
  return state.operations.find((operation) => operation.id === state.selectedOperationId);
}

// =============================
// الرسوم البيانية
// =============================
function renderCharts() {
  if (!window.Chart || !refs.dailyChartCanvas || !refs.expenseChartCanvas) return;

  const operations = getSelectedMonthOperations();
  renderDailyChart(operations);
  renderExpenseChart(operations);
}

function renderDailyChart(operations) {
  if (state.dailyChart) state.dailyChart.destroy();

  const year = state.selectedMonth.getFullYear();
  const month = state.selectedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
  const revenueData = Array(daysInMonth).fill(0);
  const expenseData = Array(daysInMonth).fill(0);

  operations.forEach((operation) => {
    const dayIndex = parseLocalDate(operation.date).getDate() - 1;
    if (operation.type === "sale") revenueData[dayIndex] += operation.amount;
    if (operation.type === "expense") expenseData[dayIndex] += operation.amount;
  });

  state.dailyChart = new Chart(refs.dailyChartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "الإيرادات",
          data: revenueData,
          backgroundColor: chartColors.revenueSoft,
          borderColor: chartColors.revenue,
          borderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
        },
        {
          label: "المصروفات",
          data: expenseData,
          backgroundColor: chartColors.expenseSoft,
          borderColor: chartColors.expense,
          borderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          rtl: true,
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 9,
            padding: 18,
            font: { family: '"Segoe UI", Tahoma, Arial', size: 12 },
          },
        },
        tooltip: {
          rtl: true,
          textDirection: "rtl",
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${formatNumber(context.raw)} ر.س`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 12, font: { size: 11 } },
          title: { display: true, text: "اليوم", font: { size: 11, weight: "bold" } },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(120, 120, 128, 0.12)" },
          ticks: {
            callback(value) { return formatCompactNumber(value); },
            font: { size: 11 },
          },
        },
      },
    },
  });
}

function renderExpenseChart(operations) {
  if (state.expenseChart) state.expenseChart.destroy();

  const categoryTotals = operations
    .filter((operation) => operation.type === "expense")
    .reduce((totals, operation) => {
      totals[operation.category] = (totals[operation.category] || 0) + operation.amount;
      return totals;
    }, {});

  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);
  const hasData = values.some((value) => value > 0);
  const chartLabels = hasData ? labels : ["لا توجد مصروفات"];
  const chartValues = hasData ? values : [1];
  const colors = hasData ? chartColors.categories.slice(0, labels.length) : ["#e5e5ea"];

  state.expenseChart = new Chart(refs.expenseChartCanvas, {
    type: "doughnut",
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartValues,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: hasData ? 8 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "67%",
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: hasData,
          rtl: true,
          textDirection: "rtl",
          callbacks: {
            label(context) {
              return `${context.label}: ${formatNumber(context.raw)} ر.س`;
            },
          },
        },
      },
    },
  });

  refs.expenseLegend.innerHTML = hasData
    ? labels.map((label, index) => `
        <div class="legend-item">
          <span class="legend-dot" style="--legend-color:${colors[index]}"></span>
          <strong>${escapeHtml(label)}</strong>
          <span>${formatNumber(values[index])} ر.س</span>
        </div>
      `).join("")
    : '<div class="empty-state"><p>لا توجد مصروفات في هذا الشهر.</p></div>';
}

// =============================
// التواريخ الميلادية والهجرية
// =============================
function setDefaultFormDates() {
  const today = toISODateValue(new Date());
  refs.saleDate.value = today;
  refs.expenseDate.value = today;
  syncMainDateDisplays();
}

function updateHijriDateDisplays() {
  const saleDate = normalizeDateInput(refs.saleDate.value);
  const expenseDate = normalizeDateInput(refs.expenseDate.value);

  refs.saleHijriDate.textContent = saleDate ? formatHijriDate(saleDate) : "—";
  refs.expenseHijriDate.textContent = expenseDate ? formatHijriDate(expenseDate) : "—";
}

function handleNativeDateChange() {
  syncMainDateDisplays();
  updateHijriDateDisplays();
}

function syncMainDateDisplays() {
  if (refs.saleDateDisplay) {
    refs.saleDateDisplay.textContent = refs.saleDate.value
      ? formatDateInputDisplay(normalizeDateInput(refs.saleDate.value))
      : "اختر التاريخ";
  }
  if (refs.expenseDateDisplay) {
    refs.expenseDateDisplay.textContent = refs.expenseDate.value
      ? formatDateInputDisplay(normalizeDateInput(refs.expenseDate.value))
      : "اختر التاريخ";
  }
}

function formatGregorianDate(dateString) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    calendar: "gregory",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(dateString));
}

function formatHijriDate(dateString) {
  const options = {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  };

  try {
    return ensureHijriSuffix(
      new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", options)
        .format(parseLocalDate(dateString))
    );
  } catch (error) {
    return ensureHijriSuffix(
      new Intl.DateTimeFormat("ar-SA-u-ca-islamic-nu-latn", options)
        .format(parseLocalDate(dateString))
    );
  }
}

function ensureHijriSuffix(formattedDate) {
  return formattedDate.includes("هـ") ? formattedDate : `${formattedDate} هـ`;
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    calendar: "gregory",
    month: "long",
    year: "numeric",
  }).format(date);
}


function normalizeDateInput(value) {
  const text = String(value || "").trim().replace(/[-.]/g, "/");
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateInputDisplay(dateString) {
  if (!isValidDate(dateString)) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  return `${year}/${month}/${day}`;
}

function toISODateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDisplayDateValue(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isValidDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return false;
  const date = parseLocalDate(dateString);
  return !Number.isNaN(date.getTime()) && toDateInputValue(date) === dateString;
}

// =============================
// الحسابات والتخزين
// =============================
function getSelectedMonthOperations() {
  const year = state.selectedMonth.getFullYear();
  const month = state.selectedMonth.getMonth();

  return state.operations
    .filter((operation) => {
      if (!isValidDate(operation.date)) return false;
      const date = parseLocalDate(operation.date);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .sort((a, b) => {
      const dateDiff = parseLocalDate(b.date) - parseLocalDate(a.date);
      if (dateDiff !== 0) return dateDiff;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function calculateTotals(operations) {
  return operations.reduce((totals, operation) => {
    const amount = Number(operation.amount) || 0;
    if (operation.type === "sale") {
      totals.revenue += amount;
      totals.pigeons += Math.max(0, Number(operation.quantity) || 0);
    }
    if (operation.type === "expense") totals.expenses += amount;
    totals.profit = totals.revenue - totals.expenses;
    return totals;
  }, { revenue: 0, expenses: 0, profit: 0, pigeons: 0 });
}

function loadOperations() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((operation) => {
      return operation &&
        typeof operation.id === "string" &&
        ["sale", "expense"].includes(operation.type) &&
        isValidDate(operation.date) &&
        Number.isFinite(Number(operation.amount));
    }).map((operation) => ({
      ...operation,
      amount: Number(operation.amount),
      quantity: operation.quantity == null ? null : Number(operation.quantity),
    }));
  } catch (error) {
    console.warn("Could not load stored operations:", error);
    return [];
  }
}

function saveOperations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.operations));
  } catch (error) {
    console.error("Could not save operations:", error);
    showToast("تعذر حفظ البيانات على هذا الجهاز", "error");
  }
}

// =============================
// أدوات مساعدة
// =============================
function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPositiveAmount(value) {
  return Number.isFinite(value) && value > 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function focusFirstInvalid(form) {
  const invalid = form.querySelector(":invalid");
  if (invalid) invalid.focus();
}

function showToast(message, type = "success") {
  if (!refs.toast) return;
  clearTimeout(state.toastTimer);

  const icon = refs.toast.querySelector("i");
  refs.toast.querySelector("span").textContent = message;
  icon.className = type === "error"
    ? "fa-solid fa-circle-exclamation"
    : "fa-solid fa-circle-check";
  icon.style.color = type === "error" ? "#ff8b8b" : "#77d2aa";

  refs.toast.classList.add("show");
  state.toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 3000);
}
