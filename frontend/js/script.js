// script.js - Phase 5: UI Polishing (Icons, Status Indicator)

const API_BASE_URL = '/api/data';
const UPDATE_INTERVAL = 5000; // ms for latest data refresh
const HISTORY_UPDATE_INTERVAL = 30000; // ms for historical data refresh
const HISTORY_POINTS = 30; // Number of historical points for line charts
const PROD_LOGS_API_BASE_URL = '/api/production-logs';
let latestDataIntervalId = null;
let historicalDataIntervalId = null;
const charts = {}; // Stores chart instances: { key: { chart, type, min, max, unit, valueTextElement, canvasElement, dataKey } }

// 在这里或者更早的位置 (例如，靠近其他全局常量如 API_BASE_URL)
// 定义 workshopsConfig
const workshopsConfig = [
    { uiName: 'battery', apiKey: 'battery_workshop' }, // **请根据您的实际情况调整apiKey**
    { uiName: 'welding', apiKey: 'welding_workshop' },
    { uiName: 'assembly', apiKey: 'assembly_workshop' },
    { uiName: 'testing', apiKey: 'testing_workshop' }
    // 如果有其他车间也记录生产数据，在此添加
];

// --- ICON MAPPING (Example) ---
// Map data keys (or parts of them) to Bootstrap Icon class names
const iconMap = {
    temp: 'bi-thermometer-half', // Temperature
    humidity: 'bi-moisture',    // Humidity
    pressure: 'bi-speedometer2', // Pressure gauge icon
    voltage: 'bi-lightning-charge-fill', // Voltage
    current: 'bi-lightning-charge', // Current
    level: 'bi-water',           // Liquid levels
    soc: 'bi-battery-charging', // State of Charge
    aqi: 'bi-wind',              // Air quality
    noise: 'bi-volume-up-fill',  // Noise
    rate: 'bi-percent',          // Rate/Percentage
    power: 'bi-plug-fill',       // Power
    torque: 'bi-tools',          // Torque/Tools
    result: 'bi-check2-circle',  // Result (default OK)
    status: 'bi-toggles',        // General status
    sensor: 'bi-record-circle', // Sensor status (like boolean)
    lux: 'bi-brightness-high-fill', // Brightness
    default: 'bi-bar-chart-line' // Default icon
};

function getIconForKey(key) {
    const lowerKey = key.toLowerCase();
    for (const keyword in iconMap) {
        if (lowerKey.includes(keyword)) {
            return iconMap[keyword];
        }
    }
    return iconMap.default;
}


// --- THEME TOGGLING --- (REMOVED - Now handled by theme.js)
// const themeToggleButton = document.getElementById('theme-toggle');
// const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// function getChartColors(theme) { ... } (REMOVED - Now adapted in theme.js or implicitly handled by CSS vars)
// We will need a new getChartColors that reads from the CSS variables directly without assuming a theme class on body.

// function setIconForTheme(theme) { ... } (REMOVED)
// function applyTheme(theme, isInitial = false) { ... } (REMOVED)
// function toggleTheme() { ... } (REMOVED)
// function initializeTheme() { ... } (REMOVED)

// --- NEW getChartColors that reads directly from computed styles ---
function getChartColors() {
    const style = getComputedStyle(document.documentElement); // Read from :root or :root[data-theme="dark"]
    const getCssVar = (varName, fallback) => (style.getPropertyValue(varName) || fallback).trim();
    
    // Ensure these variable names match exactly what's in style.css
    // These are the generic names, not the light/dark specific ones.
    const colors = {
        textColor: getCssVar('--text-secondary', '#6c757d'),
        gridColor: getCssVar('--border-color', '#dee2e6'),
        valueBgColor: getCssVar('--bg-tertiary', '#e9ecef'), // For gauge background
        okColor: getCssVar('--status-ok-border', '#198754'),
        nokColor: getCssVar('--status-nok-border', '#dc3545'),
        warnColor: getCssVar('--status-warn-border', '#ffc107'),
        infoColor: getCssVar('--status-info-border', '#0dcaf0'),
        idleColor: getCssVar('--status-idle-border', '#adb5bd'),
        gaugeSegmentColor: getCssVar('--gauge-segment-color', '#00529b'), // General gauge segment color
        lineColor: getCssVar('--line-color', '#007bff') // General line chart color
    };
    return colors;
}


// --- NAVIGATION ---
function setActiveNav(activePage) {
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.id === `nav-${activePage}`) {
            link.classList.add('active');
        }
    });
}

// --- CHARTING ---
function updateChartTheme(chart, theme, chartType) {
    try {
        const colors = getChartColors(); // No theme parameter needed, reads current from CSS vars
        console.log(`[Theme] Updating ${chartType} chart ${chart.canvas.id} theme. Current theme from DOM: ${document.documentElement.getAttribute('data-theme')}`);
        if (chartType === 'gauge') {
            chart.data.datasets[0].backgroundColor[1] = colors.valueBgColor;
            chart.data.datasets[0].borderColor = colors.gridColor;
            const currentStatus = chart.canvas.closest('.data-card')?.getAttribute('data-status') || 'idle';
            let segmentColor = colors.idleColor;
            if (currentStatus === 'ok') segmentColor = colors.okColor;
            else if (currentStatus === 'nok') segmentColor = colors.nokColor;
            else if (currentStatus === 'warn') segmentColor = colors.warnColor;
            else if (currentStatus === 'info') segmentColor = colors.infoColor;
            else segmentColor = colors.gaugeSegmentColor;
            chart.data.datasets[0].backgroundColor[0] = segmentColor;
        } else if (chartType === 'line') {
            chart.data.datasets[0].borderColor = colors.lineColor;
            chart.data.datasets[0].backgroundColor = colors.lineColor + '1A';
            chart.data.datasets[0].pointBackgroundColor = colors.lineColor;
            chart.data.datasets[0].pointBorderColor = colors.lineColor;
            if (chart.options.scales.x) {
                chart.options.scales.x.grid.color = colors.gridColor;
                chart.options.scales.x.ticks.color = colors.textColor;
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.grid.color = colors.gridColor;
                chart.options.scales.y.ticks.color = colors.textColor;
            }
        }
        chart.update('none');
    } catch (error) {
        console.error(`[Theme] Error updating chart theme for ${chart.canvas.id}:`, error);
    }
}

