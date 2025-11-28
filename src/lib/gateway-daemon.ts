import { adbClient, AdbDevice } from './adb-client.js';
import { ProxyServer } from './proxy-server.js';
import { StateManager, ExposedDevice } from './state-manager.js';
import chalk from 'chalk';
import os from 'os';

const BASE_PORT = 15000;

interface ActiveSession {
  device: AdbDevice;
  port: number;
  proxy: ProxyServer;
}

export class GatewayDaemon {
  private sessions = new Map<string, ActiveSession>(); // serial -> session
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(chalk.green('Gateway Daemon Started. Polling for devices...'));
    
    // Clean up any stale state on start
    await StateManager.saveState([]);

    this.poll();
    this.pollingInterval = setInterval(() => this.poll(), 3000);
  }

  async stop() {
    this.isRunning = false;
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    
    for (const session of this.sessions.values()) {
      await session.proxy.stop();
      await adbClient.removeForward(session.port);
    }
    this.sessions.clear();
    await StateManager.saveState([]);
  }

  private async poll() {
    try {
      const devices = await adbClient.getDevices();
      
      // Filter only USB devices or devices that are connected (ignoring emulators/network if desired, 
      // but for now we take all valid 'device' states that aren't our own forwards if possible. 
      // Since we don't easily know which are ours without checking ports, we'll just check if we are already handling them 
      // or if they are standard adb devices).
      // A simple heuristic: only expose valid 'device' state.
      const validDevices = devices.filter(d => d.state === 'device');

      const foundSerials = new Set(validDevices.map(d => d.serial));
      
      // Handle Removals
      for (const [serial, session] of this.sessions) {
        if (!foundSerials.has(serial)) {
          console.log(chalk.red(`Device disconnected: ${session.device.model} (${serial})`));
          await session.proxy.stop();
          await adbClient.removeForward(session.port);
          this.sessions.delete(serial);
        }
      }

      // Handle Additions
      for (const device of validDevices) {
        if (!this.sessions.has(device.serial)) {
          await this.initializeDevice(device);
        }
      }

      // Update State File
      await this.updateStateFile();

    } catch (err) {
      console.error('Error in polling loop:', err);
    }
  }

  private async initializeDevice(device: AdbDevice) {
    console.log(chalk.yellow(`New device found: ${device.model} (${device.serial})`));
    
    // Allocate Port (Simple strategy: Find first gap or increment)
    const usedPorts = new Set(Array.from(this.sessions.values()).map(s => s.port));
    let port = BASE_PORT;
    while (usedPorts.has(port)) {
      port++;
    }

    try {
      // 1. Enable TCP/IP (Idempotent-ish, but restarts adbd)
      // console.log(`  Setting TCP/IP 5555 on ${device.serial}...`);
      await adbClient.tcpip(device.serial, 5555);
      
      // Wait a moment for adbd to restart? usually fast enough or forward waits? 
      // Actually, 'tcpip' returns when done. But the device might disappear briefly from USB list? 
      // If it disappears, next poll handles removal, then re-addition. 
      // But we are in the init phase. Let's hope it stays or we handle the error.

      // 2. Forward Port
      // console.log(`  Forwarding ${port} -> 5555...`);
      await adbClient.forward(device.serial, port, 5555);

      // 3. Start Proxy
      const proxy = new ProxyServer(port);
      await proxy.start();

      this.sessions.set(device.serial, {
        device,
        port,
        proxy
      });

      console.log(chalk.green(`  Ready at 0.0.0.0:${port}`));

    } catch (err: any) {
      console.error(chalk.red(`  Failed to initialize ${device.serial}: ${err.message}`));
    }
  }

  private async updateStateFile() {
    const exposedList: ExposedDevice[] = Array.from(this.sessions.values()).map(s => ({
      serial: s.device.serial,
      model: s.device.model || 'Unknown',
      port: s.port,
      host: this.getIpAddress(),
      state: 'available'
    }));
    await StateManager.saveState(exposedList);
  }

  private getIpAddress(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        // Skip internal (i.e. 127.0.0.1) and non-ipv4
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return 'localhost';
  }
}
