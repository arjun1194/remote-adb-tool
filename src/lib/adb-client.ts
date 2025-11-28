import { execa } from 'execa';

export interface AdbDevice {
  serial: string;
  state: string; // 'device', 'offline', 'unauthorized'
  model?: string;
  product?: string;
  transportId?: string;
}

export class AdbClient {
  async getDevices(): Promise<AdbDevice[]> {
    try {
      const { stdout } = await execa('adb', ['devices', '-l']);
      const lines = stdout.split('\n').filter(line => line.trim() !== '' && !line.startsWith('List of devices'));
      
      return lines.map(line => {
        // Example: 8C9X1UD5N device usb:123 product:raven model:Pixel_6 device:raven transport_id:1
        const parts = line.split(/\s+/);
        const serial = parts[0];
        const state = parts[1];
        
        const model = parts.find(p => p.startsWith('model:'))?.split(':')[1];
        const product = parts.find(p => p.startsWith('product:'))?.split(':')[1];
        const transportId = parts.find(p => p.startsWith('transport_id:'))?.split(':')[1];

        return { serial, state, model, product, transportId };
      });
    } catch (error) {
      console.error('Error listing devices:', error);
      return [];
    }
  }

  async tcpip(serial: string, port: number = 5555): Promise<void> {
    await execa('adb', ['-s', serial, 'tcpip', port.toString()]);
  }

  async forward(serial: string, localPort: number, remotePort: number): Promise<void> {
    await execa('adb', ['-s', serial, 'forward', `tcp:${localPort}`, `tcp:${remotePort}`]);
  }

  async removeForward(localPort: number): Promise<void> {
    await execa('adb', ['forward', '--remove', `tcp:${localPort}`]);
  }

  async removeAllForwards(): Promise<void> {
    await execa('adb', ['forward', '--remove-all']);
  }
}

export const adbClient = new AdbClient();
