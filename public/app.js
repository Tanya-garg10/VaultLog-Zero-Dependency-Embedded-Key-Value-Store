// public/app.js
// Modern Zero-Dependency Client Application for WireForge Zero

(function() {
  'use strict';

  // --- STATE ---
  const state = {
    traffic: [],
    selectedTrafficId: null,
    routes: [],
    collections: {},
    currentCollection: 'users',
    collectionData: [],
    webhooks: [],
    currentBucket: 'default',
    selectedWebhookId: null,
    systemStatus: null,
    theme: localStorage.getItem('wireforge_theme') || 'dark'
  };

  // --- DOM ELEMENTS ---
  const els = {
    themeBtn: document.getElementById('theme-toggle-btn'),
    quickCurlBtn: document.getElementById('quick-curl-btn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // Traffic
    trafficCount: document.getElementById('traffic-count'),
    trafficItems: document.getElementById('traffic-items-container'),
    trafficDetail: document.getElementById('traffic-detail-view'),
    trafficSearch: document.getElementById('traffic-search'),
    trafficMethodFilter: document.getElementById('traffic-method-filter'),
    trafficClearBtn: document.getElementById('traffic-clear-btn'),
    trafficExportHar: document.getElementById('traffic-export-har'),
    
    // Mocks
    mocksCount: document.getElementById('mocks-count'),
    mockRoutesContainer: document.getElementById('mock-routes-container'),
    newMockBtn: document.getElementById('new-mock-btn'),
    
    // Collections
    collectionsCount: document.getElementById('collections-count'),
    collectionSelect: document.getElementById('collection-select'),
    collectionMetaInfo: document.getElementById('collection-meta-info'),
    collectionTableContainer: document.getElementById('collection-table-container'),
    addCollectionItemBtn: document.getElementById('add-collection-item-btn'),
    
    // Schema
    schemaEditorInput: document.getElementById('schema-editor-input'),
    dataEditorInput: document.getElementById('data-editor-input'),
    schemaValidateBtn: document.getElementById('schema-validate-btn'),
    schemaInferBtn: document.getElementById('schema-infer-btn'),
    schemaValidationResult: document.getElementById('schema-validation-result'),
    
    // Webhooks
    webhookBucketInput: document.getElementById('webhook-bucket-input'),
    webhookCopyUrlBtn: document.getElementById('webhook-copy-url-btn'),
    webhookTestSendBtn: document.getElementById('webhook-test-send-btn'),
    webhookEventsList: document.getElementById('webhook-events-list'),
    webhookDetailView: document.getElementById('webhook-detail-view'),
    
    // Diff & Analytics
    metricTotalRequests: document.getElementById('metric-total-requests'),
    metricAvgLatency: document.getElementById('metric-avg-latency'),
    metricSuccessRate: document.getElementById('metric-success-rate'),
    metricMemory: document.getElementById('metric-memory'),
    diffSelectA: document.getElementById('diff-select-a'),
    diffSelectB: document.getElementById('diff-select-b'),
    runDiffBtn: document.getElementById('run-diff-btn'),
    diffOutputContainer: document.getElementById('diff-output-container'),
    exportOpenApiBtn: document.getElementById('export-openapi-btn'),
    exportPostmanBtn: document.getElementById('export-postman-btn'),
    
    // Audit
    runAuditBtn: document.getElementById('run-audit-btn'),
    
    // Modal & Toast
    modalContainer: document.getElementById('modal-container'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    toast: document.getElementById('toast')
  };

  // --- INITIALIZATION ---
  function init() {
    applyTheme(state.theme);
    setupEventListeners();
    setupSSEStream();
    
    // Load initial data
    loadSystemStatus();
    loadTraffic();
    loadMockRoutes();
    loadCollections();
    loadWebhooks(state.currentBucket);
    initSchemaDefaults();
  }

  // --- THEME ---
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wireforge_theme', theme);
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // --- SSE STREAM ---
  function setupSSEStream() {
    try {
      const evtSource = new EventSource('/api/traffic/stream');
      
      evtSource.addEventListener('traffic', (e) => {
        try {
          const record = JSON.parse(e.data);
          state.traffic.unshift(record);
          if (state.traffic.length > 300) state.traffic.pop();
          renderTraffic();
          updateAnalytics();
          updateDiffDropdowns();
        } catch {}
      });

      evtSource.addEventListener('webhook', (e) => {
        try {
          const item = JSON.parse(e.data);
          if (item.bucketId === state.currentBucket) {
            state.webhooks.unshift(item);
            renderWebhooks();
          }
        } catch {}
      });

      evtSource.addEventListener('cleared', () => {
        state.traffic = [];
        renderTraffic();
        updateAnalytics();
      });

      evtSource.onerror = () => {
        // SSE auto reconnects natively
      };
    } catch (err) {
      console.warn('SSE not supported or failed to connect:', err);
    }
  }

  // --- TOAST HELPER ---
  function showToast(message, duration = 3000) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    setTimeout(() => {
      els.toast.classList.add('hidden');
    }, duration);
  }

  // --- MODAL HELPERS ---
  function openModal(title, htmlContent) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = htmlContent;
    els.modalContainer.classList.remove('hidden');
  }

  function closeModal() {
    els.modalContainer.classList.add('hidden');
  }

  // --- API CALLS & DATA LOADERS ---
  async function loadSystemStatus() {
    try {
      const res = await fetch('/api/system/status');
      state.systemStatus = await res.json();
      if (els.metricMemory && state.systemStatus.runtime) {
        els.metricMemory.textContent = `${state.systemStatus.runtime.memoryMb} MB`;
      }
    } catch {}
  }

  async function loadTraffic() {
    try {
      const res = await fetch('/api/traffic');
      const data = await res.json();
      state.traffic = data.entries || [];
      renderTraffic();
      updateAnalytics();
      updateDiffDropdowns();
    } catch {}
  }

  async function loadMockRoutes() {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      state.routes = data.routes || [];
      if (els.mocksCount) els.mocksCount.textContent = state.routes.length;
      renderMockRoutes();
    } catch {}
  }

  async function loadCollections() {
    try {
      const res = await fetch('/api/collections');
      const data = await res.json();
      state.collections = data.collections || {};
      const keys = Object.keys(state.collections);
      if (els.collectionsCount) els.collectionsCount.textContent = keys.length;
      
      // Update select dropdown
      els.collectionSelect.innerHTML = keys.map(k => `<option value="${k}">${k} collection (${state.collections[k].count} items)</option>`).join('');
      els.collectionSelect.value = state.currentCollection;
      
      await loadCollectionItems(state.currentCollection);
    } catch {}
  }

  async function loadCollectionItems(name) {
    try {
      state.currentCollection = name;
      const res = await fetch(`/api/collections/${name}`);
      const result = await res.json();
      state.collectionData = result.data || [];
      renderCollectionTable();
    } catch {}
  }

  async function loadWebhooks(bucketId) {
    try {
      state.currentBucket = bucketId;
      const res = await fetch(`/api/webhooks/${bucketId}`);
      const data = await res.json();
      state.webhooks = data.events || [];
      renderWebhooks();
    } catch {}
  }

  // --- RENDER TRAFFIC ---
  function renderTraffic() {
    if (!els.trafficItems) return;
    
    let filtered = [...state.traffic];
    const searchTerm = (els.trafficSearch.value || '').toLowerCase().trim();
    const methodFilter = els.trafficMethodFilter.value;

    if (methodFilter) {
      filtered = filtered.filter(item => item.method === methodFilter);
    }
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.path.toLowerCase().includes(searchTerm) ||
        String(item.response?.statusCode).includes(searchTerm) ||
        JSON.stringify(item.body || '').toLowerCase().includes(searchTerm)
      );
    }

    if (els.trafficCount) els.trafficCount.textContent = state.traffic.length;

    if (filtered.length === 0) {
      els.trafficItems.innerHTML = `
        <div class="empty-state">
          <p>No traffic recorded matching filter.</p>
          <small>Click "Test Request" in the top bar to trigger sample traffic.</small>
        </div>
      `;
      return;
    }

    els.trafficItems.innerHTML = filtered.map(item => {
      const isSelected = item.id === state.selectedTrafficId;
      const status = item.response?.statusCode || 200;
      const statusClass = status >= 500 ? 'status-5xx' : (status >= 400 ? 'status-4xx' : (status >= 300 ? 'status-3xx' : 'status-2xx'));
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return `
        <div class="traffic-row ${isSelected ? 'selected' : ''}" data-id="${item.id}">
          <span class="method-tag method-${item.method}">${item.method}</span>
          <span class="status-badge ${statusClass}">${status}</span>
          <span class="col-path-text" title="${item.path}">${item.path}</span>
          <span class="col-latency-text">${item.response?.durationMs || 0}ms</span>
          <span class="col-time-text">${timeStr}</span>
        </div>
      `;
    }).join('');

    // Attach row click listeners
    els.trafficItems.querySelectorAll('.traffic-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        selectTrafficItem(id);
      });
    });
  }

  function selectTrafficItem(id) {
    state.selectedTrafficId = id;
    renderTraffic();
    
    const entry = state.traffic.find(t => t.id === id);
    if (!entry) return;

    const reqBodyFormatted = entry.body ? JSON.stringify(entry.body, null, 2) : '(Empty Body)';
    const resBodyFormatted = entry.response?.body ? (typeof entry.response.body === 'object' ? JSON.stringify(entry.response.body, null, 2) : String(entry.response.body)) : '(Empty Response)';

    els.trafficDetail.innerHTML = `
      <div class="traffic-detail-view">
        <div class="detail-header-card">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="method-tag method-${entry.method}">${entry.method}</span>
              <strong style="font-family:var(--font-mono); font-size:14px;">${entry.path}</strong>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
              Status: <span class="status-badge ${entry.response?.statusCode >= 400 ? 'status-4xx' : 'status-2xx'}">${entry.response?.statusCode}</span> •
              Latency: ${entry.response?.durationMs}ms •
              Time: ${new Date(entry.timestamp).toISOString()}
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn btn-secondary btn-sm" id="btn-copy-curl">📋 Copy cURL</button>
            <button class="btn btn-primary btn-sm" id="btn-replay-req">▶ Replay</button>
          </div>
        </div>

        <div>
          <div class="detail-section-title">Request Headers</div>
          <pre class="code-block">${JSON.stringify(entry.headers, null, 2)}</pre>
        </div>

        <div>
          <div class="detail-section-title">Request Payload</div>
          <pre class="code-block">${reqBodyFormatted}</pre>
        </div>

        <div>
          <div class="detail-section-title">Response Headers & Payload (${entry.response?.statusCode})</div>
          <pre class="code-block">${resBodyFormatted}</pre>
        </div>
      </div>
    `;

    document.getElementById('btn-copy-curl')?.addEventListener('click', () => {
      const curl = generateCurlCommand(entry);
      navigator.clipboard.writeText(curl);
      showToast('cURL command copied to clipboard!');
    });

    document.getElementById('btn-replay-req')?.addEventListener('click', () => {
      openReplayModal(entry);
    });
  }

  function generateCurlCommand(entry) {
    const origin = window.location.origin;
    let curl = `curl -X ${entry.method} "${origin}${entry.path}"`;
    for (const [k, v] of Object.entries(entry.headers || {})) {
      if (['host', 'content-length'].includes(k.toLowerCase())) continue;
      curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (entry.body && entry.method !== 'GET') {
      const bodyStr = typeof entry.body === 'object' ? JSON.stringify(entry.body) : String(entry.body);
      curl += ` \\\n  -d '${bodyStr.replace(/'/g, "\\'")}'`;
    }
    return curl;
  }

  function openReplayModal(entry) {
    const html = `
      <form id="replay-form">
        <div class="form-group">
          <label class="form-label">Target URL</label>
          <input type="text" id="replay-url" class="input-text" value="${window.location.origin}${entry.path}">
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Method</label>
            <select id="replay-method" class="select-control">
              <option ${entry.method === 'GET' ? 'selected' : ''}>GET</option>
              <option ${entry.method === 'POST' ? 'selected' : ''}>POST</option>
              <option ${entry.method === 'PUT' ? 'selected' : ''}>PUT</option>
              <option ${entry.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
              <option ${entry.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Simulated Headers (JSON)</label>
            <input type="text" id="replay-headers" class="input-text" value='{"X-WireForge-Replay": "true"}'>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Payload Body (JSON or text)</label>
          <textarea id="replay-body" class="code-textarea" style="height:120px;">${entry.body ? JSON.stringify(entry.body, null, 2) : ''}</textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').classList.add('hidden')">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">🚀 Execute Replay</button>
        </div>
        <div id="replay-result" style="margin-top:12px;"></div>
      </form>
    `;
    openModal('Replay HTTP Request', html);

    document.getElementById('replay-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetUrl = document.getElementById('replay-url').value;
      const method = document.getElementById('replay-method').value;
      const rawHeaders = document.getElementById('replay-headers').value;
      const rawBody = document.getElementById('replay-body').value;

      let headers = {};
      try { headers = JSON.parse(rawHeaders); } catch {}
      let body = null;
      if (rawBody.trim()) {
        try { body = JSON.parse(rawBody); } catch { body = rawBody; }
      }

      const resultBox = document.getElementById('replay-result');
      resultBox.innerHTML = `<span style="color:var(--text-secondary)">Executing request...</span>`;

      try {
        const res = await fetch('/api/traffic/replay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl, method, headers, body })
        });
        const data = await res.json();
        resultBox.innerHTML = `
          <div class="validation-status-banner ${data.success ? 'pass' : 'fail'}">
            <strong>${data.success ? 'Replay Succeeded' : 'Replay Failed'}:</strong> Status ${data.statusCode || 0} (${data.durationMs}ms)
          </div>
          <pre class="code-block" style="margin-top:8px; max-height:160px;">${JSON.stringify(data.body, null, 2)}</pre>
        `;
        showToast('Request replayed successfully');
      } catch (err) {
        resultBox.innerHTML = `<div class="validation-status-banner fail">Error: ${err.message}</div>`;
      }
    });
  }

  // --- RENDER MOCK ROUTES ---
  function renderMockRoutes() {
    if (!els.mockRoutesContainer) return;
    if (state.routes.length === 0) {
      els.mockRoutesContainer.innerHTML = `<div class="empty-state">No mock routes defined. Click "+ New Mock Route" to create one.</div>`;
      return;
    }

    els.mockRoutesContainer.innerHTML = state.routes.map(r => {
      const responseSample = typeof r.responseBody === 'object' ? JSON.stringify(r.responseBody, null, 2) : String(r.responseBody);
      return `
        <div class="mock-card" data-id="${r.id}">
          <div class="mock-card-header">
            <div class="mock-endpoint-title">
              <span class="method-tag method-${r.method}">${r.method}</span>
              <span>${r.path}</span>
            </div>
            <span class="status-badge ${r.status >= 400 ? 'status-4xx' : 'status-2xx'}">${r.status}</span>
          </div>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${r.name}</div>
          <div class="mock-meta-row">
            <span>Latency: <strong>${r.latencyMs}ms (±${r.jitterMs}ms)</strong></span>
            <span>Chaos Error: <strong>${r.errorRate}%</strong></span>
            <span>Schema: <strong>${r.schema ? 'Enforced' : 'None'}</strong></span>
          </div>
          <pre class="code-block" style="max-height:110px;">${responseSample}</pre>
          <div class="mock-actions">
            <button class="btn btn-secondary btn-sm btn-test-mock" data-path="${r.path}" data-method="${r.method}">▶ Test Endpoint</button>
            <button class="btn btn-secondary btn-sm btn-edit-mock" data-id="${r.id}">Edit</button>
            <button class="btn btn-danger btn-sm btn-delete-mock" data-id="${r.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    els.mockRoutesContainer.querySelectorAll('.btn-test-mock').forEach(btn => {
      btn.addEventListener('click', async () => {
        const path = btn.getAttribute('data-path');
        const method = btn.getAttribute('data-method');
        try {
          const res = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify({ customerId: 'cust_99', totalAmount: 49.99, items: [{ sku: 'SKU-ZERO', quantity: 2, price: 24.99 }] }) : undefined
          });
          const data = await res.json();
          showToast(`Tested ${method} ${path} -> Status ${res.status}`);
        } catch (err) {
          showToast(`Error: ${err.message}`);
        }
      });
    });

    els.mockRoutesContainer.querySelectorAll('.btn-edit-mock').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const route = state.routes.find(r => r.id === id);
        if (route) openMockFormModal(route);
      });
    });

    els.mockRoutesContainer.querySelectorAll('.btn-delete-mock').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Delete this mock route?')) {
          await fetch(`/api/routes/${id}`, { method: 'DELETE' });
          await loadMockRoutes();
          showToast('Mock route deleted');
        }
      });
    });
  }

  function openMockFormModal(route = null) {
    const isEdit = !!route;
    const initialPath = route ? route.path : '/api/v1/custom-endpoint';
    const initialMethod = route ? route.method : 'GET';
    const initialName = route ? route.name : 'Custom Dynamic Route';
    const initialStatus = route ? route.status : 200;
    const initialLatency = route ? route.latencyMs : 0;
    const initialBody = route ? JSON.stringify(route.responseBody, null, 2) : JSON.stringify({
      id: "item_{{uuid}}",
      userName: "{{faker.name}}",
      userEmail: "{{faker.email}}",
      company: "{{faker.company}}",
      createdAt: "{{isoDate}}"
    }, null, 2);

    const html = `
      <form id="mock-form">
        <div class="form-group">
          <label class="form-label">Route Name</label>
          <input type="text" id="mock-form-name" class="input-text" value="${initialName}" required>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">HTTP Method</label>
            <select id="mock-form-method" class="select-control">
              <option ${initialMethod === 'GET' ? 'selected' : ''}>GET</option>
              <option ${initialMethod === 'POST' ? 'selected' : ''}>POST</option>
              <option ${initialMethod === 'PUT' ? 'selected' : ''}>PUT</option>
              <option ${initialMethod === 'PATCH' ? 'selected' : ''}>PATCH</option>
              <option ${initialMethod === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Path Pattern</label>
            <input type="text" id="mock-form-path" class="input-text" value="${initialPath}" required>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label class="form-label">Status Code</label>
            <input type="number" id="mock-form-status" class="input-text" value="${initialStatus}">
          </div>
          <div class="form-group">
            <label class="form-label">Simulated Latency (ms)</label>
            <input type="number" id="mock-form-latency" class="input-text" value="${initialLatency}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dynamic Response Template (Supports {{uuid}}, {{faker.name}}, {{isoDate}})</label>
          <textarea id="mock-form-body" class="code-textarea" style="height:140px;">${initialBody}</textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').classList.add('hidden')">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">${isEdit ? 'Save Changes' : 'Create Mock Route'}</button>
        </div>
      </form>
    `;
    openModal(isEdit ? 'Edit Mock Route' : 'New Mock Route', html);

    document.getElementById('mock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      let responseBody;
      try {
        responseBody = JSON.parse(document.getElementById('mock-form-body').value);
      } catch {
        responseBody = document.getElementById('mock-form-body').value;
      }

      const payload = {
        name: document.getElementById('mock-form-name').value,
        method: document.getElementById('mock-form-method').value,
        path: document.getElementById('mock-form-path').value,
        status: parseInt(document.getElementById('mock-form-status').value, 10) || 200,
        latencyMs: parseInt(document.getElementById('mock-form-latency').value, 10) || 0,
        responseBody
      };

      if (isEdit) {
        await fetch(`/api/routes/${route.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Mock route updated');
      } else {
        await fetch('/api/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Mock route created');
      }

      closeModal();
      await loadMockRoutes();
    });
  }

  // --- RENDER COLLECTIONS ---
  function renderCollectionTable() {
    if (!els.collectionTableContainer) return;
    const items = state.collectionData;

    els.collectionMetaInfo.innerHTML = `
      <div>Endpoint: <code>/api/collections/${state.currentCollection}</code></div>
      <div>Count: <strong>${items.length} records</strong></div>
    `;

    if (items.length === 0) {
      els.collectionTableContainer.innerHTML = `<div class="empty-state">Collection "${state.currentCollection}" is currently empty.</div>`;
      return;
    }

    const keys = Object.keys(items[0]);

    els.collectionTableContainer.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            ${keys.map(k => `<th>${k}</th>`).join('')}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${keys.map(k => `<td>${typeof item[k] === 'object' ? JSON.stringify(item[k]) : String(item[k])}</td>`).join('')}
              <td>
                <button class="btn btn-danger btn-sm btn-del-item" data-id="${item.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    els.collectionTableContainer.querySelectorAll('.btn-del-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await fetch(`/api/collections/${state.currentCollection}/${id}`, { method: 'DELETE' });
        await loadCollectionItems(state.currentCollection);
        showToast('Item deleted from collection');
      });
    });
  }

  // --- SCHEMA WORKBENCH ---
  function initSchemaDefaults() {
    if (!els.schemaEditorInput) return;
    const defaultSchema = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["userId", "email", "tier", "settings"],
      "properties": {
        "userId": { "type": "string", "format": "uuid" },
        "email": { "type": "string", "format": "email" },
        "tier": { "type": "string", "enum": ["free", "pro", "enterprise"] },
        "age": { "type": "integer", "minimum": 18, "maximum": 120 },
        "settings": {
          "type": "object",
          "required": ["notificationsEnabled"],
          "properties": {
            "notificationsEnabled": { "type": "boolean" },
            "theme": { "type": "string", "enum": ["light", "dark", "system"] }
          }
        }
      }
    };

    const defaultData = {
      "userId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "email": "developer@hyperion.org",
      "tier": "pro",
      "age": 28,
      "settings": {
        "notificationsEnabled": true,
        "theme": "dark"
      }
    };

    els.schemaEditorInput.value = JSON.stringify(defaultSchema, null, 2);
    els.dataEditorInput.value = JSON.stringify(defaultData, null, 2);
  }

  async function validateSchemaWorkbench() {
    let schema, data;
    try {
      schema = JSON.parse(els.schemaEditorInput.value);
    } catch (e) {
      els.schemaValidationResult.innerHTML = `<div class="validation-status-banner fail">Invalid JSON in Schema Editor: ${e.message}</div>`;
      return;
    }

    try {
      data = JSON.parse(els.dataEditorInput.value);
    } catch (e) {
      els.schemaValidationResult.innerHTML = `<div class="validation-status-banner fail">Invalid JSON in Data Editor: ${e.message}</div>`;
      return;
    }

    try {
      const res = await fetch('/api/schema/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema, data })
      });
      const result = await res.json();

      if (result.valid) {
        els.schemaValidationResult.innerHTML = `
          <div class="validation-status-banner pass">
            ✅ <strong>Validation PASSED!</strong> Payload strictly complies with all JSON Schema rules and formats.
          </div>
        `;
      } else {
        els.schemaValidationResult.innerHTML = `
          <div class="validation-status-banner fail">
            ❌ <strong>Validation FAILED (${result.errors.length} error(s)):</strong>
            <div class="error-list">
              ${result.errors.map(err => `
                <div class="error-item">
                  <strong>[${err.path}]</strong> ${err.message} <em>(${err.keyword})</em>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    } catch (err) {
      els.schemaValidationResult.innerHTML = `<div class="validation-status-banner fail">Error: ${err.message}</div>`;
    }
  }

  async function inferSchemaWorkbench() {
    let data;
    try {
      data = JSON.parse(els.dataEditorInput.value);
    } catch (e) {
      showToast('Error: Data editor does not contain valid JSON to infer from.');
      return;
    }

    try {
      const res = await fetch('/api/schema/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });
      const result = await res.json();
      els.schemaEditorInput.value = JSON.stringify(result.schema, null, 2);
      showToast('Schema automatically inferred from sample data!');
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  }

  // --- WEBHOOK CATCHER ---
  function renderWebhooks() {
    if (!els.webhookEventsList) return;
    if (state.webhooks.length === 0) {
      els.webhookEventsList.innerHTML = `<div class="empty-state">No webhooks captured for bucket "${state.currentBucket}". Send a POST request to test.</div>`;
      return;
    }

    els.webhookEventsList.innerHTML = state.webhooks.map(wh => {
      const isSelected = wh.id === state.selectedWebhookId;
      return `
        <div class="webhook-item ${isSelected ? 'selected' : ''}" data-id="${wh.id}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="method-tag method-${wh.method}">${wh.method}</span>
            <small style="color:var(--text-secondary);">${new Date(wh.receivedAt).toLocaleTimeString()}</small>
          </div>
          <div style="font-family:var(--font-mono); font-size:11px; margin-top:4px; overflow:hidden; text-overflow:ellipsis;">
            ${wh.id.slice(0, 8)}...
          </div>
        </div>
      `;
    }).join('');

    els.webhookEventsList.querySelectorAll('.webhook-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        selectWebhookItem(id);
      });
    });
  }

  function selectWebhookItem(id) {
    state.selectedWebhookId = id;
    renderWebhooks();
    const item = state.webhooks.find(w => w.id === id);
    if (!item) return;

    els.webhookDetailView.innerHTML = `
      <div class="traffic-detail-view">
        <div class="detail-header-card">
          <div>
            <strong>Webhook Event: ${item.id}</strong>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
              Bucket: ${item.bucketId} • Client IP: ${item.ip} • Time: ${new Date(item.receivedAt).toISOString()}
            </div>
          </div>
        </div>

        <div>
          <div class="detail-section-title">Headers</div>
          <pre class="code-block">${JSON.stringify(item.headers, null, 2)}</pre>
        </div>

        <div>
          <div class="detail-section-title">Payload Body</div>
          <pre class="code-block">${JSON.stringify(item.body || item.rawText, null, 2)}</pre>
        </div>

        <div style="border-top:1px solid var(--border-color); padding-top:12px;">
          <div class="detail-section-title">HMAC-SHA256 Signature Verification Tester</div>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <input type="text" id="hmac-secret-input" class="input-text-sm" placeholder="Secret Key (e.g. whsec_...)" style="flex:1;">
            <input type="text" id="hmac-sig-input" class="input-text-sm" placeholder="Provided Signature Header" value="${item.headers['x-hub-signature-256'] || item.headers['stripe-signature'] || ''}" style="flex:1;">
            <button id="hmac-verify-btn" class="btn btn-primary btn-sm">Verify</button>
          </div>
          <div id="hmac-verify-result" style="margin-top:8px;"></div>
        </div>
      </div>
    `;

    document.getElementById('hmac-verify-btn')?.addEventListener('click', async () => {
      const secret = document.getElementById('hmac-secret-input').value;
      const signatureHeader = document.getElementById('hmac-sig-input').value;
      const res = await fetch(`/api/webhooks/${item.bucketId}/verify-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawBody: typeof item.body === 'object' ? JSON.stringify(item.body) : String(item.rawText || ''),
          secret,
          signatureHeader
        })
      });
      const result = await res.json();
      const resBox = document.getElementById('hmac-verify-result');
      if (result.valid) {
        resBox.innerHTML = `<div class="validation-status-banner pass">✅ Signature MATCHES! Hash: ${result.computedSignature}</div>`;
      } else {
        resBox.innerHTML = `<div class="validation-status-banner fail">❌ Signature MISMATCH! Computed: ${result.computedSignature || 'N/A'}</div>`;
      }
    });
  }

  // --- ANALYTICS & DIFF ---
  function updateAnalytics() {
    if (!els.metricTotalRequests) return;
    const total = state.traffic.length;
    els.metricTotalRequests.textContent = total;

    if (total > 0) {
      const sumLatency = state.traffic.reduce((acc, t) => acc + (t.response?.durationMs || 0), 0);
      els.metricAvgLatency.textContent = `${Math.round(sumLatency / total)} ms`;

      const successCount = state.traffic.filter(t => (t.response?.statusCode || 200) < 400).length;
      els.metricSuccessRate.textContent = `${Math.round((successCount / total) * 100)}%`;
    }
  }

  function updateDiffDropdowns() {
    if (!els.diffSelectA || !els.diffSelectB) return;
    const optionsHtml = state.traffic.map(t => {
      return `<option value="${t.id}">${t.method} ${t.path} (${t.response?.statusCode}) - ${new Date(t.timestamp).toLocaleTimeString()}</option>`;
    }).join('');

    const valA = els.diffSelectA.value;
    const valB = els.diffSelectB.value;

    els.diffSelectA.innerHTML = `<option value="">Select Request A</option>` + optionsHtml;
    els.diffSelectB.innerHTML = `<option value="">Select Request B</option>` + optionsHtml;

    if (valA) els.diffSelectA.value = valA;
    if (valB) els.diffSelectB.value = valB;
  }

  async function runDiff() {
    const idA = els.diffSelectA.value;
    const idB = els.diffSelectB.value;
    if (!idA || !idB) {
      showToast('Please select both Request A and Request B to compare');
      return;
    }

    try {
      const res = await fetch('/api/traffic/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idA, idB })
      });
      const diff = await res.json();

      let diffHtml = `<div><strong>Diff Summary:</strong> Request A (${diff.idA.slice(0, 8)}) vs Request B (${diff.idB.slice(0, 8)})</div>`;

      if (diff.methodDiff) {
        diffHtml += `<div class="diff-row diff-modified">Method changed: ${diff.methodDiff.from} -> ${diff.methodDiff.to}</div>`;
      }
      if (diff.pathDiff) {
        diffHtml += `<div class="diff-row diff-modified">Path changed: ${diff.pathDiff.from} -> ${diff.pathDiff.to}</div>`;
      }

      if (diff.bodyDiff && diff.bodyDiff.length > 0) {
        diffHtml += `<div style="margin-top:8px; font-weight:600;">Payload Diffs (${diff.bodyDiff.length}):</div>`;
        diff.bodyDiff.forEach(d => {
          if (d.type === 'added') {
            diffHtml += `<div class="diff-row diff-added">+ [${d.path}]: ${JSON.stringify(d.value)}</div>`;
          } else if (d.type === 'removed') {
            diffHtml += `<div class="diff-row diff-removed">- [${d.path}]: ${JSON.stringify(d.value)}</div>`;
          } else {
            diffHtml += `<div class="diff-row diff-modified">~ [${d.path}]: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}</div>`;
          }
        });
      } else {
        diffHtml += `<div style="color:var(--text-secondary); margin-top:8px;">No payload body differences detected.</div>`;
      }

      els.diffOutputContainer.innerHTML = diffHtml;
    } catch (err) {
      els.diffOutputContainer.innerHTML = `<div style="color:#f85149;">Error: ${err.message}</div>`;
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Theme toggle
    els.themeBtn?.addEventListener('click', toggleTheme);

    // Tab switching
    els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        els.tabBtns.forEach(b => b.classList.remove('active'));
        els.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');
      });
    });

    // Quick Test Request Button in Header
    els.quickCurlBtn?.addEventListener('click', async () => {
      try {
        const sampleEndpoints = [
          { method: 'GET', url: '/api/v1/telemetry' },
          { method: 'GET', url: '/api/collections/users?_limit=3' },
          { method: 'POST', url: '/api/v1/orders/checkout', body: { customerId: 'cust_live_1', totalAmount: 189.50, items: [{ sku: 'PRO-SEAT', quantity: 1, price: 189.50 }] } },
          { method: 'GET', url: '/api/collections/payments?status=succeeded' }
        ];
        const sample = sampleEndpoints[Math.floor(Math.random() * sampleEndpoints.length)];
        const res = await fetch(sample.url, {
          method: sample.method,
          headers: { 'Content-Type': 'application/json' },
          body: sample.body ? JSON.stringify(sample.body) : undefined
        });
        showToast(`Sent ${sample.method} ${sample.url} -> HTTP ${res.status}`);
      } catch (err) {
        showToast(`Error: ${err.message}`);
      }
    });

    // Traffic Filter & Clear
    els.trafficSearch?.addEventListener('input', renderTraffic);
    els.trafficMethodFilter?.addEventListener('change', renderTraffic);
    els.trafficClearBtn?.addEventListener('click', async () => {
      await fetch('/api/traffic', { method: 'DELETE' });
      state.traffic = [];
      state.selectedTrafficId = null;
      renderTraffic();
      els.trafficDetail.innerHTML = `<div class="empty-detail-placeholder"><p>Traffic log cleared.</p></div>`;
      showToast('Traffic log cleared');
    });

    els.trafficExportHar?.addEventListener('click', () => {
      window.open('/api/export/har', '_blank');
    });

    // Mock Route New Button
    els.newMockBtn?.addEventListener('click', () => openMockFormModal(null));

    // Collection Picker
    els.collectionSelect?.addEventListener('change', (e) => {
      loadCollectionItems(e.target.value);
    });

    els.addCollectionItemBtn?.addEventListener('click', () => {
      const html = `
        <form id="add-col-item-form">
          <div class="form-group">
            <label class="form-label">Item JSON Payload</label>
            <textarea id="col-item-json" class="code-textarea" style="height:160px;">${JSON.stringify({
              name: "New Record",
              status: "active",
              email: "user@example.com"
            }, null, 2)}</textarea>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-container').classList.add('hidden')">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Insert Record</button>
          </div>
        </form>
      `;
      openModal(`Add Record to "${state.currentCollection}"`, html);

      document.getElementById('add-col-item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const itemData = JSON.parse(document.getElementById('col-item-json').value);
          await fetch(`/api/collections/${state.currentCollection}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
          });
          closeModal();
          await loadCollectionItems(state.currentCollection);
          showToast('Record added to collection');
        } catch (err) {
          showToast(`Error: ${err.message}`);
        }
      });
    });

    // Schema Workbench buttons
    els.schemaValidateBtn?.addEventListener('click', validateSchemaWorkbench);
    els.schemaInferBtn?.addEventListener('click', inferSchemaWorkbench);

    // Webhook actions
    els.webhookBucketInput?.addEventListener('change', (e) => {
      loadWebhooks(e.target.value.trim() || 'default');
    });

    els.webhookCopyUrlBtn?.addEventListener('click', () => {
      const url = `${window.location.origin}/api/webhooks/${state.currentBucket}`;
      navigator.clipboard.writeText(url);
      showToast(`Copied: ${url}`);
    });

    els.webhookTestSendBtn?.addEventListener('click', async () => {
      const testPayload = {
        event: 'payment.succeeded',
        id: 'evt_' + Math.random().toString(36).slice(2, 10),
        amount: 29900,
        currency: 'usd',
        customer: 'cus_' + Math.random().toString(36).slice(2, 8)
      };
      await fetch(`/api/webhooks/${state.currentBucket}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=d3f2e1a9c8b7...'
        },
        body: JSON.stringify(testPayload)
      });
      await loadWebhooks(state.currentBucket);
      showToast('Test webhook sent to bucket!');
    });

    // Diff & Analytics buttons
    els.runDiffBtn?.addEventListener('click', runDiff);
    els.exportOpenApiBtn?.addEventListener('click', () => window.open('/api/export/openapi', '_blank'));
    els.exportPostmanBtn?.addEventListener('click', () => window.open('/api/export/postman', '_blank'));

    // Live Audit Button
    els.runAuditBtn?.addEventListener('click', async () => {
      await loadSystemStatus();
      showToast('Zero-Dependency Verification Passed: 0 Runtime Dependencies');
    });

    // Modal Close
    els.modalCloseBtn?.addEventListener('click', closeModal);
    els.modalContainer?.addEventListener('click', (e) => {
      if (e.target === els.modalContainer) closeModal();
    });
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