function initializeGaugeChart(key, min = 0, max = 100, unit = '') {
    const canvasId = `chart_${key}`;
    const canvasElement = document.getElementById(canvasId);
    const valueTextElement = document.getElementById(`value_${key}`);
    if (!canvasElement) {
        console.warn(`[Chart] Canvas '${canvasId}' not found for gauge.`);
        return;
    }
    if (!valueTextElement) {
        console.warn(`[Chart] Value text element 'value_${key}' not found for gauge.`);
        return;
    }
    if (charts[key]) {
        charts[key].chart.destroy();
    }
    const colors = getChartColors(); // Get current theme colors
    console.log(`[Chart] Initializing Gauge: ${key}`);
    const config = {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, max || 100],
                backgroundColor: [colors.gaugeSegmentColor, colors.valueBgColor],
                borderColor: colors.gridColor,
                borderWidth: 0.5,
                circumference: 270,
                rotation: 225,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: { duration: 600, easing: 'easeOutQuart' },
            events: []
        }
    };
    try {
        const chart = new Chart(canvasElement, config);
        charts[key] = { chart, type: 'gauge', min, max, unit, valueTextElement, canvasElement, dataKey: key };
    } catch (error) {
        console.error(`[Chart] Error initializing gauge chart ${key}:`, error);
    }
}

function initializeLineChart(key, label = 'Value', unit = '') {
    const canvasId = `chart_line_${key}`;
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) {
        console.warn(`[Chart] Canvas '${canvasId}' not found for line chart.`);
        return;
    }
    if (charts[key]) {
        charts[key].chart.destroy();
    }
    const colors = getChartColors(); // Get current theme colors
    console.log(`[Chart] Initializing Line Chart: ${key}`);
    const config = {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                fill: true,
                borderColor: colors.lineColor,
                backgroundColor: colors.lineColor + '1A',
                pointBackgroundColor: colors.lineColor,
                pointBorderColor: colors.lineColor,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: colors.lineColor,
                tension: 0.2,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    adapter: 'date-fns',
                    time: {
                        unit: 'second',
                        tooltipFormat: 'T',
                        displayFormats: { second: 'HH:mm:ss' }
                    },
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textColor,
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 7,
                        source: 'auto'
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textColor,
                        callback: (value) => value + (unit ? ' '+unit : ''),
                        afterFit: (scale) => { scale.width = 55; }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true, mode: 'index', intersect: false }
            },
            animation: { duration: 0 },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
        }
    };
    try {
        const chart = new Chart(canvasElement, config);
        charts[key] = { chart, type: 'line', unit, canvasElement, dataKey: key };
    } catch(error) {
        console.error(`[Chart] Error initializing line chart ${key}:`, error);
    }
}

// --- DATA STATUS & UPDATE LOGIC ---
function determineStatus(key, value, min = 0, max = 100) {
    let status = 'idle';
    if (value === null || value === undefined) return 'idle';
    if (typeof value === 'boolean' || value === 1 || value === 0) {
        status = Boolean(value) ? 'ok' : 'nok';
    } else if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (['ok', 'pass', 'normal', 'calibrated', 'true'].includes(lower)) status = 'ok';
        else if (['running', 'delivering', 'charging'].includes(lower)) status = 'info';
        else if (['pressed'].includes(lower)) status = 'warn';
        else if (['nok', 'fail', 'alarm', 'leak-detected', 'not-calibrated', 'fault', 'false'].includes(lower)) status = 'nok';
        else status = 'info';
    } else if (typeof value === 'number') {
        const numericValue = value;
        if (key === 'gas_ppm' && numericValue > 8) status = 'nok';
        else if (key === 'weld_quality_rate' && numericValue < 97) status = 'nok';
        else if (key === 'cooling_temp' && numericValue > 35) status = 'nok';
        else if (key === 'cleanliness_level') { if (numericValue > 15) status = 'nok'; else if (numericValue > 10) status = 'warn'; else status = 'ok'; }
        else if (key.includes('level') && max > min && numericValue < (min + (max-min)*0.1)) status = 'nok';
        else if (key.includes('level') && max > min && numericValue < (min + (max-min)*0.25)) status = 'warn';
        else if ((key.includes('temp') || key.includes('humidity') || key.includes('pressure') || key.includes('aqi') || key.includes('noise')) && max > min) {
            const range = max - min;
            if (range > 0) {
                if (numericValue > (max - range * 0.05) || numericValue < (min + range * 0.05)) status = 'nok';
                else if (numericValue > (max - range * 0.15) || numericValue < (min + range * 0.15)) status = 'warn';
                else status = 'ok';
            } else {
                status = 'ok';
            }
        } else status = 'ok';
    }
    return status;
}

