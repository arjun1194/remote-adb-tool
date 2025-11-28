import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import { GatewayDaemon } from '../lib/gateway-daemon.js';

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'YOUR_IP_ADDRESS';
}

export const serveCommand = new Command('serve')
  .description('Start the Gateway daemon to expose devices')
  .action(async () => {
    const user = os.userInfo().username;
    const ip = getLocalIp();
    
    console.log(chalk.bold.blue('ADB Gateway Started!'));
    console.log(chalk.dim('---------------------------------------------'));
    console.log(`To connect to this machine from your office, run:`);
    console.log(chalk.cyan.bold(`  adb-remote connect ${user}@${ip}`));
    console.log(chalk.dim('---------------------------------------------'));
    console.log(chalk.dim('(Note: If you are outside your home network, you may need'));
    console.log(chalk.dim(' to use your Public IP or a VPN and forward port 22).'));
    console.log('');

    const daemon = new GatewayDaemon();
    await daemon.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\nStopping...');
      await daemon.stop();
      process.exit(0);
    });
  });