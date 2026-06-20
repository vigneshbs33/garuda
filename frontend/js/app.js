/**
 * GARUDA Frontend — Main Application Controller
 * ================================================
 * Orchestrates all views, data loading, and event handling.
 * No framework deps — your friend can port this to React/Vue easily.
 */

// ===== STATE =====
const State = {
  currentView:  'live',
  currentPage:  1,
  pageSize:     20,
  totalPages:   1,
  violations:   [],
  cameras:      [],
  summary:      null,
  mapInitialized: false,
};

// ===== TOASTS =====
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ===== VIEW NAVIGATION =====
function showView(name) {
  State.currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${name}`);
  const nav  = document.getElementById(`nav-${name}`);
  if (view) view.classList.remove('hidden');
  if (nav)  nav.classList.add('active');

  const titles = {
    live:       ['Live Feed',    'Real-time detections'],
    violations: ['Violations',   'Full history with filters'],
    review:     ['Review Queue', 'Tier 2 — Awaiting officer action'],
    analytics:  ['Analytics',    'Statistics and trends'],
    map:        ['Heatmap',      'Violation density by location'],
    cameras:    ['Cameras',      'Manage camera network'],
  };
  const [title, sub] = titles[name] || ['', ''];
  document.getElementById('view-title').textContent    = title;
  document.getElementById('view-subtitle').textContent = sub;

  feather.replace();
  refreshCurrentView();
}

function refreshCurrentView() {
  switch (State.currentView) {
    case 'live':       loadLiveStats();   break;
    case 'violations': loadViolations();  break;
    case 'review':     loadReviewQueue(); break;
    case 'analytics':  loadAnalytics();   break;
    case 'map':        loadMap();         break;
    case 'cameras':    loadCameras();     break;
  }
}

// ===== LIVE VIEW =====
function loadLiveStats() {
  API.getAnalyticsSummary()
    .then(s => {
      State.summary = s;
      document.getElementById('stat-today').textContent   = `${s.total_today} today`;
      document.getElementById('stat-review').textContent  = `${s.human_review_count} pending`;
      document.getElementById('badge-pending').textContent = s.total_today;
      document.getElementById('badge-review').textContent  = s.human_review_count;

      // Mini stats grid
      document.querySelector('#ms-total .mini-stat-val').textContent  = s.total_today;
      document.querySelector('#ms-tier1 .mini-stat-val').textContent  = s.auto_challan_count;
      document.querySelector('#ms-tier2 .mini-stat-val').textContent  = s.human_review_count;

      GarudaCharts.renderLiveMini('chart-live-doughnut', s.violation_type_breakdown);
    })
    .catch(() => {});

  API.getCameras()
    .then(cams => {
      document.querySelector('#ms-cameras .mini-stat-val').textContent = cams.length;
      State.cameras = cams;
    })
    .catch(() => {});
}

// ===== VIOLATIONS VIEW =====
function loadViolations() {
  const tier   = document.getElementById('filter-tier')?.value   || '';
  const type   = document.getElementById('filter-type')?.value   || '';
  const status = document.getElementById('filter-status')?.value || '';

  API.getViolations({
    page:     State.currentPage,
    pageSize: State.pageSize,
    tier:     tier   || undefined,
    type:     type   || undefined,
    status:   status || undefined,
  }).then(data => {
    State.violations = data.violations;
    State.totalPages = Math.ceil(data.total / State.pageSize);
    renderViolationsTable(data.violations);
    document.getElementById('page-info').textContent =
      `Page ${data.page} of ${State.totalPages} (${data.total} total)`;
    document.getElementById('btn-prev').disabled = data.page <= 1;
    document.getElementById('btn-next').disabled = data.page >= State.totalPages;
  }).catch(e => toast('Failed to load violations: ' + e.message, 'error'));
}

function renderViolationsTable(violations) {
  const tbody = document.getElementById('violations-tbody');
  if (!violations.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No violations found</td></tr>';
    return;
  }

  tbody.innerHTML = violations.map(v => `
    <tr onclick="openViolationModal('${v.id}')" style="cursor:pointer">
      <td class="mono" title="${v.id}">${v.id.slice(0, 18)}…</td>
      <td>${formatTime(v.timestamp)}</td>
      <td class="mono" style="font-size:0.72rem">${v.camera_id}</td>
      <td><span class="vtype-chip">${v.violation_type.replace(/_/g,' ')}</span></td>
      <td>
        <div class="conf-bar-wrap"><div class="conf-bar" style="width:${v.confidence*100}%"></div></div>
        <span style="font-size:0.72rem;color:var(--text-muted)">${(v.confidence*100).toFixed(0)}%</span>
      </td>
      <td><span class="tier-badge tier-${v.tier}">T${v.tier}</span></td>
      <td class="mono" style="color:var(--success)">${v.plate_text || '—'}</td>
      <td><span class="status-chip status-${v.status}">${v.status.replace(/_/g,' ')}</span></td>
      <td>
        ${v.status === 'pending' ? `
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation();confirmV('${v.id}')">✓</button>
            <button class="btn btn-sm btn-danger"  onclick="event.stopPropagation();rejectV('${v.id}')">✗</button>
          </div>` : `<span style="color:var(--text-dim);font-size:0.72rem">${v.status}</span>`}
      </td>
    </tr>
  `).join('');

  feather.replace();
}

function filterViolations() {
  State.currentPage = 1;
  loadViolations();
}

function changePage(dir) {
  const newPage = State.currentPage + dir;
  if (newPage < 1 || newPage > State.totalPages) return;
  State.currentPage = newPage;
  loadViolations();
}

// ===== REVIEW QUEUE =====
function loadReviewQueue() {
  API.getViolations({ status: 'pending', tier: 2, pageSize: 50 })
    .then(data => renderReviewCards(data.violations))
    .catch(e => toast('Failed to load review queue: ' + e.message, 'error'));
}

function renderReviewCards(violations) {
  const container = document.getElementById('review-cards');
  document.getElementById('badge-review').textContent = violations.length;

  if (!violations.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-feather="check-circle"></i>
        <p>No pending reviews</p>
        <small>All Tier 2 violations have been handled</small>
      </div>`;
    feather.replace();
    return;
  }

  container.innerHTML = violations.map(v => `
    <div class="review-card" id="rc-${v.id}">
      <div class="review-card-img">
        ${v.annotated_img
          ? `<img src="${API.BASE_URL.replace('/api/v1','')}/evidence/annotated/${v.id}.jpg"
                  style="width:100%;height:100%;object-fit:cover"
                  onerror="this.style.display='none'" />`
          : `<i data-feather="image"></i>`}
      </div>
      <div class="review-card-body">
        <div class="review-card-title">${v.violation_type.replace(/_/g,' ').toUpperCase()}</div>
        <div class="review-card-meta">
          📍 ${v.location}<br>
          🕐 ${formatTime(v.timestamp)}<br>
          🚗 ${v.plate_text || 'Plate Unclear'}<br>
          📷 ${v.camera_id}<br>
          🔒 Confidence: <b style="color:var(--warning)">${(v.confidence*100).toFixed(0)}%</b><br>
          💰 Fine: ₹${v.fine_amount?.toLocaleString() || 'N/A'}
        </div>
      </div>
      <div class="review-card-actions">
        <button class="btn btn-success" style="flex:1" onclick="confirmV('${v.id}')">
          ✓ Confirm — Issue Challan
        </button>
        <button class="btn btn-danger" onclick="rejectV('${v.id}')">
          ✗ False Positive
        </button>
      </div>
    </div>
  `).join('');

  feather.replace();
}