function updateGaugeChart(key, value) {
    const chartInfo = charts[key];
    if (!chartInfo || chartInfo.type !== 'gauge') return;
    const { chart, min, max = 100, unit, valueTextElement, canvasElement } = chartInfo;
    const numericValue = parseFloat(value);
    let status = 'idle';
    let displayValue = '-';
    if (isNaN(numericValue) || value === null || value === undefined) {
        chart.data.datasets[0].data = [0, max || 100];
    } else {
        const validMax = max || 100;
        const clampedValue = Math.max(min, Math.min(validMax, numericValue));
        const remaining = Math.max(0, validMax - clampedValue);
        chart.data.datasets[0].data = [clampedValue, remaining];
        status = determineStatus(key, numericValue, min, validMax);
        let dp = 0;
        if (unit === '%' || unit === '°C' || unit === 'kPa' || unit === 'dB') dp = 1;
        displayValue = numericValue.toFixed(dp);
    }
    if (valueTextElement) {
        valueTextElement.textContent = displayValue;
    }
    const colors = getChartColors();
    let segmentColor = colors.idleColor;
    if (status === 'ok') segmentColor = colors.okColor;
    else if (status === 'nok') segmentColor = colors.nokColor;
    else if (status === 'warn') segmentColor = colors.warnColor;
    else if (status === 'info') segmentColor = colors.infoColor;
    else segmentColor = colors.gaugeSegmentColor;
    chart.data.datasets[0].backgroundColor[0] = segmentColor;
    const parentItem = canvasElement.closest('.data-card');
    if (parentItem) {
        parentItem.setAttribute('data-status', status);
        updateStatusIndicator(parentItem, status);
    }
    try {
        chart.update();
    } catch (e) {
        console.error(`Error updating gauge ${key}:`, e);
    }
}

function updateLineChart(key, historyData) {
    const chartInfo = charts[key];
    if (!chartInfo || chartInfo.type !== 'line') return;
    if (!Array.isArray(historyData)) {
        console.error(`[Chart] Invalid history data for ${key}:`, historyData);
        return;
    }
    const { chart, canvasElement, dataKey } = chartInfo;
    console.log(`[Chart] Updating Line Chart ${dataKey} with ${historyData.length} points`);
    const formattedData = historyData.map(item => {
        const timestamp = new Date(item.timestamp).getTime();
        const value = parseFloat(item[dataKey]);
        return (isNaN(timestamp) || isNaN(value)) ? null : { x: timestamp, y: value };
    }).filter(item => item !== null);
    if (formattedData.length === 0 && historyData.length > 0) {
        console.error(`[Chart] Failed to format history data correctly for ${dataKey}. Original:`, historyData);
        return;
    }
    chart.data.labels = formattedData.map(item => item.x);
    chart.data.datasets[0].data = formattedData;
    let lastStatus = 'idle';
    if (formattedData.length > 0) {
        const lastValue = formattedData[formattedData.length - 1].y;
        lastStatus = determineStatus(dataKey, lastValue, chart.options.scales.y.min, chart.options.scales.y.max);
    }
    const parentItem = canvasElement.closest('.data-card');
    if (parentItem) {
        parentItem.setAttribute('data-status', lastStatus);
        updateStatusIndicator(parentItem, lastStatus);
    }
    try {
        chart.update();
    } catch(e) {
        console.error(`Error updating line chart ${dataKey}:`, e);
    }
}

// **Update Text Element - Now includes Status Indicator update**
function updateTextElement(key, value) {
    const element = document.getElementById(key); // Target the span value element
    if (element) {
        const parentItem = element.closest('.data-card');
        if(!parentItem) {console.error(`No parent for ${key}`); return;}
        element.className = 'data-card-value'; // Reset classes
        let displayValue = '-'; let status = determineStatus(key, value);
        if (value !== null && value !== undefined) {
            if (typeof value === 'boolean') { displayValue = value ? '正常' : '异常'; }
            else if (typeof value === 'number') {
                let dp = 0;
                if (['voltage', 'angle', 'torque'].some(k => key.includes(k))) dp = 2;
                else if (value % 1 !== 0 && !['level', 'ppm', 'aqi', 'resistance', 'lux', 'cleanliness_level'].some(k => key.includes(k))) dp = 1;
                displayValue = value.toFixed(dp);
            } else { displayValue = value; }
        } else { status = 'idle'; }
        element.textContent = displayValue;
        parentItem.setAttribute('data-status', status); // Set status on parent card
        updateStatusIndicator(parentItem, status); // Update the text indicator
    } else { /* console.warn(`[Update] Text element '${key}' not found.`); */ }
}

// **NEW: Update Status Indicator Text/Class**
function updateStatusIndicator(cardElement, status) {
    const indicator = cardElement.querySelector('.data-card-status-indicator');
    if (indicator) {
        indicator.textContent = status; // Display status text (ok, nok, warn, info, idle)
        indicator.className = `data-card-status-indicator status-${status}`; // Apply class for styling
    }
}


