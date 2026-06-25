// ============================================================================
// App.jsx  --  the dashboard's brain
// ----------------------------------------------------------------------------
// Responsibilities:
//   - load the device list once on startup
//   - hold every device in a map keyed by id, so updates are easy to apply
//   - open the live WebSocket and fold each pushed update into that map
//   - render the fleet grid, and a detail panel for the selected device
//
// The mental model for live updates: the backend re-sends a device's full row
// whenever anything about it changes, so our handler is just "replace my copy."
// No diffing, no guessing.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { fetchDevices, connectWebSocket } from './api.js';
import DeviceRow from './components/DeviceRow.jsx';
import DeviceDetail from './components/DeviceDetail.jsx';

export default function App() {
  const [devices, setDevices] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // The most recent telemetry point we've seen. The detail panel watches this
  // and appends it to its chart when it matches the open device.
  const [livePoint, setLivePoint] = useState(null);

  useEffect(() => {
    // 1. Initial load: seed the map from the REST list.
    fetchDevices()
      .then((list) => {
        const map = {};
        for (const d of list) map[d.id] = d;
        setDevices(map);
      })
      .catch((err) => console.error(err));

    // 2. Live updates over the WebSocket.
    const ws = connectWebSocket((msg) => {
      setConnected(true);
      if (msg.type === 'device') {
        // Replace our copy of this one device.
        setDevices((prev) => ({ ...prev, [msg.device.id]: msg.device }));
      } else if (msg.type === 'telemetry') {
        // Surface the point for the detail chart.
        setLivePoint({ id: msg.id, metric: msg.metric, value: msg.value, ts: msg.ts });
      }
    });

    // 3. Clean up the socket if this component ever unmounts.
    return () => ws.close();
  }, []);

  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const deviceList = Object.values(devices);
  const online = deviceList.filter((d) => d.online).length;
  const selected = selectedId ? devices[selectedId] : null;

  const sortedDevices = [...deviceList].sort((a, b) => {
    let av = a[sortKey] ?? '';
    let bv = b[sortKey] ?? '';
    if (typeof av === 'boolean') av = av ? 1 : 0;
    if (typeof bv === 'boolean') bv = bv ? 1 : 0;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>Device Console</h1>
            <p className="brand-sub">ColeDD fleet monitor</p>
          </div>
        </div>
        <div className="fleet-stats">
          <Stat label="devices" value={deviceList.length} />
          <Stat label="online" value={online} accent />
          <span className={`link-pill ${connected ? 'on' : 'off'}`}>
            <span className="dot" /> {connected ? 'live' : 'connecting'}
          </span>
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>

      <main className="table-wrap">
        {deviceList.length === 0 ? (
          <div className="empty">
            Waiting for devices to report in. If this stays empty, check that the
            simulator container is running.
          </div>
        ) : (
          <table className="device-table">
            <thead>
              <tr>
                <th></th>
                <SortTh label="Device"   col="name"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Location" col="location"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Type"     col="type"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Temp"     col="temperature"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Humidity" col="humidity"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="LED"      col="led_state"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Switch"   col="switch_state"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onOpen={() => setSelectedId(device.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </main>

      {selected && (
        <DeviceDetail
          device={selected}
          livePoint={livePoint}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function SortTh({ label, col, sortKey, sortDir, onSort }) {
  const active = sortKey === col;
  return (
    <th className={`sortable ${active ? 'sorted' : ''}`} onClick={() => onSort(col)}>
      {label}
      <span className="sort-indicator">
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

// Small labelled number used in the header.
function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <span className={`stat-value ${accent ? 'accent' : ''}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
