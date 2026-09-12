const storageKey = 'electric_kwh_pulse_app_data_v1';

const defaultState = {
  tariff: 1444,
  kwhPerDay: 0,
  monthDays: 30,
  records: []
};

let state = loadState();
let recordCounter = 1;
let deferredInstallPrompt = null;

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat('id-ID');
const kwhFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2
});
let selectedRecapMonth = 'all';

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    return { ...defaultState };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      tariff: parsed.tariff ?? defaultState.tariff,
      kwhPerDay: parsed.kwhPerDay ?? defaultState.kwhPerDay,
      monthDays: parsed.monthDays ?? defaultState.monthDays,
      records: Array.isArray(parsed.records) ? parsed.records : []
    };
  } catch (e) {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getTodayISO() {
  const today = new Date();
  const date = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 10);
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function setDefaultFormDates() {
  const today = getTodayISO();
  const topupDate = document.getElementById('topupDate');
  if (topupDate && !topupDate.value) topupDate.value = today;
  const usageDate = document.getElementById('usageDate');
  if (usageDate && !usageDate.value) usageDate.value = today;
}

function init() {
  registerProgressiveWebApp();
  syncControls();
  setDefaultFormDates();
  const topupTime = document.getElementById('topupTime');
  if (topupTime) topupTime.value = getCurrentTime();
  const usageTime = document.getElementById('usageTime');
  if (usageTime) usageTime.value = getCurrentTime();
  bindEvents();
  render();
}

function bindEvents() {
  const saveSettingsButton = document.getElementById('saveSettings');
  if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', () => {
      const tariff = parseFloat(document.getElementById('tariffInput').value || 0);
      const monthDays = parseInt(document.getElementById('monthDaysInput').value || 30, 10);
      if (tariff >= 0 && monthDays >= 1) {
        state.tariff = tariff;
        state.monthDays = monthDays;
        saveState();
        render();
      }
    });
  }

  const topupForm = document.getElementById('topupForm');
  if (topupForm) {
    topupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('topupDate').value || getTodayISO();
      const time = getCurrentTime();
      const amount = parseFloat(document.getElementById('topupKwh').value || 0);

      if (amount <= 0) {
        return;
      }

      const newRecord = {
        id: generateId(),
        type: 'topup',
        date,
        time,
        kwh: amount,
        cost: 0,
        note: 'Top Up Pulsa KWH'
      };

      state.records.push(newRecord);
      saveState();
      topupForm.reset();
      document.getElementById('topupDate').value = getTodayISO();
      document.getElementById('topupTime').value = getCurrentTime();
      render();
    });
  }

  const usageForm = document.getElementById('usageForm');
  if (usageForm) {
    usageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('usageDate').value || getTodayISO();
      const time = getCurrentTime();
      const remaining = parseFloat(document.getElementById('remainingKwh').value || 0);

      if (remaining < 0) {
        return;
      }

      const usageDateTime = getDateTimeStamp(date, time);
      const topups = state.records.filter(r => r.type === 'topup' && getDateTimeStamp(r.date || getTodayISO(), r.time || '00:00') <= usageDateTime);
      const usages = state.records.filter(r => r.type === 'usage' && getDateTimeStamp(r.date || getTodayISO(), r.time || '00:00') < usageDateTime);

      if (topups.length === 0) {
        return;
      }

      const totalTopup = sumKwh(topups);
      const totalUsed = sumKwh(usages);
      const availableBalance = Math.max(0, totalTopup - totalUsed);
      const amountUsed = Math.max(0, availableBalance - remaining);
      const usageCost = amountUsed * state.tariff;

      const newRecord = {
        id: generateId(),
        type: 'usage',
        date,
        time,
        kwh: amountUsed,
        remainingKwh: remaining,
        cost: usageCost,
        note: 'Pemakaian KWH',
        topupId: topups[topups.length - 1].id
      };

      state.records.push(newRecord);
      saveState();
      usageForm.reset();
      document.getElementById('usageDate').value = getTodayISO();
      document.getElementById('usageTime').value = getCurrentTime();
      render();
    });
  }

  const resetButton = document.getElementById('resetButton');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      localStorage.removeItem(storageKey);
      state = {
        tariff: defaultState.tariff,
        kwhPerDay: 0,
        monthDays: defaultState.monthDays,
        records: []
      };
      recordCounter = 1;
      saveState();
      render();
    });
  }

  const clearHistory = document.getElementById('clearHistory');
  if (clearHistory) {
    clearHistory.addEventListener('click', () => {
      state.records = [];
      saveState();
      render();
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
    });
  }

  const downloadCsv = document.getElementById('downloadCsv');
  if (downloadCsv) {
    downloadCsv.addEventListener('click', () => {
      exportCsv();
    });
  }

  const monthFilter = document.getElementById('rekapanMonthFilter');
  if (monthFilter) {
    monthFilter.addEventListener('change', () => {
      selectedRecapMonth = monthFilter.value;
      renderRekapanTable();
    });
  }

  const backupData = document.getElementById('backupData');
  if (backupData) {
    backupData.addEventListener('click', () => {
      const backup = {
        app: 'KwhPulse',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state
      };
      downloadFile(JSON.stringify(backup, null, 2), `kwhpulse-backup-${getTodayISO()}.json`, 'application/json');
    });
  }

  const restoreDataButton = document.getElementById('restoreDataButton');
  const restoreDataInput = document.getElementById('restoreDataInput');
  if (restoreDataButton && restoreDataInput) {
    restoreDataButton.addEventListener('click', () => restoreDataInput.click());
    restoreDataInput.addEventListener('change', async () => {
      const file = restoreDataInput.files[0];
      if (!file) return;

      try {
        const imported = JSON.parse(await file.text());
        const importedState = imported.data || imported;
        if (!Array.isArray(importedState.records)) throw new Error('Format backup tidak valid');
        state = {
          tariff: Number(importedState.tariff) || defaultState.tariff,
          kwhPerDay: Number(importedState.kwhPerDay) || 0,
          monthDays: Number(importedState.monthDays) || defaultState.monthDays,
          records: importedState.records
        };
        saveState();
        render();
      } catch (error) {
        window.alert('File backup tidak valid.');
      } finally {
        restoreDataInput.value = '';
      }
    });
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('usernameInput').value.trim();
      const password = document.getElementById('passwordInput').value.trim();
      const error = document.getElementById('loginMessage');

      if (username === 'admin' && password === 'admin123') {
        localStorage.setItem('kwhpulse_login_session', 'active');
        localStorage.setItem('kwhpulse_user', username);
        window.location.href = 'dashboard.html';
      } else {
        if (error) error.textContent = 'Username atau password salah';
      }
    });
  }

  const installButton = document.getElementById('installButton');
  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;
    });
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      localStorage.removeItem('kwhpulse_login_session');
      localStorage.removeItem('kwhpulse_user');
      window.location.href = 'login.html';
    });
  }

  const currentPage = window.location.pathname.split('/').pop();
  const publicPages = ['', 'index.html', 'login.html'];
  if (!publicPages.includes(currentPage)) {
    const session = localStorage.getItem('kwhpulse_login_session');
    if (!session || session !== 'active') {
      window.location.href = 'login.html';
    }
  }
}