// Unified update dispatcher
function processDataUpdate(key, value) {
    if (charts[key] && charts[key].type === 'gauge') { updateGaugeChart(key, value); }
    else if (document.getElementById(key)) { updateTextElement(key, value); }
    // Check if a status indicator exists for this key even if it's a line chart card
    else {
        const parentCard = document.querySelector(`.data-card[data-key="${key}"]`);
        if (parentCard) {
            const status = determineStatus(key, value); // Still determine status
            parentCard.setAttribute('data-status', status);
            updateStatusIndicator(parentCard, status);
        }
    }
}

// --- DATA FETCHING ---
async function fetchLatestData(workshopName) {
    const lastUpdatedElement = document.getElementById('last-updated');
    try {
        console.log(`[FETCH Latest] Fetching for ${workshopName}...`);
        const response = await fetch(`${API_BASE_URL}/${workshopName}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`[FETCH Latest] Received for ${workshopName}:`, JSON.stringify(data));
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            // Process data updates first
            for (const key in data) {
                if (key !== 'id' && key !== 'timestamp' && key !== 'timestamp_locale') {
                    processDataUpdate(key, data[key]);
                }
            }
            // Update the timestamp AFTER successful data processing
            if (lastUpdatedElement) {
                const now = new Date();
                // Force Beijing Time (Asia/Shanghai timezone)
                const formattedTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); 
                lastUpdatedElement.textContent = `最后更新时间: ${formattedTime}`;
            }
        } else {
            console.warn(`[FETCH Latest] No valid data object received for ${workshopName}.`);
            resetUIStatus(workshopName, 'idle');
            if (lastUpdatedElement) {
                lastUpdatedElement.textContent = '最后更新时间: 等待数据...';
            }
        }
    } catch (error) {
        console.error(`[FETCH Latest] Failed for ${workshopName}:`, error);
        if (lastUpdatedElement) lastUpdatedElement.textContent = `最新数据加载错误`;
        resetUIStatus(workshopName, 'nok');
    }
}

async function fetchHistoricalData(workshopName, metrics = []) {
    if (!Array.isArray(metrics) || metrics.length === 0) return;
    console.log(`[FETCH History] Fetching for ${workshopName}, metrics: ${metrics.join(', ')}`);
    for (const metric of metrics) {
        try {
            const response = await fetch(`${API_BASE_URL}/${workshopName}/history/${metric}?limit=${HISTORY_POINTS}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const historyData = await response.json();
            console.log(`[FETCH History] Received ${historyData.length} points for ${metric}`);
            if (charts[metric] && charts[metric].type === 'line') {
                updateLineChart(metric, historyData);
            } else {
                /* console.warn(`[FETCH History] Line chart for metric '${metric}' not found.`); */
            }
        } catch (error) {
            console.error(`[FETCH History] Failed for ${workshopName}.${metric}:`, error);
            const chartInfo = charts[metric];
            if(chartInfo?.canvasElement) {
                const parentItem = chartInfo.canvasElement.closest('.data-card');
                if(parentItem) parentItem.setAttribute('data-status', 'nok');
            }
        }
    }
}

function resetUIStatus(workshopName, status = 'idle') {
    console.warn(`[UI Reset] Resetting UI for ${workshopName} to status: ${status}`);
    document.querySelectorAll('.data-card').forEach(item => {
        item.setAttribute('data-status', status);
        updateStatusIndicator(item, status);
        const valueEl = item.querySelector('.data-card-value');
        const gaugeValueEl = item.querySelector('.gauge-value-text');
        const text = (status === 'nok') ? '错误' : '-';
        if(valueEl) {
            valueEl.textContent = text;
            valueEl.className = 'data-card-value';
            valueEl.classList.add(`status-${status}`);
        }
        if(gaugeValueEl) gaugeValueEl.textContent = text;
        const chartKey = item.dataset.key;
        if(charts[chartKey] && charts[chartKey].type === 'gauge') {
            updateGaugeChart(chartKey, null);
        }
    });
}

// Start/Stop Fetching (保持不变)
function startDataFetching(workshopName, lineChartKeys = []) {
    console.log(`[System] Starting data fetching for workshop: ${workshopName}`);
    stopDataFetching();
    fetchLatestData(workshopName);
    if (lineChartKeys && lineChartKeys.length > 0) {
        fetchHistoricalData(workshopName, lineChartKeys);
    }
    latestDataIntervalId = setInterval(() => fetchLatestData(workshopName), UPDATE_INTERVAL);
    if (lineChartKeys && lineChartKeys.length > 0) {
        historicalDataIntervalId = setInterval(() => fetchHistoricalData(workshopName, lineChartKeys), HISTORY_UPDATE_INTERVAL);
    }
    console.log(`[System] Intervals started. Latest: ${latestDataIntervalId}, History: ${historicalDataIntervalId}`);
}

function stopDataFetching() {
    console.log(`[System] Stopping data fetching intervals. Latest: ${latestDataIntervalId}, History: ${historicalDataIntervalId}`);
    if (latestDataIntervalId) clearInterval(latestDataIntervalId);
    if (historicalDataIntervalId) clearInterval(historicalDataIntervalId);
    latestDataIntervalId = null;
    historicalDataIntervalId = null;
}

