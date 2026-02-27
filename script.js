/* ---------- original panel/demo data (unchanged) ---------- */
let panels = [
  { id: 1, name: 'Panel A1', group: 'Group 1', capacity: 5.5, charge: 4.2, efficiency: 85 },
  { id: 2, name: 'Panel A2', group: 'Group 1', capacity: 5.5, charge: 3.8, efficiency: 78 },
  { id: 3, name: 'Panel B1', group: 'Group 2', capacity: 6.0, charge: 5.1, efficiency: 92 },
  { id: 4, name: 'Panel B2', group: 'Group 2', capacity: 6.0, charge: 4.8, efficiency: 88 },
  { id: 5, name: 'Panel C1', group: '', capacity: 5.0, charge: 3.5, efficiency: 80 }
];

let chartData = [];
// LDRs - 6 sensors: N, NE, E, S, SW, W
let ldrValues = { east: 0, northeast: 0, northwest: 0, west: 0, southwest: 0, southeast: 0 };

/* --- keep the escapeHtml and panel rendering logic intact --- */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderPanels() {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';

  const grouped = {};
  panels.forEach(panel => {
    const group = panel.group || 'Ungrouped';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(panel);
  });

  Object.keys(grouped).sort().forEach(groupName => {
    const groupPanels = grouped[groupName];
    const totalCapacity = groupPanels.reduce((sum, p) => sum + p.capacity, 0);
    const totalCharge = groupPanels.reduce((sum, p) => sum + p.charge, 0);

    const section = document.createElement('div');
    section.className = 'group-section';

    let panelsHTML = '';
    groupPanels.forEach(panel => {
      const chargePercent = (panel.charge / panel.capacity) * 100;
      panelsHTML += `
        <div class="panel-item">
          <div class="panel-info">
            <div class="panel-name">${escapeHtml(panel.name)}</div>
            <div class="panel-detail"><span class="panel-detail-label">Capacity:</span> <span class="panel-detail-value">${panel.capacity} kW</span></div>
            <div class="panel-detail"><span class="panel-detail-label">Charge:</span> <span class="panel-detail-value">${panel.charge.toFixed(1)} kWh</span></div>
            <div class="panel-detail"><span class="panel-detail-label">Efficiency:</span> <span class="panel-detail-value">${panel.efficiency}%</span></div>
          </div>
          <div class="panel-actions">
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(100, chargePercent)}%"></div>
              </div>
              <span class="progress-text">${Math.min(100, chargePercent).toFixed(0)}%</span>
            </div>
            <button class="delete-btn" onclick="deletePanel(${panel.id})">Remove</button>
          </div>
        </div>
      `;
    });

    section.innerHTML = `
      <div class="group-header">
        <div class="group-title">${escapeHtml(groupName)}</div>
        <div class="group-stats">
          ${groupPanels.length} panel(s) | ${totalCharge.toFixed(1)}/${totalCapacity.toFixed(1)} kWh
        </div>
      </div>
      <div class="panels-list">${panelsHTML}</div>
    `;
    container.appendChild(section);
  });

  if (panels.length === 0) {
    container.innerHTML = '<div class="empty-state">No panels added yet. Click "Add Panel" to get started.</div>';
  }

  updateStatistics();
}

function deletePanel(id) {
  if (confirm('Are you sure you want to remove this panel?')) {
    panels = panels.filter(p => p.id !== id);
    renderPanels();
  }
}

function updateStatistics() {
  document.getElementById('totalPanels').textContent = panels.length;
  const totalCharge = panels.reduce((sum, p) => sum + p.charge, 0);
  document.getElementById('totalCharge').textContent = totalCharge.toFixed(1);
  const avgEfficiency = panels.length > 0 ? Math.round(panels.reduce((s, p) => s + p.efficiency, 0) / panels.length) : 0;
  document.getElementById('avgEfficiency').textContent = avgEfficiency;
  const groups = [...new Set(panels.map(p => p.group).filter(g => g))];
  document.getElementById('activeGroups').textContent = groups.length;

  const container = document.getElementById('individualPanelStats');
  container.innerHTML = '';
  if (panels.length === 0) {
    container.innerHTML = '<div class="empty-state">No panels to display</div>';
    return;
  }
  panels.forEach(panel => {
    const item = document.createElement('div');
    item.className = 'panel-stat-item';
    const chargePercent = (panel.charge / panel.capacity) * 100;
    item.innerHTML = `
      <div style="flex: 1; min-width: 200px;">
        <strong>${escapeHtml(panel.name)}</strong> ${panel.group ? `(${escapeHtml(panel.group)})` : ''}
        <div class="progress-bar" style="margin-top: 8px;">
          <div class="progress-fill" style="width: ${Math.min(100, chargePercent)}%"></div>
        </div>
      </div>
      <div style="text-align: right;">
        <div><strong>${panel.charge.toFixed(1)}</strong> / ${panel.capacity} kWh</div>
        <div style="color: #888; font-size: 14px;">${panel.efficiency}% efficient</div>
      </div>
    `;
    container.appendChild(item);
  });
}

