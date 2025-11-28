import { Command } from 'commander';
import chalk from 'chalk';
import { StateManager } from '../lib/state-manager.js';

export const listCommand = new Command('list')
  .description('List currently exposed devices')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const devices = await StateManager.loadState();
    
    if (options.json) {
      console.log(JSON.stringify(devices, null, 2));
    } else {
      if (devices.length === 0) {
        console.log(chalk.yellow('No devices currently exposed.'));
        return;
      }
      
      console.log(chalk.bold('Exposed Devices:'));
      devices.forEach(d => {
        console.log(chalk.green(`- ${d.model} (${d.serial})`));
        console.log(`  Connect: adb connect ${d.host}:${d.port}`);
      });
    }
  });