// --- DEBUGGING BUTTON ---
function setupDebugButton(workshopName, lineChartKeys = []) {
    const debugButton = document.getElementById('debug-button');
    const debugOutput = document.getElementById('debug-output');
    if (debugButton && debugOutput) {
        debugButton.style.display = 'block';
        debugOutput.style.display = 'none';
        debugButton.onclick = async () => {
            debugOutput.textContent = `--- Debug Fetch @ ${new Date().toLocaleTimeString()} for ${workshopName} ---\nFetching Latest...\n`;
            debugOutput.style.display = 'block';
            try {
                const latestResponse = await fetch(`${API_BASE_URL}/${workshopName}`);
                const latestData = await latestResponse.json();
                debugOutput.textContent += `LATEST Status: ${latestResponse.status}\nResponse:\n${JSON.stringify(latestData, null, 2)}\n\n`;
                if(!latestResponse.ok) debugOutput.textContent += `LATEST FETCH ERROR: ${latestResponse.statusText}\n`;
                for (const metric of lineChartKeys) {
                    debugOutput.textContent += `Workspaceing History (${metric})...\n`;
                    const historyResponse = await fetch(`${API_BASE_URL}/${workshopName}/history/${metric}?limit=5`);
                    const historyData = await historyResponse.json();
                    debugOutput.textContent += `HISTORY (${metric}) Status: ${historyResponse.status}\nResponse:\n${JSON.stringify(historyData, null, 2)}\n\n`;
                    if(!historyResponse.ok) debugOutput.textContent += `HISTORY FETCH ERROR (${metric}): ${historyResponse.statusText}\n`;
                }
                debugOutput.textContent += `--- CHARTS INITIALIZED ---\n${Object.keys(charts).join(', ')}\n`;
            } catch (error) {
                debugOutput.textContent += `--- FETCH/PROCESS ERROR ---\n${error.message}\n${error.stack || ''}`;
            }
            setTimeout(() => { if(debugOutput) debugOutput.style.display = 'none'; }, 30000);
        };
        console.log("[Debug] Debug button setup complete.");
    } else {
        console.warn("[Debug] Debug button or output area not found in HTML.");
    }
}

// --- GLOBAL ACCESS & INIT ---
window.setActiveNav = setActiveNav;
window.initializeGaugeChart = initializeGaugeChart;
window.initializeLineChart = initializeLineChart;
window.startDataFetching = startDataFetching;
window.setupDebugButton = setupDebugButton;
window.stopDataFetching = stopDataFetching;

// Cleanup on page leave
window.addEventListener('beforeunload', stopDataFetching);

console.log("[System] script.js (Phase 5 - UI Polishing) loaded.");

// --- DATA EXPORT ---

// Helper function to get current data from charts and elements
function getCurrentWorkshopData(workshopName) {
    const data = {};
    const timestamp = new Date().toISOString();

    // Get data from all cards on the page
    document.querySelectorAll('.data-card').forEach(card => {
        const key = card.getAttribute('data-key');
        if (!key) return;

        const labelElement = card.querySelector('.data-card-label');
        const label = labelElement ? labelElement.textContent.trim() : key;

        if (charts[key]) {
            const chartInfo = charts[key];
            if (chartInfo.type === 'gauge') {
                const valueElement = chartInfo.valueTextElement;
                const value = valueElement ? valueElement.textContent.trim() : 'N/A';
                 data[key] = { label: `${label} (${chartInfo.unit || ''})`, value: value, timestamp: timestamp };
            } else if (chartInfo.type === 'line') {
                // Try to get the latest point from the chart's data
                const chartData = chartInfo.chart.data.datasets[0].data;
                 if (chartData.length > 0) {
                     const latestPoint = chartData[chartData.length - 1];
                     data[key] = {
                         label: `${label} (Latest Trend - ${chartInfo.unit || ''})`,
                         value: latestPoint.y ?? 'N/A', // Use latest y value
                         timestamp: new Date(latestPoint.x).toISOString() ?? timestamp // Use timestamp of latest point if available
                     };
                 } else {
                     data[key] = { label: `${label} (Latest Trend - ${chartInfo.unit || ''})`, value: 'N/A', timestamp: timestamp };
                 }
                // Also store the historical data if needed later
                 data[`${key}_history`] = {
                    label: `${label} (Historical Trend - ${chartInfo.unit || ''})`,
                    history: chartData.map(p => ({ timestamp: new Date(p.x).toISOString(), value: p.y }))
                };
            }
        } else {
            // Handle simple data cards without charts
            const valueElement = card.querySelector('.data-card-value');
            if (valueElement) {
                const value = valueElement.textContent.trim();
                data[key] = { label: label, value: value, timestamp: timestamp };
            }
        }
    });
    console.log("[Export] Collected data:", data);
    return data;
}

// Function to convert data to CSV format
function convertDataToCSV(workshopData) {
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = ["Timestamp", "Label", "Value", "Unit/Notes"];
    csvContent += headers.join(",") + "\r\n";

    for (const key in workshopData) {
        const item = workshopData[key];
        if (item.history) {
             // Handle historical data separately
             item.history.forEach(point => {
                const row = [
                    `"${point.timestamp}"`,
                    `"${item.label.replace(' (Historical Trend)', '')}"`,
                    `"${point.value ?? 'N/A'}"`,
                    "Historical Point"
                ];
                csvContent += row.join(",") + "\r\n";
             });
        } else if (item.value !== undefined && item.timestamp && item.label) {
            // Handle single value points (gauges, simple cards, latest line point)
            const row = [
                `"${item.timestamp}"`,
                `"${item.label}"`,
                `"${item.value}"`,
                 ""
            ];
            csvContent += row.join(",") + "\r\n";
        }
    }
    return csvContent;
}