/* Chart: initialize and draw (FIXED to use correct ID) */
function initChart() {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function draw() {
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, width, height);
    if (!chartData.length) return;

    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const maxValue = Math.max(...chartData.map(d => d.value));
    const xStep = width / (chartData.length - 1);

    chartData.forEach((point, i) => {
      const x = i * xStep;
      const y = height - (point.value / maxValue) * height * 0.9;
      if (i === 0) ctx.moveTo(x, y); 
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#667eea';
    chartData.forEach((point, i) => {
      const x = i * xStep;
      const y = height - (point.value / maxValue) * height * 0.9;
      ctx.beginPath(); 
      ctx.arc(x, y, 4, 0, Math.PI * 2); 
      ctx.fill();
    });

    // Draw labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(chartData.length / 6);
    chartData.forEach((point, i) => {
      if (i % labelStep === 0) {
        const x = i * xStep;
        ctx.fillText(point.time, x, height - 5);
      }
    });
  }

  draw();
  window.addEventListener('resize', draw);
}

/* Update LDR elements (6 sensors) in UI */
function updateLDRValuesOnUI() {
  const el = {
    north: document.getElementById('ldrNorth'),
    northeast: document.getElementById('ldrNorthEast'),
    east: document.getElementById('ldrEast'),
    south: document.getElementById('ldrSouth'),
    southwest: document.getElementById('ldrSouthWest'),
    west: document.getElementById('ldrWest')
  };
  
  Object.keys(el).forEach(k => {
    if (el[k]) el[k].textContent = ldrValues[k] || 0;
  });
}

/* Simulate updates for panels & LDRs */
function simulateDataUpdates() {
  setInterval(() => {
    // Simulate LDR values
    ldrValues = {
      east: Math.floor(Math.random() * 1000 + 200),
      northeast: Math.floor(Math.random() * 1000 + 200),
      northwest: Math.floor(Math.random() * 1000 + 200),
      west: Math.floor(Math.random() * 1000 + 200),
      southwest: Math.floor(Math.random() * 1000 + 200),
      southeast: Math.floor(Math.random() * 1000 + 200)
    };
    updateLDRValuesOnUI();

    // Update panels
    panels.forEach(panel => {
      panel.charge = Math.min(panel.capacity, panel.charge + (Math.random() * 0.1));
      panel.efficiency = Math.min(100, Math.max(60, panel.efficiency + (Math.random() * 4 - 2)));
    });

    // Update chart data
    chartData.shift();
    chartData.push({
      time: new Date().getHours() + ':' + new Date().getMinutes(),
      value: Math.random() * 20 + 30
    });

    renderPanels();
    initChart();
  }, 5000);
}

/* Add panel modal handlers */
function openAddModal() { 
  document.getElementById('addModal').classList.add('active'); 
}

function closeAddModal() { 
  document.getElementById('addModal').classList.remove('active'); 
  document.getElementById('addPanelForm').reset(); 
}

document.getElementById('addPanelBtn').addEventListener('click', openAddModal);
document.getElementById('cancelBtn').addEventListener('click', closeAddModal);
document.getElementById('addModal').addEventListener('click', (e) => { 
  if (e.target.id === 'addModal') closeAddModal(); 
});

document.getElementById('addPanelForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const capacity = parseFloat(document.getElementById('panelCapacity').value);
  const charge = parseFloat(document.getElementById('panelCharge').value);
  if (charge > capacity) { 
    alert('Current charge cannot exceed capacity!'); 
    return; 
  }
  const newPanel = {
    id: Date.now(),
    name: document.getElementById('panelName').value,
    group: document.getElementById('panelGroup').value.trim(),
    capacity: capacity,
    charge: charge,
    efficiency: Math.floor(Math.random() * 20 + 70)
  };
  panels.push(newPanel);
  renderPanels();
  closeAddModal();
});

/* Theme handling */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else if (theme === 'light') {
    document.body.classList.remove('dark-theme');
  } else {
    // auto - follow system preference
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) document.body.classList.add('dark-theme');
    else document.body.classList.remove('dark-theme');
  }
}

/* Navigation */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(item.dataset.page).classList.add('active');
    
    // Redraw chart when statistics page opens
    if (item.dataset.page === 'statistics') {
      setTimeout(() => initChart(), 100);
    }
  });
});

/* Initialize page */
document.addEventListener('DOMContentLoaded', function () {
  // Theme handling
  const themeSelect = document.getElementById('themeSelect');
  const storageKey = 'solarTheme';
  
  const saved = localStorage.getItem(storageKey) || 'auto';
  if (themeSelect) {
    themeSelect.value = saved;
    applyTheme(saved);
    
    themeSelect.addEventListener('change', function() {
      const val = themeSelect.value;
      localStorage.setItem(storageKey, val);
      applyTheme(val);
    });
  } else {
    applyTheme(saved);
  }
  
  // React to system theme changes when in 'auto' mode
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = localStorage.getItem(storageKey) || 'auto';
      if (current === 'auto') applyTheme('auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  // Initialize chart data with 24 sample points
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now - i * 3600000);
    chartData.push({ 
      time: time.getHours() + ':00', 
      value: Math.random() * 20 + 30 
    });
  }

  // Initialize everything
  renderPanels();
  updateLDRValuesOnUI();
  initChart();
  simulateDataUpdates();
});