function registerProgressiveWebApp() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installButton = document.getElementById('installButton');
    if (installButton) installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    const installButton = document.getElementById('installButton');
    if (installButton) installButton.hidden = true;
    deferredInstallPrompt = null;
  });
}

function generateId() {
  const base = Date.now().toString(36);
  return `${base}-${recordCounter++}`;
}

function syncControls() {
  const tariffPrice = document.getElementById('tariffInput');
  if (tariffPrice) tariffPrice.value = state.tariff;
  const perDay = document.getElementById('perDayInput');
  if (perDay) perDay.value = state.kwhPerDay;
  const monthDays = document.getElementById('monthDaysInput');
  if (monthDays) monthDays.value = state.monthDays;
}

function calculateAverageDailyUsage() {
  const usages = state.records
    .filter(record => record.type === 'usage' && record.date && Number.isFinite(Number(record.kwh)))
    .sort((first, second) => first.date.localeCompare(second.date));

  if (usages.length === 0) {
    return 0;
  }

  const firstDate = new Date(`${usages[0].date}T00:00:00`);
  const lastDate = new Date(`${usages[usages.length - 1].date}T00:00:00`);
  const elapsedDays = Math.max(1, Math.floor((lastDate - firstDate) / 86400000) + 1);
  const totalUsage = usages.reduce((total, record) => total + Number(record.kwh), 0);

  return totalUsage / elapsedDays;
}

