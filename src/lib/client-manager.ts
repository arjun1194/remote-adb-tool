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
  private getSshControlOptions(): string[] {
    const controlPath = path.join(os.tmpdir(), 'remote-adb-ssh-%r@%h:%p');
    return [
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${controlPath}`,
      '-o', 'ControlPersist=10m'
    ];
  }

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
      // Combine commands to ensure single authentication and establish master connection
      // Try 'adb-remote list --json' OR 'cat .remote-adb.json'
      const cmd = 'adb-remote list --json || cat .remote-adb.json';

      const { stdout } = await execa('ssh', [
        ...this.getSshControlOptions(),
        host,
        cmd
      ]);

      return JSON.parse(stdout);
    } catch (error: any) {
      console.error(chalk.red(`Failed to fetch devices from ${host}.`));
      console.error(chalk.yellow('Debug Info:'), error.stderr || error.message);
      return [];
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

    // Use the same control options to reuse the master connection
    const subprocess = execa('ssh', [
      ...this.getSshControlOptions(),
      '-N',
      '-L', `${localPort}:127.0.0.1:${device.port}`,
      host
    ], {
      detached: true, // Keep running
      stdio: 'ignore'
    });

    subprocess.unref(); // Let it run in background

    // Wait a bit for tunnel to establish
    await new Promise(r => setTimeout(r, 2000));

    // Check if tunnel process is still alive
    if (subprocess.exitCode !== null) {
      console.error(chalk.red(`  SSH tunnel failed to start (Exit Code: ${subprocess.exitCode})`));
      return {
        serial: device.serial,
        localPort,
        remotePort: device.port,
        host,
        pid: undefined
      };
    }

    // ADB Connect
    console.log(chalk.dim(`  adb connect localhost:${localPort}...`));
    try {
      const result = await execa('adb', ['connect', `localhost:${localPort}`]);
      console.log(chalk.dim('  ADB Output:'), result.stdout);

      if (result.stdout.includes('connected to')) {
        console.log(chalk.green(`  Successfully connected to ${device.serial} on port ${localPort}`));
      } else {
        console.log(chalk.yellow(`  ADB might not have connected successfully. Check output above.`));
      }
    } catch (e: any) {
      console.error(chalk.red('  ADB Connect Failed:'), e.stderr || e.message);
    }

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
    } catch { }

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
