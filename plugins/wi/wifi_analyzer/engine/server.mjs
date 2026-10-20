import http from 'http';
import { exec } from 'child_process';
import os from 'os';

const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17850', 10);

function getWirelessInterfaces() {
  return new Promise((resolve) => {
    exec('nmcli -t -f DEVICE,TYPE,STATE dev 2>/dev/null', (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout.trim().split('\n');
        const wifiDevs = lines
          .map(l => l.split(':'))
          .filter(parts => parts[1] === 'wifi')
          .map(parts => parts[0]);
        if (wifiDevs.length > 0) return resolve(wifiDevs);
      }
      exec('iw dev 2>/dev/null | grep Interface | awk \'{print $2}\'', (err2, stdout2) => {
        if (!err2 && stdout2) {
          const devs = stdout2.trim().split('\n').map(s => s.trim()).filter(Boolean);
          if (devs.length > 0) return resolve(devs);
        }
        resolve([]);
      });
    });
  });
}

function parseLinuxScan() {
  return new Promise(async (resolve) => {
    const interfaces = await getWirelessInterfaces();
    if (interfaces.length === 0) {
      return resolve({
        hardware_present: false,
        interface: null,
        error: 'No wireless hardware adapter detected on this host. Please connect a Wi-Fi card or USB wireless dongle.',
        access_points: []
      });
    }

    exec('nmcli -t -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi list --rescan yes 2>/dev/null || nmcli -t -f SSID,BSSID,CHAN,FREQ,SIGNAL,SECURITY dev wifi list 2>/dev/null', (err, stdout) => {
      if (!err && stdout && stdout.trim().length > 0) {
        const lines = stdout.trim().split('\n');
        const aps = lines.map(line => {
          const parts = line.split(':');
          return {
            ssid: parts[0] || '<Hidden>',
            bssid: parts.slice(1, 7).join(':') || 'Unknown',
            channel: parseInt(parts[7] || '1', 10),
            freq: parts[8] || '2412 MHz',
            signal: parseInt(parts[9] || '50', 10),
            security: parts[10] || 'Open'
          };
        }).filter(ap => ap.ssid !== '<Hidden>' || ap.bssid !== 'Unknown');

        return resolve({
          hardware_present: true,
          interface: interfaces[0],
          error: null,
          access_points: aps
        });
      }

      // If nmcli succeeded but returned 0 APs
      resolve({
        hardware_present: true,
        interface: interfaces[0],
        error: null,
        access_points: []
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/api/scan') {
    const result = await parseLinuxScan();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      timestamp: Date.now(),
      hardware_present: result.hardware_present,
      interface: result.interface,
      error: result.error,
      access_points: result.access_points
    }));
  }

  if (req.url === '/api/health') {
    const interfaces = await getWirelessInterfaces();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'healthy',
      platform: os.platform(),
      hostname: os.hostname(),
      uptime_seconds: os.uptime(),
      wireless_interfaces: interfaces
    }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const cleanup = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wifi_analyzer] Microservice running on http://127.0.0.1:${PORT}`);
});