function render() {
  state.kwhPerDay = calculateAverageDailyUsage();
  syncControls();
  renderSummary();
  renderEstimate();
  renderHistory();
  renderMonthlySummary();
  renderRekapanTable();
  renderChart();
  renderTariffProfile();

  const todayText = document.getElementById('todayDisplay');
  if (todayText) {
    todayText.textContent = 'Hari ini, ' + formatDate(getTodayISO());
  }

  const sidebarMonth = document.getElementById('sidebarMonth');
  if (sidebarMonth) {
    sidebarMonth.textContent = formatMonth(new Date().getMonth(), new Date().getFullYear());
  }

  const summaryCurrentMonth = document.getElementById('summaryCurrentMonth');
  if (summaryCurrentMonth) {
    summaryCurrentMonth.textContent = formatMonth(new Date().getMonth(), new Date().getFullYear());
  }

  const summaryTodayDate = document.getElementById('summaryTodayDate');
  if (summaryTodayDate) {
    summaryTodayDate.textContent = formatCurrentDay(getTodayISO());
  }
}

function renderSummary() {
  const summaryRemaining = document.getElementById('summaryRemaining');
  if (summaryRemaining) {
    const usableTopups = state.records.filter(r => r.type === 'topup');
    const usages = state.records.filter(r => r.type === 'usage');
    const totalTopup = sumKwh(usableTopups);
    const totalUsed = sumKwh(usages);
    const currentRemaining = Math.max(0, totalTopup - totalUsed);
    summaryRemaining.textContent = `${numberFormatter.format(currentRemaining)} kWh`;

    const remainingRupiah = document.getElementById('remainingRupiah');
    if (remainingRupiah) {
      remainingRupiah.textContent = `${currencyFormatter.format(currentRemaining * state.tariff)} tersisa`;
    }
  }

  const today = getTodayISO();
  const usagesToday = state.records.filter(r => r.type === 'usage' && r.date === today);

  const summaryTodayUsage = document.getElementById('summaryTodayUsage');
  if (summaryTodayUsage) {
    const todayUsage = sumKwh(usagesToday);
    summaryTodayUsage.textContent = `${numberFormatter.format(todayUsage)} kWh`;
  }

  const todayCost = document.getElementById('todayCost');
  if (todayCost) {
    const todayCostValue = usagesToday.reduce((sum, r) => sum + r.cost, 0);
    todayCost.textContent = currencyFormatter.format(todayCostValue);
  }

  const summaryDailyAvg = document.getElementById('summaryDailyAvg');
  if (summaryDailyAvg) {
    summaryDailyAvg.textContent = `${kwhFormatter.format(state.kwhPerDay)} kWh`;
  }

  const summaryMonthlyCost = document.getElementById('summaryMonthlyCost');
  if (summaryMonthlyCost) {
    const monthlyEstimateKwh = state.kwhPerDay * state.monthDays;
    const monthlyEstimateCost = monthlyEstimateKwh * state.tariff;
    summaryMonthlyCost.textContent = currencyFormatter.format(monthlyEstimateCost);
  }

  const summaryMonthlyKwh = document.getElementById('summaryMonthlyKwh');
  if (summaryMonthlyKwh) {
    const monthlyEstimateKwh = state.kwhPerDay * state.monthDays;
    summaryMonthlyKwh.textContent = `${numberFormatter.format(monthlyEstimateKwh)} kWh`;
  }

  const remainingTrend = document.getElementById('remainingTrend');
  if (remainingTrend) {
    const topups = state.records.filter(r => r.type === 'topup');
    const usages = state.records.filter(r => r.type === 'usage');
    const totalTopup = sumKwh(topups);
    const totalUsed = sumKwh(usages);
    const currentRemaining = Math.max(0, totalTopup - totalUsed);
    if (currentRemaining < 5) {
      remainingTrend.textContent = 'LOW';
      remainingTrend.className = 'summary-foot-trend warn';
    } else {
      const remainingPercentage = totalTopup > 0 ? (currentRemaining / totalTopup) * 100 : 0;
      remainingTrend.textContent = `${kwhFormatter.format(remainingPercentage)}% tersisa`;
      remainingTrend.className = 'summary-foot-trend up';
    }
  }
}

