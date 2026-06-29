const state = {
  data: null,
  filtered: [],
  filters: {
    dateFrom: "",
    dateTo: "",
    gender: "Alle",
    age: "Alle",
  },
  rawSort: {
    key: "",
    direction: "asc",
  },
  rawColumnWidths: {},
  rawResize: null,
};

const colors = ["#0c2830", "#79a879", "#d8b469", "#8fb4c7", "#b36a4c", "#6c7a54", "#bfc7ba"];
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.data = await loadData();
  state.filtered = [...state.data.records];
  setupFilters();
  setupTabs();
  setupRawToggle();
  renderAll();
  openInitialTab();
}

async function loadData() {
  if (window.REPORT_DATA) return window.REPORT_DATA;
  const response = await fetch("data.json");
  return response.json();
}

function setupFilters() {
  const { dateRange } = state.data.meta;
  const from = q("#dateFrom");
  const to = q("#dateTo");

  from.value = dateRange.start || "";
  to.value = dateRange.end || "";
  state.filters.dateFrom = from.value;
  state.filters.dateTo = to.value;

  fillSelect("#genderFilter", uniqueMulti("genders"));
  fillSelect("#ageFilter", uniqueMulti("ageGroups"));

  from.addEventListener("change", (event) => updateFilter("dateFrom", event.target.value));
  to.addEventListener("change", (event) => updateFilter("dateTo", event.target.value));
  q("#genderFilter").addEventListener("change", (event) => updateFilter("gender", event.target.value));
  q("#ageFilter").addEventListener("change", (event) => updateFilter("age", event.target.value));
  q("#resetFilters").addEventListener("click", () => {
    state.filters = {
      dateFrom: dateRange.start || "",
      dateTo: dateRange.end || "",
      gender: "Alle",
      age: "Alle",
    };
    from.value = state.filters.dateFrom;
    to.value = state.filters.dateTo;
    q("#genderFilter").value = "Alle";
    q("#ageFilter").value = "Alle";
    applyFilters();
  });
}

