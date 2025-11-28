import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface ExposedDevice {
  serial: string;
  model: string;
  port: number;
  host: string; // IP of the gateway (helper for display, but usually localhost from gateway perspective)
  state: string;
}

const STATE_FILE = path.join(os.homedir(), '.remote-adb.json');

export class StateManager {
  static async saveState(devices: ExposedDevice[]) {
    await fs.writeJSON(STATE_FILE, devices, { spaces: 2 });
  }

  static async loadState(): Promise<ExposedDevice[]> {
    try {
      return await fs.readJSON(STATE_FILE);
    } catch (e) {
      return [];
    }
  }
  
  static getPath(): string {
    return STATE_FILE;
  }
}