function renderEstimate() {
  const monthlyEstimateKwh = state.kwhPerDay * state.monthDays;
  const monthlyEstimateCost = monthlyEstimateKwh * state.tariff;

  const monthlyKwhEstimate = document.getElementById('monthlyKwhEstimate');
  if (monthlyKwhEstimate) {
    monthlyKwhEstimate.textContent = `${numberFormatter.format(monthlyEstimateKwh)} kWh`;
  }

  const monthlyCostEstimate = document.getElementById('monthlyCostEstimate');
  if (monthlyCostEstimate) {
    monthlyCostEstimate.textContent = currencyFormatter.format(monthlyEstimateCost);
  }

  const estimateKwh = document.getElementById('estimateKwh');
  if (estimateKwh) {
    estimateKwh.textContent = `${numberFormatter.format(monthlyEstimateKwh)} kWh`;
  }

  const estimateCost = document.getElementById('estimateCost');
  if (estimateCost) {
    estimateCost.textContent = currencyFormatter.format(monthlyEstimateCost);
  }

  const annualEstimateKwh = monthlyEstimateKwh * 12;
  const annualEstimateCost = monthlyEstimateCost * 12;
  const estimateAnnualKwh = document.getElementById('estimateAnnualKwh');
  if (estimateAnnualKwh) {
    estimateAnnualKwh.textContent = `${numberFormatter.format(annualEstimateKwh)} kWh`;
  }

  const estimateAnnualCost = document.getElementById('estimateAnnualCost');
  if (estimateAnnualCost) {
    estimateAnnualCost.textContent = currencyFormatter.format(annualEstimateCost);
  }

  const formulaMonthlyKwh = document.getElementById('formulaMonthlyKwh');
  if (formulaMonthlyKwh) {
    formulaMonthlyKwh.textContent = `${kwhFormatter.format(state.kwhPerDay)} × ${numberFormatter.format(state.monthDays)} hari = ${numberFormatter.format(monthlyEstimateKwh)} kWh`;
  }

  const formulaMonthlyCost = document.getElementById('formulaMonthlyCost');
  if (formulaMonthlyCost) {
    formulaMonthlyCost.textContent = `${numberFormatter.format(monthlyEstimateKwh)} kWh × ${currencyFormatter.format(state.tariff)} = ${currencyFormatter.format(monthlyEstimateCost)}`;
  }
}

function renderHistory() {
  const history = document.getElementById('historyList');
  if (!history) {
    return;
  }

  if (state.records.length === 0) {
    history.innerHTML = `<div class="empty-state">Belum ada histori</div>`;
    return;
  }

  const sorted = [...state.records].sort((a, b) => getDateTimeStamp(b.date || getTodayISO(), b.time || '00:00') - getDateTimeStamp(a.date || getTodayISO(), a.time || '00:00'));

  history.innerHTML = sorted.map(record => renderHistoryItem(record)).join('');
}

function renderHistoryItem(record) {
  if (record.type === 'topup') {
    return `<div class="history-item">
      <div class="history-content">
        <div class="history-date">${formatDate(record.date)}</div>
        <div class="history-title history-type-topup">Top Up Pulsa KWH</div>
        <div class="history-detail">Tambah ${numberFormatter.format(record.kwh)} kWh</div>
      </div>
      <div class="history-content">
        <div class="history-kwh history-type-topup">+${numberFormatter.format(record.kwh)} kWh</div>
      </div>
    </div>`;
  }

  return `<div class="history-item">
    <div class="history-content">
      <div class="history-date">${formatDate(record.date)}</div>
      <div class="history-title history-type-usage">Pemakaian KWH</div>
      <div class="history-detail">Sisa ${numberFormatter.format(record.remainingKwh || 0)} kWh</div>
    </div>
    <div class="history-content">
      <div class="history-kwh history-type-usage">-${numberFormatter.format(record.kwh)} kWh</div>
      <div class="history-cost">${currencyFormatter.format(record.cost)}</div>
    </div>
  </div>`;
}

