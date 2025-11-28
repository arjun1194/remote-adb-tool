import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ExposedDevice } from './state-manager.js';
import chalk from 'chalk';

interface ActiveTunnel {
  serial: string;
  localPort: number;
  remotePort: number;
  host: string;
  pid?: number;
}

const CLIENT_STATE_FILE = path.join(os.homedir(), '.remote-adb-client.json');

export class ClientManager {
  async getActiveTunnels(): Promise<ActiveTunnel[]> {
    try {
      return await fs.readJSON(CLIENT_STATE_FILE);
    } catch {
      return [];
    }
  }

  async saveTunnels(tunnels: ActiveTunnel[]) {
    await fs.writeJSON(CLIENT_STATE_FILE, tunnels, { spaces: 2 });
  }

  async fetchRemoteDevices(host: string): Promise<ExposedDevice[]> {
    try {
      // Try using the CLI first
      const { stdout } = await execa('ssh', [host, 'adb-remote list --json']);
      return JSON.parse(stdout);
    } catch (cliError: any) {
      // If 'adb-remote' is not in PATH (common in non-interactive SSH),
      // fallback to reading the state file directly.
      try {
        const { stdout } = await execa('ssh', [host, 'cat .remote-adb.json']);
        return JSON.parse(stdout);
      } catch (fileError: any) {
        console.error(chalk.red(`Failed to fetch devices from ${host}.`));
        console.error(chalk.yellow('Debug Info (CLI):'), cliError.stderr || cliError.message);
        console.error(chalk.yellow('Debug Info (File):'), fileError.stderr || fileError.message);
        return [];
      }
    }
  }

  async connectDevice(host: string, device: ExposedDevice, existingTunnel?: ActiveTunnel): Promise<ActiveTunnel> {
    if (existingTunnel) return existingTunnel;

    // Find a free local port (simple increment for now, can be improved)
    // actually we can use the same port number as remote if available, else increment
    let localPort = device.port;
    // Check if port is taken? Net check would be better, but let's try blindly or use a helper.
    // For simplicity, we try to match remote port. 
    
    // Start SSH Tunnel
    // ssh -N -L <local>:127.0.0.1:<remote> <host>
    console.log(chalk.dim(`  Starting tunnel ${localPort} -> ${device.port}...`));
    
    const subprocess = execa('ssh', ['-N', '-L', `${localPort}:127.0.0.1:${device.port}`, host], {
      detached: true, // Keep running
      stdio: 'ignore'
    });
    
    subprocess.unref(); // Let it run in background
    
    // Wait a bit for tunnel to establish
    await new Promise(r => setTimeout(r, 2000));

    // ADB Connect
    console.log(chalk.dim(`  adb connect localhost:${localPort}...`));
    await execa('adb', ['connect', `localhost:${localPort}`]);

    return {
      serial: device.serial,
      localPort,
      remotePort: device.port,
      host,
      pid: subprocess.pid
    };
  }

  async disconnectDevice(tunnel: ActiveTunnel) {
    console.log(chalk.dim(`  Disconnecting ${tunnel.serial}...`));
    
    // ADB Disconnect
    try {
      await execa('adb', ['disconnect', `localhost:${tunnel.localPort}`]);
    } catch {}

    // Kill SSH Tunnel
    if (tunnel.pid) {
      try {
        process.kill(tunnel.pid);
      } catch (e) {
        // Process might already be gone
      }
    }
    
    // Also try pkill pattern if pid is lost or unreliable? 
    // For now rely on PID.
  }
}