async function confirmV(id) {
  try {
    await API.confirmViolation(id);
    toast('Violation confirmed — challan issued!', 'success');
    document.getElementById(`rc-${id}`)?.remove();
    loadLiveStats();
    loadViolations();
  } catch (e) { toast('Confirm failed: ' + e.message, 'error'); }
}

async function rejectV(id) {
  try {
    await API.rejectViolation(id);
    toast('Marked as false positive. Model will improve.', 'warning');
    document.getElementById(`rc-${id}`)?.remove();
    loadViolations();
  } catch (e) { toast('Reject failed: ' + e.message, 'error'); }
}

// ===== ANALYTICS =====
async function loadAnalytics() {
  try {
    const [summary, trends] = await Promise.all([
      API.getAnalyticsSummary(),
      API.getViolationTrends(30),
    ]);
    State.summary = summary;

    // KPI cards
    document.getElementById('analytics-kpis').innerHTML = `
      <div class="kpi-card kpi-accent-cyan">
        <div class="kpi-label">Total Today</div>
        <div class="kpi-val">${summary.total_today}</div>
        <div class="kpi-sub">violations detected</div>
      </div>
      <div class="kpi-card kpi-accent-green">
        <div class="kpi-label">Auto Challan</div>
        <div class="kpi-val" style="color:var(--success)">${summary.auto_challan_count}</div>
        <div class="kpi-sub">issued automatically</div>
      </div>
      <div class="kpi-card kpi-accent-orange">
        <div class="kpi-label">Review Queue</div>
        <div class="kpi-val" style="color:var(--warning)">${summary.human_review_count}</div>
        <div class="kpi-sub">awaiting officer action</div>
      </div>
      <div class="kpi-card kpi-accent-red">
        <div class="kpi-label">This Week</div>
        <div class="kpi-val" style="color:var(--danger)">${summary.total_this_week}</div>
        <div class="kpi-sub">top: ${summary.top_violation_type.replace(/_/g,' ')}</div>
      </div>
    `;

    GarudaCharts.renderTrends('chart-trends', trends.data_points);
    GarudaCharts.renderTypesDoughnut('chart-types', summary.violation_type_breakdown);
    GarudaCharts.renderTierSplit('chart-tiers', summary);

    feather.replace();
  } catch (e) {
    toast('Analytics load failed: ' + e.message, 'error');
  }
}