function renderMonthlySummary() {
  const monthlySummary = document.getElementById('monthlySummary');
  if (!monthlySummary) {
    return;
  }

  const monthlyMap = new Map();
  const usageRecords = state.records.filter(r => r.type === 'usage');

  usageRecords.forEach(record => {
    const month = record.date.slice(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { kwh: 0, cost: 0 });
    }

    const item = monthlyMap.get(month);
    item.kwh += record.kwh;
    item.cost += record.cost;
  });

  if (monthlyMap.size === 0) {
    monthlySummary.innerHTML = `<div class="empty-state">Belum ada data pemakaian</div>`;
    return;
  }

  const entries = Array.from(monthlyMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  monthlySummary.innerHTML = entries.map(([month, value]) => {
    const displayMonth = formatMonth(parseInt(month.slice(5, 7), 10) - 1, parseInt(month.slice(0, 4), 10));
    return `<div class="month-entry">
      <div class="month-entry-left">
        <div class="month-label">${displayMonth}</div>
        <div class="month-kwh">${numberFormatter.format(value.kwh)} kWh</div>
      </div>
      <div class="month-cost">${currencyFormatter.format(value.cost)}</div>
    </div>`;
  }).join('');
}

function renderRekapanTable() {
  const tableBody = document.getElementById('rekapanTableBody');
  if (!tableBody) {
    return;
  }

  const availableMonths = [...new Set(state.records.map(record => record.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const monthFilter = document.getElementById('rekapanMonthFilter');
  if (monthFilter) {
    monthFilter.innerHTML = '<option value="all">Semua bulan</option>' + availableMonths.map(month => `<option value="${month}">${formatMonth(Number(month.slice(5, 7)) - 1, Number(month.slice(0, 4))}</option>`).join('');
    monthFilter.value = availableMonths.includes(selectedRecapMonth) ? selectedRecapMonth : 'all';
    selectedRecapMonth = monthFilter.value;
  }

  const filteredRecords = selectedRecapMonth === 'all'
    ? state.records
    : state.records.filter(record => record.date?.slice(0, 7) === selectedRecapMonth);

  if (filteredRecords.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Belum ada data</td></tr>`;
    renderRecapTotals([]);
    return;
  }

  const sorted = [...filteredRecords].sort((a, b) => getDateTimeStamp(b.date || getTodayISO(), b.time || '00:00') - getDateTimeStamp(a.date || getTodayISO(), a.time || '00:00'));
  tableBody.innerHTML = sorted.map(record => {
    if (record.type === 'topup') {
      return `<tr>
        <td>${formatDate(record.date)} ${formatTime(record.time)}</td>
        <td><span class="type-tag type-topup">Top Up</span></td>
        <td><span class="positive-value">+${numberFormatter.format(record.kwh)} kWh</span></td>
        <td>-</td>
        <td>-</td>
        <td>${currencyFormatter.format(record.cost)}</td>
      </tr>`;
    }

    return `<tr>
      <td>${formatDate(record.date)} ${formatTime(record.time)}</td>
      <td><span class="type-tag type-usage">Pemakaian</span></td>
      <td>-</td>
      <td><span class="negative-value">-${numberFormatter.format(record.kwh)} kWh</span></td>
      <td>${numberFormatter.format(record.remainingKwh || 0)} kWh</td>
      <td>${currencyFormatter.format(record.cost)}</td>
    </tr>`;
  }).join('');

  renderRecapTotals(filteredRecords);
}

function renderRecapTotals(records) {
  const summaryTopup = document.getElementById('summaryTopup');
  const summaryUsageTotal = document.getElementById('summaryUsageTotal');
  const summaryCostTotal = document.getElementById('summaryCostTotal');

  if (summaryTopup) {
    const topups = records.filter(r => r.type === 'topup');
    summaryTopup.textContent = `${numberFormatter.format(sumKwh(topups))} kWh`;
  }

  if (summaryUsageTotal) {
    const usages = records.filter(r => r.type === 'usage');
    summaryUsageTotal.textContent = `${numberFormatter.format(sumKwh(usages))} kWh`;
  }

  if (summaryCostTotal) {
    const usages = records.filter(r => r.type === 'usage');
    const totalCost = usages.reduce((sum, r) => sum + r.cost, 0);
    summaryCostTotal.textContent = currencyFormatter.format(totalCost);
  }
}

function renderChart() {
  const chartBars = document.getElementById('chartBars');
  if (!chartBars) {
    return;
  }

  const monthUsage = new Map();
  state.records.filter(r => r.type === 'usage').forEach(record => {
    const month = record.date.slice(0, 7);
    monthUsage.set(month, (monthUsage.get(month) || 0) + record.kwh);
  });

  if (monthUsage.size === 0) {
    chartBars.innerHTML = `<div class="empty-state">Belum ada grafik</div>`;
    return;
  }

  const entries = Array.from(monthUsage.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const maxKwh = Math.max(...entries.map(([_, value]) => value), 1);

  chartBars.innerHTML = entries.map(([month, value]) => {
    const monthName = formatMonth(parseInt(month.slice(5, 7), 10) - 1, parseInt(month.slice(0, 4), 10)).slice(0, 3);
    const barHeight = Math.max(16, Math.round((value / maxKwh) * 100));
    return `<div class="bar-group">
      <div class="bar-wrap">
        <span class="bar-value" style="height:${barHeight}%">${numberFormatter.format(value)}</span>
      </div>
      <span class="bar-label">${monthName}</span>
    </div>`;
  }).join('');
}

function renderTariffProfile() {
  const profileTariff = document.getElementById('profileTariff');
  if (profileTariff) {
    profileTariff.textContent = currencyFormatter.format(state.tariff);
  }

  const profileDay = document.getElementById('profileDay');
  if (profileDay) {
    profileDay.textContent = `${numberFormatter.format(state.kwhPerDay)} kWh`;
  }

  const profileMonthDays = document.getElementById('profileMonthDays');
  if (profileMonthDays) {
    profileMonthDays.textContent = `${numberFormatter.format(state.monthDays)} hari`;
  }
}

function exportCsv() {
  const header = ['Tanggal', 'Jam', 'Jenis', 'TopUpKwh', 'PemakaianKwh', 'SisaKwh', 'Biaya'];
  const records = selectedRecapMonth === 'all'
    ? state.records
    : state.records.filter(record => record.date?.slice(0, 7) === selectedRecapMonth);
  const rows = records.map(r => {
    const type = r.type === 'topup' ? 'Top Up' : 'Pemakaian';
    const topUp = r.type === 'topup' ? r.kwh : '';
    const usage = r.type === 'usage' ? r.kwh : '';
    const sisa = r.type === 'usage' ? (r.remainingKwh || '') : '';
    const biaya = r.type === 'usage' ? r.cost : '';
    return [r.date, r.time || '00:00', type, topUp, usage, sisa, biaya].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',');
  });

  const csv = [header, ...rows].map(row => row.join(',')).join('\n');
  downloadFile(csv, `rekapan-kwh-${selectedRecapMonth}.csv`, 'text/csv;charset=utf-8;');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sumKwh(records) {
  return records.reduce((sum, r) => sum + (r.kwh || 0), 0);
}

function getDateTimeStamp(dateString, timeString) {
  const date = dateString || getTodayISO();
  const time = timeString || '00:00';
  return new Date(`${date}T${time}:00`).getTime();
}

function formatTime(timeString) {
  if (!timeString) {
    return '';
  }
  const [hour, minute] = String(timeString).split(':');
  const hours = Number(hour || 0);
  const mins = Number(minute || 0);
  const date = new Date();
  date.setHours(hours, mins, 0, 0);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateString) {
  if (!dateString) {
    return '';
  }

  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatCurrentDay(dateString) {
  if (!dateString) {
    return '';
  }

  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatMonth(month, year) {
  return new Date(year, month, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric'
  });
}

init();
