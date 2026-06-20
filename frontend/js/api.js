/**
 * GARUDA Frontend — API Module
 * ================================
 * ALL API calls live here. To switch backend URL or framework:
 *   1. Change BASE_URL below
 *   2. Import these functions in your React/Vue components
 *
 * All functions return plain JS objects (no framework deps).
 */

const API = (() => {
  const BASE_URL = 'http://localhost:8000/api/v1';

  async function request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE_URL + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  const get  = (path)       => request('GET',    path);
  const post = (path, body) => request('POST',   path, body);
  const put  = (path, body) => request('PUT',    path, body);
  const del  = (path)       => request('DELETE', path);

  // ---- Violations ----
  function getViolations({ page = 1, pageSize = 20, tier, status, camera_id, type, date_from, date_to } = {}) {
    const params = new URLSearchParams({ page, page_size: pageSize });
    if (tier)       params.set('tier',      tier);
    if (status)     params.set('status',    status);
    if (camera_id)  params.set('camera_id', camera_id);
    if (type)       params.set('type',      type);
    if (date_from)  params.set('date_from', date_from);
    if (date_to)    params.set('date_to',   date_to);
    return get(`/violations?${params}`);
  }

  function getViolation(id)         { return get(`/violations/${id}`); }
  function confirmViolation(id, officerId = 'officer_001') {
    return post(`/violations/${id}/confirm`, { officer_id: officerId });
  }
  function rejectViolation(id, officerId = 'officer_001') {
    return post(`/violations/${id}/reject`, { officer_id: officerId });
  }
  function ingestViolation(payload) { return post('/violations/ingest', payload); }

  // ---- Cameras ----
  function getCameras()            { return get('/cameras'); }
  function getCamera(id)           { return get(`/cameras/${id}`); }
  function registerCamera(body)    { return post('/cameras', body); }
  function updateCameraConfig(id, body) { return put(`/cameras/${id}/config`, body); }
  function deleteCamera(id)        { return del(`/cameras/${id}`); }

  // ---- Vehicles ----
  function getVehicle(plate)       { return get(`/vehicles/${encodeURIComponent(plate)}`); }
  function getRepeatOffenders(limit = 50) { return get(`/vehicles/repeat?limit=${limit}`); }
  function clearVehicle(plate)     { return del(`/vehicles/${encodeURIComponent(plate)}/clear`); }

  // ---- Analytics ----
  function getAnalyticsSummary()   { return get('/analytics/summary'); }
  function getViolationTrends(days = 30) { return get(`/analytics/trends?days=${days}`); }
  function getHeatmapData()        { return get('/analytics/heatmap'); }

  // ---- Debug ----
  function injectTestViolation(body = {}) {
    return fetch('http://localhost:8000/debug/inject-violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        violation_type: 'helmet_non_compliance',
        confidence: 0.75,
        tier: 2,
        plate: 'KA-01-AB-1234',
        camera_id: 'BLR-CAM-DEMO-001',
        location: 'MG Road & Brigade Road',
        ...body,
      }),
    }).then(r => r.json());
  }

  function getPipelineStatus() {
    return fetch('http://localhost:8000/debug/pipeline-status').then(r => r.json());
  }

  // ---- Health ----
  function healthCheck() {
    return fetch('http://localhost:8000/health').then(r => r.json());
  }

  return {
    getViolations, getViolation, confirmViolation, rejectViolation, ingestViolation,
    getCameras, getCamera, registerCamera, updateCameraConfig, deleteCamera,
    getVehicle, getRepeatOffenders, clearVehicle,
    getAnalyticsSummary, getViolationTrends, getHeatmapData,
    injectTestViolation, getPipelineStatus, healthCheck,
    BASE_URL,
  };
})();