// Function to trigger CSV download
function downloadCSV(csvContent, workshopName) {
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    link.setAttribute("download", `${workshopName}_data_export_${timestamp}.csv`);
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
    console.log("[Export] CSV download triggered.");
}

// Main export function
function exportDataToCSV(workshopName) {
    console.log(`[Export] Starting data export for workshop: ${workshopName}`);
    try {
        const workshopData = getCurrentWorkshopData(workshopName);
        if (Object.keys(workshopData).length === 0) {
            console.warn("[Export] No data collected for export.");
            alert("沒有可導出的數據。");
            return;
        }
        const csvData = convertDataToCSV(workshopData);
        downloadCSV(csvData, workshopName);
    } catch (error) {
        console.error("[Export] Error during data export:", error);
        alert(`導出數據時發生錯誤: ${error.message}`);
    }
}

// Function to setup the export button listener
function setupExportButton(workshopName) {
    const exportButton = document.getElementById('export-data-button');
    if (exportButton) {
        console.log(`[Export] Setting up export button for ${workshopName}`);
        // Remove existing listener to prevent duplicates if re-initialized
        exportButton.removeEventListener('click', window[`exportHandler_${workshopName}`]);

        // Create a named handler to allow removal later
        window[`exportHandler_${workshopName}`] = () => exportDataToCSV(workshopName);

        exportButton.addEventListener('click', window[`exportHandler_${workshopName}`]);
    } else {
        console.warn(`[Export] Export button not found for workshop ${workshopName}`);
    }
}