// ===== MAP =====
async function loadMap() {
  if (!State.mapInitialized) {
    GarudaMap.init('leaflet-map');
    State.mapInitialized = true;
  }
  try {
    const data = await API.getHeatmapData();
    GarudaMap.loadHeatmap(data.points);
  } catch (e) { toast('Heatmap load failed: ' + e.message, 'error'); }
}

// ===== CAMERAS =====
async function loadCameras() {
  try {
    const cams = await API.getCameras();
    State.cameras = cams;
    renderCameraCards(cams);
  } catch (e) { toast('Camera load failed: ' + e.message, 'error'); }
}

function renderCameraCards(cams) {
  const grid = document.getElementById('cameras-grid');
  if (!cams.length) {
    grid.innerHTML = `<div class="empty-state"><i data-feather="camera-off"></i><p>No cameras registered</p></div>`;
    feather.replace();
    return;
  }
  grid.innerHTML = cams.map(c => `
    <div class="camera-card">
      <div class="camera-card-id">${c.id}</div>
      <div class="camera-card-loc">${c.location}</div>
      <div class="camera-card-meta">
        📍 ${c.lat?.toFixed(4)}, ${c.lon?.toFixed(4)}<br>
        🛑 Stop line: Y = ${c.stop_line_y}px<br>
        🕐 Last seen: ${c.last_seen ? formatTime(c.last_seen) : 'Never'}<br>
        ${c.description || ''}
      </div>
      <div class="camera-status ${c.status === 'active' ? 'cam-active' : 'cam-offline'}">
        ${c.status.toUpperCase()}
      </div>
    </div>
  `).join('');
  feather.replace();
}

function showRegisterCamera() { showModal('camera-modal'); }

async function submitCamera(evt) {
  evt.preventDefault();
  try {
    await API.registerCamera({
      id:          document.getElementById('cam-id').value,
      location:    document.getElementById('cam-location').value,
      lat:  parseFloat(document.getElementById('cam-lat').value),
      lon:  parseFloat(document.getElementById('cam-lon').value),
      stop_line_y: parseInt(document.getElementById('cam-stop-y').value),
    });
    hideModal('camera-modal');
    toast('Camera registered!', 'success');
    loadCameras();
  } catch (e) { toast('Register failed: ' + e.message, 'error'); }
}

