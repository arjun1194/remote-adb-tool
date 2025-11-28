import net from 'net';
import chalk from 'chalk';

export class ProxyServer {
  private server: net.Server;

  constructor(private port: number) {
    this.server = net.createServer((clientSocket) => {
      // Connect to the local adb forward port
      const serviceSocket = new net.Socket();
      serviceSocket.connect(this.port, '127.0.0.1', () => {
        // Pipe data between client and service
        clientSocket.pipe(serviceSocket);
        serviceSocket.pipe(clientSocket);
      });

      serviceSocket.on('error', (err) => {
        // console.error(`[Proxy ${this.port}] Service error:`, err.message);
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        // console.error(`[Proxy ${this.port}] Client error:`, err.message);
        serviceSocket.end();
      });

      clientSocket.on('close', () => {
        serviceSocket.end();
      });
      
      serviceSocket.on('close', () => {
        clientSocket.end();
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(chalk.dim(`[Proxy] Listening on 0.0.0.0:${this.port} -> 127.0.0.1:${this.port}`));
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