// Hamburger Menu Toggle
document.addEventListener('DOMContentLoaded', () => {
    const navToggleBtn = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('#nav-menu');

    if (navToggleBtn && navMenu) {
        navToggleBtn.addEventListener('click', () => {
            navMenu.classList.toggle('nav-menu-opened');
            navToggleBtn.classList.toggle('active'); // For icon change if using CSS to swap icons
            
            // Update ARIA attribute
            const isExpanded = navMenu.classList.contains('nav-menu-opened');
            navToggleBtn.setAttribute('aria-expanded', isExpanded);

            // Optional: Change icon class directly if not handled by CSS only
            const icon = navToggleBtn.querySelector('i');
            if (icon) {
                if (isExpanded) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }
});

// --- Helper function to get dates ---
function getDatesForAnalysis() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfMonthStr = firstDayOfMonth.toISOString().split('T')[0];

    return {
        today: todayStr,
        firstDayOfMonth: firstDayOfMonthStr,
    };
}

// --- Function to fetch and display production analysis data ---
async function fetchProductionAnalysis(workshopName, workshopKeyForAPI) {
    const apiWorkshopName = workshopKeyForAPI || workshopName;
    const dates = getDatesForAnalysis();
    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
        console.warn(`[Analysis] Auth token not found for ${workshopName}. Skipping production analysis fetch.`);
        updateProductionAnalysisUI(workshopName, null, null, null, 'auth_error'); // Pass nulls for data args
        return;
    }

    let todayData, monthlyData, recentLogsData;

    try {
        console.log(`[Analysis] Fetching Today's Production Data for ${workshopName} (API key: ${apiWorkshopName}), date: ${dates.today}`);
        const todayResponse = await fetch(`${PROD_LOGS_API_BASE_URL}/${apiWorkshopName}/aggregated?startDate=${dates.today}&endDate=${dates.today}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!todayResponse.ok) {
            if (todayResponse.status === 401 || todayResponse.status === 403) {
                handleAuthError(); // This will redirect
                return; // Stop further execution in this function
            }
            throw new Error(`HTTP error for today's data! Status: ${todayResponse.status}`);
        }
        todayData = await todayResponse.json();
        console.log(`[Analysis] Today's data for ${workshopName}:`, todayData);

        console.log(`[Analysis] Fetching Monthly Production Data for ${workshopName} (API key: ${apiWorkshopName}), from: ${dates.firstDayOfMonth} to: ${dates.today}`);
        const monthlyResponse = await fetch(`${PROD_LOGS_API_BASE_URL}/${apiWorkshopName}/aggregated?startDate=${dates.firstDayOfMonth}&endDate=${dates.today}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!monthlyResponse.ok) {
            if (monthlyResponse.status === 401 || monthlyResponse.status === 403) {
                handleAuthError();
                return;
            }
            throw new Error(`HTTP error for monthly data! Status: ${monthlyResponse.status}`);
        }
        monthlyData = await monthlyResponse.json();
        console.log(`[Analysis] Monthly data for ${workshopName}:`, monthlyData);

        const recentLogsLimit = 7;
        console.log(`[Analysis] Fetching Recent Production Logs for ${workshopName} (API key: ${apiWorkshopName}), limit: ${recentLogsLimit}`);
        const recentLogsResponse = await fetch(`${PROD_LOGS_API_BASE_URL}/${apiWorkshopName}/recent?limit=${recentLogsLimit}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!recentLogsResponse.ok) {
            if (recentLogsResponse.status === 401 || recentLogsResponse.status === 403) {
                handleAuthError();
                return;
            }
            throw new Error(`HTTP error for recent logs! Status: ${recentLogsResponse.status}`);
        }
        recentLogsData = await recentLogsResponse.json();
        console.log(`[Analysis] Recent logs for ${workshopName}:`, recentLogsData);

        // Corrected call to updateProductionAnalysisUI
        updateProductionAnalysisUI(workshopName, todayData, monthlyData, recentLogsData);

    } catch (error) {
        console.error(`[Analysis] Failed to fetch production analysis for ${workshopName}:`, error);
        // If handleAuthError was called, it would have redirected. 
        // If we reach here, it's a general fetch error.
        updateProductionAnalysisUI(workshopName, null, null, null, 'fetch_error');
    }
}

// --- Function to update production analysis UI elements ---
function updateProductionAnalysisUI(workshopName, dailyData, monthlyData, recentLogs, errorType = null) {
    const workshopElement = document.getElementById(`workshop-${workshopName}`);
    if (!workshopElement) {
        console.error(`[Analysis UI] Workshop element for ${workshopName} not found.`);
        return;
    }

    const dailyTargetElement = workshopElement.querySelector('.daily-target-value');
    const dailyActualElement = workshopElement.querySelector('.daily-actual-value');
    const dailyRateElement = workshopElement.querySelector('.daily-rate-value');
    const monthlyTargetElement = workshopElement.querySelector('.monthly-target-value');
    const monthlyActualElement = workshopElement.querySelector('.monthly-actual-value');
    const monthlyRateElement = workshopElement.querySelector('.monthly-rate-value');
    const analysisErrorElement = workshopElement.querySelector('.production-analysis-error');
    const analysisContainer = workshopElement.querySelector('.production-analysis-data');

    if (errorType) {
        if(analysisContainer) analysisContainer.style.display = 'none';
        if(analysisErrorElement) {
            analysisErrorElement.textContent = errorType === 'auth_error' ? '无权访问生产数据，请重新登录。' : '加载生产分析数据失败。';
            analysisErrorElement.style.display = 'block';
        }
        // Clear any existing chart if there's an error
        if (recentProductivityChartInstances[workshopName]) {
            recentProductivityChartInstances[workshopName].destroy();
            delete recentProductivityChartInstances[workshopName];
        }
        return;
    }

    if(analysisErrorElement) analysisErrorElement.style.display = 'none';
    if(analysisContainer) analysisContainer.style.display = 'block';


    // Fallback to "--" if data is null or undefined
    const D_TARGET = workshopsConfig[workshopName]?.productionTargets?.daily || 0;
    const M_TARGET = workshopsConfig[workshopName]?.productionTargets?.monthly || 0;

    const dailyActual = dailyData?.data?.total_produced ?? 0;
    const dailyQualified = dailyData?.data?.qualified_units ?? 0;

    if (dailyTargetElement) dailyTargetElement.textContent = D_TARGET;
    if (dailyActualElement) dailyActualElement.textContent = `${dailyActual} (合格: ${dailyQualified})`;
    if (dailyRateElement) {
        const rate = D_TARGET > 0 ? ((dailyActual / D_TARGET) * 100).toFixed(1) : 0;
        dailyRateElement.textContent = `${rate}%`;
        dailyRateElement.className = 'data-value daily-rate-value'; // Reset classes
        if (parseFloat(rate) >= 100) {
            dailyRateElement.classList.add('rate-good');
        } else if (parseFloat(rate) >= 80) {
            dailyRateElement.classList.add('rate-ok');
        } else {
            dailyRateElement.classList.add('rate-bad');
        }
    }

    const monthlyActual = monthlyData?.data?.total_produced ?? 0;
    const monthlyQualified = monthlyData?.data?.qualified_units ?? 0;

    if (monthlyTargetElement) monthlyTargetElement.textContent = M_TARGET;
    if (monthlyActualElement) monthlyActualElement.textContent = `${monthlyActual} (合格: ${monthlyQualified})`;
    if (monthlyRateElement) {
        const rate = M_TARGET > 0 ? ((monthlyActual / M_TARGET) * 100).toFixed(1) : 0;
        monthlyRateElement.textContent = `${rate}%`;
        monthlyRateElement.className = 'data-value monthly-rate-value'; // Reset classes
        if (parseFloat(rate) >= 100) {
            monthlyRateElement.classList.add('rate-good');
        } else if (parseFloat(rate) >= 80) {
            monthlyRateElement.classList.add('rate-ok');
        } else {
            monthlyRateElement.classList.add('rate-bad');
        }
    }

    // --- Recent Productivity Chart (Last 7 days) ---
    const recentProductivityCtx = document.getElementById(`recent-productivity-chart-${workshopName}`);
    if (!recentProductivityCtx) {
        console.warn(`[Analysis UI] Recent productivity chart canvas not found for ${workshopName}`);
        return; // Exit if canvas not found, but after updating other stats
    }

    if (recentProductivityChartInstances[workshopName]) {
        recentProductivityChartInstances[workshopName].destroy();
    }

    let labels = [];
    let totalProducedData = [];
    let qualifiedUnitsData = [];
    let allYValues = []; // To calculate max Y for the chart

    if (recentLogs && recentLogs.data && recentLogs.data.length > 0) {
        // Sort data by date to ensure correct trend line
        recentLogs.data.sort((a, b) => new Date(a.log_date) - new Date(b.log_date));

        recentLogs.data.forEach(log => {
            labels.push(new Date(log.log_date).toLocaleDateString('sv-SE')); // YYYY-MM-DD for consistency
            totalProducedData.push(log.total_produced);
            qualifiedUnitsData.push(log.qualified_units);
            allYValues.push(log.total_produced, log.qualified_units);
        });
    } else if (errorType !== 'api_error' && errorType !== 'auth_error') {
         // Simulate data only if there's no actual API or auth error, and no data received
        if (workshopName === 'welding_workshop' || workshopName === 'painting_workshop' || workshopName === 'assembly_workshop') {
            console.warn(`[Analysis UI SIMULATION] No recent logs for ${workshopName}. Using simulated data for trend chart.`);
            const today = new Date();
            for (let i = 6; i >= 0; i--) { // Last 7 days including today
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                labels.push(date.toLocaleDateString('sv-SE'));
                const simulatedTotal = Math.floor(Math.random() * (workshopName === 'welding_workshop' ? 150 : 120)) + (workshopName === 'welding_workshop' ? 30 : 20) ; // Base + random
                const simulatedQualified = Math.floor(simulatedTotal * (0.85 + Math.random() * 0.14)); // 85-99% qualification
                totalProducedData.push(simulatedTotal);
                qualifiedUnitsData.push(simulatedQualified);
                allYValues.push(simulatedTotal, simulatedQualified);
            }
            if(recentLogs) recentLogs.data = []; // Ensure it's an array for consistency if it was null/undefined
            console.log(`[Analysis UI SIMULATION] Injected simulated recent logs for ${workshopName}:`, totalProducedData.map((val, idx) => ({ date: labels[idx], total: val, qualified: qualifiedUnitsData[idx] })));
        }
    }


    const currentAbsMax = allYValues.length > 0 ? Math.max(...allYValues.map(v => Number(v) || 0)) : 0; // Ensure values are numbers
    let suggestedMaxY;

    if (currentAbsMax === 0) {
        suggestedMaxY = 10; // Default max if all data is 0 or no data
    } else {
        const paddedMax = currentAbsMax * 1.20; // Add 20% padding
        if (paddedMax <= 10) {
            suggestedMaxY = 10; // Min sensible max
        } else if (paddedMax <= 50) {
            suggestedMaxY = Math.ceil(paddedMax / 5) * 5;   // Round up to nearest 5
        } else if (paddedMax <= 200) {
            suggestedMaxY = Math.ceil(paddedMax / 10) * 10;  // Round up to nearest 10
        } else {
            suggestedMaxY = Math.ceil(paddedMax / 50) * 50; // Round up to nearest 50 for larger numbers
        }
    }
    
    // Specific debug log for welding workshop to trace Y-axis calculation
    if (workshopName === 'welding_workshop' || workshopName.includes('welding')) { // More robust check
        console.log(`[Analysis UI Debug - ${workshopName}] Y-axis calculation: currentAbsMax = ${currentAbsMax}, suggestedMaxY = ${suggestedMaxY}. Data points: ${allYValues.length}`);
    }


    recentProductivityChartInstances[workshopName] = new Chart(recentProductivityCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '总产量',
                    data: totalProducedData,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--chart-color-total') || 'rgba(54, 162, 235, 1)',
                    backgroundColor: getTransparentColor(getComputedStyle(document.documentElement).getPropertyValue('--chart-color-total') || 'rgba(54, 162, 235, 1)', 0.3),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2, // Smoother lines
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: '合格品数量',
                    data: qualifiedUnitsData,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--chart-color-qualified') || 'rgba(75, 192, 192, 1)',
                    backgroundColor: getTransparentColor(getComputedStyle(document.documentElement).getPropertyValue('--chart-color-qualified') || 'rgba(75, 192, 192, 1)', 0.3),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: suggestedMaxY, // Apply the calculated max
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text-color') || '#666',
                        // stepSize: suggestedMaxY > 50 ? 10 : 5 // Optional: suggest step size
                    }
                },
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text-color') || '#666',
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text-color') || '#666',
                        usePointStyle: true,
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary') || '#fff',
                    titleColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#333',
                    bodyColor: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') || '#555',
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border-color') || '#ddd',
                    borderWidth: 1,
                    padding: 10,
                    usePointStyle: true,
                }
            },
            animation: {
                duration: 500 // Smoother initial animation
            }
        }
    });
}