function fillSelect(selector, values) {
  q(selector).innerHTML = ["Alle", ...values]
    .map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

function uniqueMulti(field) {
  return [...new Set(state.data.records.flatMap((row) => row[field] || []).filter(Boolean))].sort(sortHuman);
}

function updateFilter(key, value) {
  state.filters[key] = value;
  applyFilters();
}

function applyFilters() {
  const { dateFrom, dateTo, gender, age } = state.filters;
  state.filtered = state.data.records.filter((row) => {
    const dateOk = (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo);
    const genderOk = gender === "Alle" || (row.genders || []).includes(gender);
    const ageOk = age === "Alle" || (row.ageGroups || []).includes(age);
    return dateOk && genderOk && ageOk;
  });
  renderAll();
}

function setupTabs() {
  qa(".tab").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function activateTab(tabName) {
  const button = q(`.tab[data-tab="${tabName}"]`);
  const panel = q(`#tab-${tabName}`);
  if (!button || !panel) return;
  qa(".tab").forEach((tab) => tab.classList.remove("is-active"));
  qa(".tab-panel").forEach((item) => item.classList.remove("is-active"));
  button.classList.add("is-active");
  panel.classList.add("is-active");
  if (history.replaceState) history.replaceState(null, "", `#${tabName}`);
}

function openInitialTab() {
  const tabName = location.hash.replace("#", "");
  if (!tabName) return;
  activateTab(tabName);
}

function setupRawToggle() {
  q("#rawToggle").addEventListener("click", () => {
    const expanded = q("#rawToggle").getAttribute("aria-expanded") === "true";
    setRawOpen(!expanded);
  });
}

function setRawOpen(open) {
  q("#rawToggle").setAttribute("aria-expanded", String(open));
  q("#rawToggle").textContent = open ? "Rohdaten ausblenden" : "Rohdaten anzeigen";
  q("#rawWrap").hidden = !open;
}

function renderAll() {
  const filteredRows = state.filtered;
  const allRows = state.data.records;
  const filteredStats = calculateStats(filteredRows);
  const allStats = calculateStats(allRows);

  renderHero(filteredStats, allStats);
  renderKpis(filteredStats);
  renderSummary(allRows, allStats);
  renderSales(filteredRows, filteredStats);
  renderFeedback(filteredRows);
  renderRaw(allRows);
}

function calculateStats(rows) {
  const responses = rows.length;
  const totalSales = sum(rows, "salesUnits");
  const pure = sum(rows, "pureShots");
  const mixed = sum(rows, "mixedShots");
  const shots = pure + mixed;
  const days = groupByDateMulti(rows);
  const topSalesDay = [...days].sort((a, b) => b.sales - a.sales)[0] || null;
  const topSamplingDay = [...days].sort((a, b) => b.shots - a.shots)[0] || null;
  const bestConversionDay = [...days].filter((day) => day.shots > 0).sort((a, b) => b.conversion - a.conversion)[0] || null;

  return {
    responses,
    totalSales,
    pure,
    mixed,
    shots,
    avgShots: responses ? shots / responses : 0,
    avgSales: responses ? totalSales / responses : 0,
    conversionRate: shots ? totalSales / shots : 0,
    mixShare: shots ? mixed / shots : 0,
    pureShare: shots ? pure / shots : 0,
    topSalesDay,
    topSamplingDay,
    bestConversionDay,
  };
}

function renderHero(filteredStats, allStats) {
  const { dateRange } = state.data.meta;
  q("#reportPeriod").textContent = dateRange.start && dateRange.end
    ? `Zeitraum: ${formatDate(dateRange.start)} bis ${formatDate(dateRange.end)}`
    : "Zeitraum: nicht eindeutig ableitbar";

  const filterSuffix = filteredStats.responses === allStats.responses
    ? `Gesamtbasis: ${number.format(allStats.responses)} Schichten, ${number.format(allStats.shots)} Tastings und ${number.format(allStats.totalSales)} Verkäufe.`
    : `Aktuelle Filteransicht: ${number.format(filteredStats.responses)} Schichten, ${number.format(filteredStats.shots)} Tastings und ${number.format(filteredStats.totalSales)} Verkäufe.`;

  q("#executiveSummary").textContent = `Die Datenbasis umfasst ${number.format(state.data.meta.rowCount)} Responses / Schichten im Zeitraum ${formatDate(dateRange.start)} bis ${formatDate(dateRange.end)}. ${filterSuffix}`;
}

function renderKpis(stats) {
  const cards = [
    ["Schichten", number.format(stats.responses), "gefilterte Promotion-Einsätze"],
    ["Tastings gesamt", number.format(stats.shots), "ausgegebene Samples im Filter"],
    ["Ø Tastings / Schicht", number.format(stats.avgShots), "Mittelwert je Einsatz"],
    ["Verkäufe", number.format(stats.totalSales), "verkaufte Flaschen / Stück"],
    ["Ø Verkäufe / Schicht", number.format(stats.avgSales), "Mittelwert je Einsatz"],
    ["Conversion Rate", percent.format(stats.conversionRate), "Verkäufe je ausgegebenem Tasting"],
    ["Top-Verkaufstag", stats.topSalesDay ? number.format(stats.topSalesDay.sales) : "0", stats.topSalesDay ? `${formatDate(stats.topSalesDay.date)} · verkaufte Stück` : "kein Tag im aktuellen Filter"],
    ["Stärkster Sampling-Tag", stats.topSamplingDay ? number.format(stats.topSamplingDay.shots) : "0", stats.topSamplingDay ? `${formatDate(stats.topSamplingDay.date)} · ausgegebene Tastings` : "kein Tag im aktuellen Filter"],
  ];

  q("#kpiGrid").innerHTML = cards.map(([label, value, foot]) => `
    <article class="kpi-card">
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      <p class="kpi-foot">${foot}</p>
    </article>
  `).join("");
}

function renderSummary(rows, stats) {
  renderDonut("#genderChart", countMulti(rows, "genders"));
  renderBars("#ageChart", countMulti(rows, "ageGroups"), { keepOrder: false });
  renderPerformanceLanes("#summaryPerformanceChart", groupByDateMulti(rows), { compact: true });
  q("#summaryPerformanceMeta").innerHTML = [
    metricCard("Top-Verkaufstag", stats.topSalesDay ? number.format(stats.topSalesDay.sales) : "0", stats.topSalesDay ? formatDate(stats.topSalesDay.date) : "Keine Daten"),
    metricCard("Stärkster Sampling-Tag", stats.topSamplingDay ? number.format(stats.topSamplingDay.shots) : "0", stats.topSamplingDay ? formatDate(stats.topSamplingDay.date) : "Keine Daten"),
    metricCard("Beste Tages-Conversion", stats.bestConversionDay ? percent.format(stats.bestConversionDay.conversion) : "0 %", stats.bestConversionDay ? formatDate(stats.bestConversionDay.date) : "Keine Daten"),
  ].join("");

  const obstacles = Object.entries(obstacleTotals(rows)).sort((a, b) => b[1] - a[1]);
  const topObstacle = obstacles[0] || ["nicht eindeutig", 0];
  q("#summaryInsights").innerHTML = [
    ["Starke Sampling-Basis", `${number.format(stats.shots)} Tastings wurden über alle 17 Schichten dokumentiert.`],
    ["Mix-Verteilung", `${percent.format(stats.mixShare)} der Samples wurden als Gin & Tonic ausgeschenkt, ${percent.format(stats.pureShare)} pur.`],
    ["Dominanteste Kaufbarriere", `${topObstacle[0]} wurde ${number.format(topObstacle[1])}-mal explizit genannt.`],
  ].map(insightItem).join("");
}

function renderSales(rows, stats) {
  renderPerformanceLanes("#activationChart", groupByDateMulti(rows));
  q("#activationMeta").innerHTML = [
    metricCard("Top-Verkaufstag", stats.topSalesDay ? number.format(stats.topSalesDay.sales) : "0", stats.topSalesDay ? formatDate(stats.topSalesDay.date) : "Keine Daten"),
    metricCard("Stärkster Sampling-Tag", stats.topSamplingDay ? number.format(stats.topSamplingDay.shots) : "0", stats.topSamplingDay ? formatDate(stats.topSamplingDay.date) : "Keine Daten"),
    metricCard("Beste Conversion", stats.bestConversionDay ? percent.format(stats.bestConversionDay.conversion) : "0 %", stats.bestConversionDay ? formatDate(stats.bestConversionDay.date) : "Keine Daten"),
  ].join("");

  renderMixComparison("#shotMixChart", stats);
  q("#shotMixMeta").innerHTML = [
    metricCard("Pur-Anteil", percent.format(stats.pureShare), `${number.format(stats.pure)} ausgegebene Samples`),
    metricCard("Gin & Tonic-Anteil", percent.format(stats.mixShare), `${number.format(stats.mixed)} ausgegebene Samples`),
  ].join("");

  q("#conversionInsights").innerHTML = [
    ["Tastings", number.format(stats.shots)],
    ["Verkäufe", number.format(stats.totalSales)],
    ["Conversion Rate", percent.format(stats.conversionRate)],
    ["Ø Tastings / Schicht", number.format(stats.avgShots)],
    ["Ø Verkäufe / Schicht", number.format(stats.avgSales)],
  ].map(([label, value]) => `<div class="metric-item"><span>${label}</span><span>${value}</span></div>`).join("");

  q("#salesInsights").innerHTML = [
    ["Top-Verkaufstag", stats.topSalesDay ? `${formatDate(stats.topSalesDay.date)} mit ${number.format(stats.topSalesDay.sales)} verkauften Stück.` : "Kein Verkaufstag in der aktuellen Filterauswahl."],
    ["Stärkster Sampling-Tag", stats.topSamplingDay ? `${formatDate(stats.topSamplingDay.date)} mit ${number.format(stats.topSamplingDay.shots)} ausgegebenen Tastings.` : "Kein Sampling-Tag in der aktuellen Filterauswahl."],
    ["Beste Tages-Conversion", stats.bestConversionDay ? `${formatDate(stats.bestConversionDay.date)} mit ${percent.format(stats.bestConversionDay.conversion)} Verkäufen je Tasting.` : "Keine Conversion-Daten im aktuellen Filter."],
  ].map(insightItem).join("");
}

function renderFeedback(rows) {
  const obstacles = obstacleTotals(rows);
  renderObstacleBars("#obstacleChart", obstacles);

  const topObstacle = Object.entries(obstacles).sort((a, b) => b[1] - a[1])[0];
  q("#obstacleInsight").textContent = topObstacle
    ? `${topObstacle[0]} ist der dominanteste explizite Nichtkaufgrund und macht ${percent.format(topObstacle[1] / sumValues(obstacles))} aller erfassten Barrieren aus.`
    : "Im aktuellen Filter wurden keine expliziten Nichtkaufgründe dokumentiert.";

  const clusters = buildFeedbackClusters(rows);
  q("#feedbackClusters").innerHTML = clusters.length
    ? clusters.map((cluster) => `
        <div class="theme-card">
          <strong>${cluster.label}</strong>
          <span>${cluster.text}</span>
          <small>${cluster.count} relevante Rückmeldung(en)</small>
        </div>
      `).join("")
    : `<div class="theme-card"><strong>Keine Cluster</strong><span>Im aktuellen Filter liegen keine ausreichend klaren Freitextmuster vor.</span></div>`;

  const quotes = rows
    .flatMap((row) => [
      ...(row.tastingFeedback || []).map((text) => ({ text, row, type: "Tasting" })),
      ...(row.productFeedback || []).map((text) => ({ text, row, type: "Produkt" })),
    ])
    .filter((entry) => entry.text)
    .slice(0, 10);

  q("#feedbackQuotes").innerHTML = quotes.length
    ? quotes.map((entry) => `
        <div class="quote-card">
          ${escapeHtml(polish(entry.text))}
          <small>${formatDate(entry.row.date)} · ${entry.type} · ID ${escapeHtml(entry.row.promoterId)}</small>
        </div>
      `).join("")
    : `<div class="quote-card">Keine Freitextantworten im aktuellen Filter.</div>`;

  q("#recommendations").innerHTML = [
    ["Tonic-Story schärfen", "Fever-Tree bzw. das passende Tonic wurde mehrfach nachgefragt. Ein klar geführtes Serve-Skript dürfte die Kaufwahrscheinlichkeit erhöhen."],
    ["Reise- und Handgepäck-Einwand vorbereiten", "Mehrere Rückmeldungen drehen sich um Rückflug, Handgepäck und die Mitnahme größerer Flaschen. Diese Einwände sollten aktiv vorweggenommen werden."],
    ["Sortimentsgespräch gezielt nutzen", "Capri wird auffällig oft als Türöffner genannt. Gleichzeitig taucht die Flaschengröße als Hürde auf. Beides sollte im Gespräch bewusst eingesetzt werden."],
  ].map(([label, text]) => `<div class="recommendation"><strong>${label}</strong>${text}</div>`).join("");
}

function renderRaw(rows) {
  const meta = state.data.meta;
  const columns = getRawColumns(meta);
  const sortedRows = sortRawRows(rows);
  const colgroup = columns.map((column) => {
    const width = state.rawColumnWidths[column.key] || defaultRawColumnWidth(column);
    return `<col data-key="${escapeAttr(column.key)}" style="width:${width}px">`;
  }).join("");

  q("#rawMeta").innerHTML = [
    `Quelle: ${meta.sourceFile.split("/").pop()}`,
    `Zeilen: ${number.format(sortedRows.length)} von ${number.format(meta.rowCount)}`,
    `Zeitraum: ${formatDate(meta.dateRange.start)} bis ${formatDate(meta.dateRange.end)}`,
  ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");

  q("#rawTable").innerHTML = `
    <colgroup>${colgroup}</colgroup>
    <thead>
      <tr>
        ${columns.map((column) => `
          <th data-key="${escapeAttr(column.key)}">
            <button type="button" class="raw-sort" data-key="${escapeAttr(column.key)}" aria-label="${escapeAttr(`${column.label} sortieren`)}">
              ${rawCell(column.label, 34, "raw-cell--head")}
              <span>${sortIndicator(column.key)}</span>
            </button>
            <span class="raw-resize-handle" data-key="${escapeAttr(column.key)}" role="separator" aria-orientation="vertical" aria-label="${escapeAttr(`${column.label} Breite anpassen`)}"></span>
          </th>
        `).join("")}
      </tr>
    </thead>
    <tbody>
      ${sortedRows.map((row) => `
        <tr>${columns.map((column) => `<td>${rawCell(row.raw[column.key] ?? "", 58)}</td>`).join("")}</tr>
      `).join("")}
    </tbody>
  `;

  qa(".raw-sort").forEach((button) => {
    button.addEventListener("click", () => updateRawSort(button.dataset.key));
  });
  qa(".raw-resize-handle").forEach((handle) => {
    handle.addEventListener("mousedown", startRawResize);
  });
  attachTooltips(q("#rawTable"));
}

function updateRawSort(key) {
  if (state.rawSort.key === key) {
    state.rawSort.direction = state.rawSort.direction === "asc" ? "desc" : "asc";
  } else {
    state.rawSort = { key, direction: "asc" };
  }
  renderRaw(state.data.records);
}

function sortIndicator(key) {
  if (state.rawSort.key !== key) return "↕";
  return state.rawSort.direction === "asc" ? "↑" : "↓";
}

function sortRawRows(rows) {
  const { key, direction } = state.rawSort;
  if (!key) return rows;
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compare(a.raw[key], b.raw[key]) * factor);
}

function getRawColumns(meta) {
  const detected = meta.detectedColumns || {};
  const excludedKeys = new Set([
    ...(Array.isArray(detected.no_purchase) ? detected.no_purchase : []),
    ...(Array.isArray(detected.feedback) ? detected.feedback : []),
  ]);

  return meta.columns.filter((column) => {
    if (!column.label) return false;
    return !excludedKeys.has(column.key);
  });
}

function defaultRawColumnWidth(column) {
  return Math.max(120, Math.min(280, column.label.length * 7));
}

function startRawResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const key = event.currentTarget.dataset.key;
  const th = event.currentTarget.closest("th");
  if (!key || !th) return;

  state.rawResize = {
    key,
    startX: event.clientX,
    startWidth: th.getBoundingClientRect().width,
  };

  document.addEventListener("mousemove", onRawResizeMove);
  document.addEventListener("mouseup", stopRawResize);
  document.body.classList.add("is-resizing-columns");
}

function onRawResizeMove(event) {
  if (!state.rawResize) return;
  const nextWidth = Math.max(80, Math.round(state.rawResize.startWidth + (event.clientX - state.rawResize.startX)));
  state.rawColumnWidths[state.rawResize.key] = nextWidth;
  applyRawColumnWidth(state.rawResize.key, nextWidth);
}

function stopRawResize() {
  state.rawResize = null;
  document.removeEventListener("mousemove", onRawResizeMove);
  document.removeEventListener("mouseup", stopRawResize);
  document.body.classList.remove("is-resizing-columns");
}

function applyRawColumnWidth(key, width) {
  const col = q(`#rawTable col[data-key="${cssEscape(key)}"]`);
  if (col) col.style.width = `${width}px`;
}

function compare(a, b) {
  const A = norm(a);
  const B = norm(b);
  if (A.empty && B.empty) return 0;
  if (A.empty) return 1;
  if (B.empty) return -1;
  if (A.type === "number" && B.type === "number") return A.value - B.value;
  return String(A.value).localeCompare(String(B.value), "de", { numeric: true, sensitivity: "base" });
}

function norm(value) {
  const text = String(value ?? "").trim();
  if (!text) return { empty: true, type: "text", value: "" };
  const numberValue = Number(text.replace(",", "."));
  if (Number.isFinite(numberValue) && /^-?\d+([,.]\d+)?$/.test(text)) {
    return { empty: false, type: "number", value: numberValue };
  }
  return { empty: false, type: "text", value: text };
}

function renderDonut(selector, values) {
  const entries = Object.entries(values).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const container = q(selector);
  container.classList.add("donut-chart");
  if (!entries.length) {
    container.innerHTML = emptyChart();
    return;
  }

  let angle = -90;
  const slices = entries.map(([label, value], index) => {
    const sweep = value / total * 360;
    const path = donutSlice(88, 88, 72, 38, angle, angle + sweep);
    angle += sweep;
    return `<path d="${path}" fill="${colors[index % colors.length]}" data-tip="${escapeAttr(`${label}: ${number.format(value)} (${percent.format(value / total)})`)}"></path>`;
  }).join("");

  const legend = entries.map(([label, value], index) => `
    <div class="legend-row">
      <span style="background:${colors[index % colors.length]}"></span>
      ${escapeHtml(label)} · ${number.format(value)}
    </div>
  `).join("");

  container.innerHTML = `
    <svg viewBox="0 0 176 176">
      ${slices}
      <text x="88" y="92" text-anchor="middle" class="chart-value">${number.format(total)}</text>
      <text x="88" y="112" text-anchor="middle" class="axis-label">Nennungen</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  `;

  attachTooltips(container);
}

function renderBars(selector, values, options = {}) {
  const entries = (Array.isArray(values) ? values : Object.entries(values)).filter(([, value]) => Number(value) > 0);
  if (!options.keepOrder) entries.sort((a, b) => b[1] - a[1]);

  const container = q(selector);
  if (!entries.length) {
    container.innerHTML = emptyChart();
    return;
  }

  const max = Math.max(...entries.map(([, value]) => value));
  const width = 680;
  const baseY = 220;
  const barWidth = Math.max(44, 420 / entries.length);

  const bars = entries.map(([label, value], index) => {
    const height = max ? value / max * 168 : 0;
    const x = 80 + index * (barWidth + 24);
    const y = baseY - height;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="8" fill="${colors[index % colors.length]}" data-tip="${escapeAttr(`${label}: ${number.format(value)}`)}"></rect>
      <text x="${x + barWidth / 2}" y="${Math.max(24, y - 8)}" text-anchor="middle" class="chart-value">${number.format(value)}</text>
      <text x="${x + barWidth / 2}" y="248" text-anchor="middle" class="chart-label">${wrapSvgLabel(label, 14).map((line, lineIndex) => `<tspan x="${x + barWidth / 2}" dy="${lineIndex ? 14 : 0}">${escapeHtml(line)}</tspan>`).join("")}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} 280">
      <line x1="54" y1="${baseY}" x2="628" y2="${baseY}" class="grid-line"></line>
      ${bars}
    </svg>
  `;

  attachTooltips(container);
}

function renderPerformanceLanes(selector, points, options = {}) {
  const container = q(selector);
  if (!points.length) {
    container.innerHTML = emptyChart();
    return;
  }

  const compact = Boolean(options.compact);
  const width = compact ? 760 : 860;
  const topBase = compact ? 108 : 126;
  const bottomBase = compact ? 222 : 290;
  const laneHeight = compact ? 56 : 84;
  const barWidth = Math.max(compact ? 18 : 22, Math.min(compact ? 34 : 40, (width - 180) / (points.length * 2.1)));
  const step = barWidth * 2 + (compact ? 12 : 16);
  const shotMax = Math.max(...points.map((point) => point.shots), 1);
  const salesMax = Math.max(...points.map((point) => point.sales), 1);

  const bars = points.map((point, index) => {
    const x = 86 + index * step;
    const shotHeight = point.shots / shotMax * laneHeight;
    const salesHeight = point.sales / salesMax * laneHeight;
    const label = points.length > 8 && index % 2 === 1 ? "" : formatDateShort(point.date);
    return `
      <rect x="${x}" y="${topBase - shotHeight}" width="${barWidth}" height="${shotHeight}" rx="6" fill="${colors[1]}" data-tip="${escapeAttr(`${formatDate(point.date)}: ${number.format(point.shots)} Tastings`)}"></rect>
      <text x="${x + barWidth / 2}" y="${Math.max(26, topBase - shotHeight - 6)}" text-anchor="middle" class="chart-label">${number.format(point.shots)}</text>
      <rect x="${x}" y="${bottomBase - salesHeight}" width="${barWidth}" height="${salesHeight}" rx="6" fill="${colors[2]}" data-tip="${escapeAttr(`${formatDate(point.date)}: ${number.format(point.sales)} Verkäufe`)}"></rect>
      <text x="${x + barWidth / 2}" y="${Math.max(topBase + 32, bottomBase - salesHeight - 6)}" text-anchor="middle" class="chart-label">${number.format(point.sales)}</text>
      ${label ? `<text x="${x + barWidth / 2}" y="${compact ? 248 : 322}" text-anchor="middle" class="chart-note">${label}</text>` : ""}
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${compact ? 270 : 350}">
      <line x1="74" y1="${topBase}" x2="${width - 30}" y2="${topBase}" class="grid-line"></line>
      <line x1="74" y1="${bottomBase}" x2="${width - 30}" y2="${bottomBase}" class="grid-line"></line>
      <text x="10" y="${topBase - laneHeight + 8}" class="legend-text">Tastings</text>
      <text x="10" y="${bottomBase - laneHeight + 8}" class="legend-text">Verkäufe</text>
      <text x="${width - 195}" y="${compact ? 24 : 28}" class="legend-text">Grün = Tastings</text>
      <text x="${width - 98}" y="${compact ? 24 : 28}" class="legend-text">Gold = Verkäufe</text>
      ${bars}
    </svg>
  `;

  attachTooltips(container);
}

function renderMixComparison(selector, stats) {
  const container = q(selector);
  const total = Math.max(stats.shots, 1);
  const rows = [
    ["Pur", stats.pure, stats.pureShare, colors[0]],
    ["Gin & Tonic", stats.mixed, stats.mixShare, colors[2]],
  ];

  container.innerHTML = `
    <div class="mix-bars">
      ${rows.map(([label, value, share, color]) => `
        <div class="mix-row">
          <div class="mix-row__head">
            <strong>${label}</strong>
            <span>${number.format(value)} Tastings · ${percent.format(value / total)}</span>
          </div>
          <div class="mix-track">
            <div class="mix-fill" style="width:${share * 100}%; background:${color}">
              <span>${percent.format(share)}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderObstacleBars(selector, values) {
  const entries = Object.entries(values).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const container = q(selector);
  if (!entries.length) {
    container.innerHTML = emptyChart();
    return;
  }

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const max = Math.max(...entries.map(([, value]) => value));

  container.innerHTML = `
    <div class="obstacle-list">
      ${entries.map(([label, value], index) => `
        <div class="obstacle-row">
          <div class="obstacle-row__head">
            <strong>${escapeHtml(label)}</strong>
            <span>${number.format(value)} · ${percent.format(value / total)}</span>
          </div>
          <div class="obstacle-track">
            <div class="obstacle-fill" style="width:${value / max * 100}%; background:${colors[index % colors.length]}"></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function buildFeedbackClusters(rows) {
  const entries = rows.flatMap((row) => [...(row.tastingFeedback || []), ...(row.productFeedback || [])]).filter(Boolean);
  const clusters = [
    {
      label: "Tonic-Präferenz",
      keywords: ["tonic", "fever tree", "fevertree", "schweppes"],
      text: "Mehrere Rückmeldungen beziehen sich auf die konkrete Tonic-Wahl. Besonders Fever-Tree wird wiederholt als bevorzugte Begleitung genannt.",
    },
    {
      label: "Handgepäck & Reise",
      keywords: ["handgepäck", "rückflug", "rückweg", "rücktransport", "transport", "heimweg", "abreise", "urlaub"],
      text: "Die Reise- und Mitnahmesituation ist ein wiederkehrender Einwand. Besonders Rückflug und Handgepäck begrenzen spontane Käufe.",
    },
    {
      label: "Capri / Varianteninteresse",
      keywords: ["capri", "orginal", "original"],
      text: "Die Capri-Variante wird mehrfach als Gesprächsöffner und als geschmackliche Alternative zum klassischen Gin Mare genannt.",
    },
    {
      label: "Flaschengröße",
      keywords: ["große flasche", "großen flaschen", "0,7", "kleineren flaschen", "größe"],
      text: "Neben der Reisesituation wird auch die Flaschengröße selbst mehrfach als Kaufhürde beschrieben.",
    },
  ];

  return clusters
    .map((cluster) => ({
      ...cluster,
      count: entries.filter((entry) => containsAny(polish(entry).toLowerCase(), cluster.keywords)).length,
    }))
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.count - a.count);
}

function countMulti(rows, field) {
  return rows.reduce((accumulator, row) => {
    const values = row[field] && row[field].length ? row[field] : ["Nicht erfasst"];
    values.forEach((value) => {
      accumulator[value] = (accumulator[value] || 0) + 1;
    });
    return accumulator;
  }, {});
}

function groupByDateMulti(rows) {
  const grouped = {};
  rows.forEach((row) => {
    if (!row.date) return;
    if (!grouped[row.date]) {
      grouped[row.date] = { date: row.date, shots: 0, sales: 0, pure: 0, mixed: 0, count: 0, conversion: 0 };
    }
    grouped[row.date].shots += Number(row.totalShots || 0);
    grouped[row.date].sales += Number(row.salesUnits || 0);
    grouped[row.date].pure += Number(row.pureShots || 0);
    grouped[row.date].mixed += Number(row.mixedShots || 0);
    grouped[row.date].count += 1;
  });
  return Object.values(grouped)
    .map((entry) => ({ ...entry, conversion: entry.shots ? entry.sales / entry.shots : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function obstacleTotals(rows) {
  const totals = {};
  rows.forEach((row) => {
    (row.obstacles || []).forEach((obstacle) => {
      if (obstacle.toLowerCase().startsWith("sonstiges")) return;
      totals[obstacle] = (totals[obstacle] || 0) + 1;
    });
  });
  return totals;
}

function metricCard(label, value, foot) {
  return `
    <div class="metric-card">
      <span class="metric-card__label">${label}</span>
      <span class="metric-card__value">${value}</span>
      <span class="metric-card__foot">${foot}</span>
    </div>
  `;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function sumValues(object) {
  return Object.values(object).reduce((total, value) => total + value, 0);
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function q(selector) {
  return document.querySelector(selector);
}

function qa(selector) {
  return [...document.querySelectorAll(selector)];
}

function insightItem([title, text]) {
  return `<div class="insight-item"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
}

function emptyChart() {
  return `<div class="insight-item">Keine Daten in der aktuellen Filterauswahl.</div>`;
}

function formatDate(value) {
  if (!value) return "Nicht erfasst";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDateShort(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function sortHuman(a, b) {
  return String(a).localeCompare(String(b), "de", { numeric: true });
}

function rawCell(value, maxLength, className = "") {
  const text = String(value ?? "").trim();
  const short = text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  const tip = text.length > maxLength ? ` data-tip="${escapeAttr(text)}"` : "";
  return `<span class="raw-cell ${className}"${tip}>${escapeHtml(short)}</span>`;
}

function polish(text) {
  const polished = String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/vorallem/gi, "vor allem")
    .replace(/fevertree/gi, "Fever-Tree")
    .replace(/tonic water/gi, "Tonic Water")
    .replace(/nichtkäufe/gi, "Nichtkäufe")
    .replace(/nichtkauf/gi, "Nichtkauf")
    .replace(/gin tonic/gi, "Gin & Tonic")
    .replace(/gin mare capri/gi, "Gin Mare Capri")
    .replace(/mediteranes/gi, "Mediterranean")
    .replace(/orginal/gi, "Original")
    .replace(/damiteinhergehende/gi, "damit einhergehende")
    .replace(/alkoholfreiem gin/gi, "alkoholfreiem Gin")
    .replace(/mehrere kunden meinten/gi, "mehrere Kund:innen meinten")
    .trim();

  const withPeriod = /[.!?]$/.test(polished) ? polished : `${polished}.`;
  return withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1);
}

function wrapSvgLabel(value, maxLength) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function donutSlice(cx, cy, radius, thickness, start, end) {
  const largeArc = end - start > 180 ? 1 : 0;
  const outerStart = polar(cx, cy, radius, end);
  const outerEnd = polar(cx, cy, radius, start);
  const innerStart = polar(cx, cy, radius - thickness, start);
  const innerEnd = polar(cx, cy, radius - thickness, end);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${radius - thickness} ${radius - thickness} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function attachTooltips(container) {
  const tooltip = q("#tooltip");
  container.querySelectorAll("[data-tip]").forEach((element) => {
    element.addEventListener("mousemove", (event) => {
      tooltip.textContent = element.dataset.tip;
      tooltip.style.display = "block";
      tooltip.style.left = `${event.clientX + 14}px`;
      tooltip.style.top = `${event.clientY + 14}px`;
    });
    element.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}