// ===== VIOLATION DETAIL MODAL =====
async function openViolationModal(id) {
  try {
    const v = await API.getViolation(id);
    const record = JSON.parse(v.json_record || '{}');

    document.getElementById('violation-modal-title').textContent = v.id;
    document.getElementById('violation-modal-body').innerHTML = `
      <div class="violation-detail-grid">
        ${v.annotated_img ? `
          <div style="grid-column:1/-1;padding:1rem 1.5rem 0">
            <img src="${API.BASE_URL.replace('/api/v1','')}/evidence/annotated/${v.id}.jpg"
                 style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;background:var(--bg-secondary)"
                 onerror="this.style.display='none'" />
          </div>` : ''}
        <div class="vd-section">
          <div class="vd-label">Type</div>
          <div class="vd-val">${v.violation_type.replace(/_/g,' ').toUpperCase()}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Confidence</div>
          <div class="vd-val">${(v.confidence*100).toFixed(1)}%</div>
          <div class="conf-bar-full-wrap">
            <div class="conf-bar-full" style="width:${v.confidence*100}%"></div>
          </div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Status</div>
          <div class="vd-val"><span class="status-chip status-${v.status}">${v.status.replace(/_/g,' ')}</span></div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Tier</div>
          <div class="vd-val"><span class="tier-badge tier-${v.tier}">Tier ${v.tier}</span></div>
        </div>
        <div class="vd-section">
          <div class="vd-label">License Plate</div>
          <div class="vd-val" style="font-family:var(--mono);color:var(--success)">${v.plate_text || 'UNCLEAR'}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Vehicle Class</div>
          <div class="vd-val">${v.vehicle_class || 'Unknown'}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Camera</div>
          <div class="vd-val" style="font-size:0.8rem">${v.camera_id}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Location</div>
          <div class="vd-val" style="font-size:0.8rem">${v.location || '—'}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Timestamp</div>
          <div class="vd-val" style="font-size:0.8rem">${formatTime(v.timestamp)}</div>
        </div>
        <div class="vd-section">
          <div class="vd-label">Fine Amount</div>
          <div class="vd-val" style="color:var(--warning)">₹${v.fine_amount?.toLocaleString() || '—'}</div>
        </div>
      </div>
      <div class="vd-actions">
        ${v.status === 'pending' ? `
          <button class="btn btn-success" onclick="confirmV('${v.id}');hideModal('violation-modal')">
            ✓ Confirm — Issue Challan
          </button>
          <button class="btn btn-danger" onclick="rejectV('${v.id}');hideModal('violation-modal')">
            ✗ False Positive
          </button>` : ''}
        <button class="btn btn-outline" onclick="hideModal('violation-modal')">Close</button>
      </div>
    `;

    showModal('violation-modal');
    feather.replace();
  } catch (e) { toast('Cannot load violation: ' + e.message, 'error'); }
}

// ===== MODAL UTILS =====
function showModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ===== LIVE FEED WEBSOCKET =====
function setupWebSocket() {
  GarudaWS.on('violation_detected', (data) => {
    prependLiveEvent(data);
    loadLiveStats();
    // Drop pin on map if map view open
    if (State.currentView === 'map') {
      // Would need camera lat/lon — handled by loadMap
    }
    // Show toast for high-severity
    if (data.tier <= 2) {
      toast(`🚨 ${data.violation_type?.replace(/_/g,' ')} at ${data.location}`, 'warning');
    }
  });

  GarudaWS.on('system_stats', (data) => {
    if (data.fps !== undefined)
      document.getElementById('stat-fps').textContent = `${data.fps.toFixed(1)} FPS`;
  });

  GarudaWS.connect();
}

function prependLiveEvent(data) {
  const list = document.getElementById('live-events');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const sev  = data.severity || 'medium';
  const card = document.createElement('div');
  card.className = 'event-card';
  card.onclick = () => { if(data.violation_id) openViolationModal(data.violation_id); };
  card.innerHTML = `
    <div class="event-severity-bar sev-${sev}"></div>
    <div class="event-body">
      <div class="event-type">${(data.violation_type || 'violation').replace(/_/g,' ').toUpperCase()}</div>
      <div class="event-meta">📷 ${data.camera_id} · ${data.location || ''}</div>
      <div class="event-plate">${data.plate ? '🚗 ' + data.plate : 'Plate unread'}</div>
    </div>
    <div class="event-right">
      <span class="tier-badge tier-${data.tier}">T${data.tier}</span>
      <div class="conf-bar-wrap">
        <div class="conf-bar" style="width:${(data.confidence||0)*100}%"></div>
      </div>
      <span style="font-size:0.68rem;color:var(--text-muted)">${new Date().toLocaleTimeString()}</span>
    </div>
  `;

  list.prepend(card);
  // Keep max 50 events
  while (list.children.length > 50) list.lastChild.remove();
}

// ===== DEBUG =====
async function injectTestViolation() {
  const btn = document.getElementById('btn-inject');
  btn.disabled = true;
  try {
    const result = await API.injectTestViolation();
    toast(`Test violation injected: ${result.violation_id}`, 'success');
  } catch (e) {
    toast('Backend offline — start the server first', 'error');
  } finally {
    btn.disabled = false;
    feather.replace();
  }
}

// ===== UTILS =====
function formatTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  setupWebSocket();
  showView('live');
  feather.replace();

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) el.classList.add('hidden');
    });
  });
});
