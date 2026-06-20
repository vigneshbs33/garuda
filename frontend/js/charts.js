/**
 * GARUDA Frontend — Charts (Chart.js)
 * =====================================
 * All chart instances managed here.
 * Easy to swap: just replace Chart.js calls with Recharts equivalents.
 */

const GarudaCharts = (() => {
  const ACCENT   = '#00d4ff';
  const SUCCESS  = '#00e676';
  const WARNING  = '#ff9800';
  const DANGER   = '#f44336';
  const MUTED    = '#7a8099';
  const BG_CARD  = '#131928';
  const BORDER   = '#1e2a40';

  const TYPE_COLORS = {
    helmet_non_compliance:   '#f44336',
    seatbelt_non_compliance: '#ff9800',
    triple_riding:           '#ff5722',
    red_light_violation:     '#e91e63',
    stop_line_violation:     '#9c27b0',
    wrong_side_driving:      '#3f51b5',
    illegal_parking:         '#607d8b',
    phone_use_while_driving: '#ff6d00',
    drowsy_driving:          '#d50000',
  };

  // Chart.js global defaults
  Chart.defaults.color = MUTED;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.padding = 14;

  const _instances = {};

  function _destroy(id) {
    if (_instances[id]) {
      _instances[id].destroy();
      delete _instances[id];
    }
  }

  // ---- Trends line chart ----
  function renderTrends(canvasId, dataPoints) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = dataPoints.map(d => d.date);
    const values = dataPoints.map(d => d.count);

    _instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Violations',
          data: values,
          borderColor: ACCENT,
          backgroundColor: `${ACCENT}18`,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: ACCENT,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: BORDER },
            ticks: { maxTicksLimit: 10 },
          },
          y: {
            grid: { color: BORDER },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ---- Doughnut — violation types ----
  function renderTypesDoughnut(canvasId, breakdown) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !breakdown?.length) return;

    const labels = breakdown.map(b => b.violation_type.replace(/_/g, ' '));
    const values = breakdown.map(b => b.count);
    const colors = breakdown.map(b => TYPE_COLORS[b.violation_type] || ACCENT);

    _instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.map(c => `${c}cc`),
          borderColor: colors,
          borderWidth: 1,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 10 } },
          },
        },
        cutout: '65%',
      },
    });
  }

  // ---- Tier split bar chart ----
  function renderTierSplit(canvasId, summary) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    _instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Tier 1 (Auto)', 'Tier 2 (Review)', 'Tier 3 (Logged)'],
        datasets: [{
          label: 'Violations',
          data: [
            summary.auto_challan_count || 0,
            summary.human_review_count || 0,
            (summary.total_this_week || 0) - (summary.auto_challan_count || 0) - (summary.human_review_count || 0),
          ],
          backgroundColor: [`${SUCCESS}88`, `${WARNING}88`, `${MUTED}44`],
          borderColor:     [SUCCESS, WARNING, MUTED],
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: BORDER } },
          y: { grid: { color: BORDER }, beginAtZero: true },
        },
      },
    });
  }

  // ---- Live mini doughnut (small, no legend) ----
  function renderLiveMini(canvasId, breakdown) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !breakdown?.length) return;

    const top5 = breakdown.slice(0, 5);
    _instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: top5.map(b => b.violation_type.replace(/_/g, ' ')),
        datasets: [{
          data: top5.map(b => b.count),
          backgroundColor: top5.map(b => `${TYPE_COLORS[b.violation_type] || ACCENT}cc`),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 9 }, boxWidth: 8, padding: 8 } },
        },
        cutout: '60%',
      },
    });
  }

  function updateChart(id, newData) {
    const chart = _instances[id];
    if (!chart) return;
    chart.data.datasets[0].data = newData;
    chart.update('active');
  }

  return {
    renderTrends,
    renderTypesDoughnut,
    renderTierSplit,
    renderLiveMini,
    updateChart,
    TYPE_COLORS,
  };
})();