function handleAuthError() {
    console.error("Authentication error or session expired. Redirecting to login.");
    localStorage.setItem('redirectMessage', '会话已过期或权限不足，请重新登录。');
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    window.location.href = '../html/login.html';
}

// 确保 DOMContentLoaded 的监听器在 workshopsConfig 定义之后
document.addEventListener('DOMContentLoaded', () => {
    // ... 您可能已有的其他 DOMContentLoaded 初始化代码 (如主题切换、汉堡菜单等)

    console.log("[Analysis Init] DOMContentLoaded - Setting up production analysis fetching.");

    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        console.warn("[Analysis Init] No auth token found on page load. Production analysis data might not load or show 'Permission Denied'.");
    }

    // 现在 workshopsConfig 应该是已定义的
    if (typeof workshopsConfig !== 'undefined' && workshopsConfig) { // 添加一个检查确保它真的定义了
        workshopsConfig.forEach(ws => {
            if (document.getElementById(`${ws.uiName}_today_produced`)) {
                console.log(`[Analysis Init] Requesting production analysis for UI key: ${ws.uiName} (using API key: ${ws.apiKey})`);
                fetchProductionAnalysis(ws.uiName, ws.apiKey);
            } else {
                // console.log(`[Analysis Init] HTML elements for ${ws.uiName} production analysis not found. Skipping fetch.`);
            }
        });
        // ... (可选的 setInterval)
    } else {
        console.error("[Analysis Init] workshopsConfig is NOT defined. Cannot fetch production analysis data.");
    }
}); 