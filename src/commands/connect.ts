import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { ClientManager } from '../lib/client-manager.js';

export const connectCommand = new Command('connect')
  .description('Connect to a remote Gateway')
  .argument('<host>', 'SSH connection string (e.g., user@192.168.1.5)')
  .action(async (host) => {
    const client = new ClientManager();
    
    console.log(chalk.blue(`Fetching devices from ${host}...`));
    const remoteDevices = await client.fetchRemoteDevices(host);
    
    if (remoteDevices.length === 0) {
      console.log(chalk.yellow('No devices found on remote host.'));
      return;
    }

    const activeTunnels = await client.getActiveTunnels();
    
    // Determine initial selection
    // Map remote device serials to checked state if a tunnel exists
    const choices = remoteDevices.map(d => {
      const isConnected = activeTunnels.some(t => t.serial === d.serial && t.host === host);
      return {
        title: `${d.model} (${d.serial}) [${d.port}]`,
        value: d.serial,
        selected: isConnected,
        description: isConnected ? 'Connected' : 'Available'
      };
    });

    const response = await prompts({
      type: 'multiselect',
      name: 'selectedSerials',
      message: 'Select devices to connect:',
      choices,
      instructions: false,
      hint: '- Space to select. Return to submit'
    });

    if (!response.selectedSerials) {
      console.log('Operation cancelled.');
      return;
    }

    const selectedSet = new Set(response.selectedSerials as string[]);
    const newTunnels = [...activeTunnels];

    // Process Disconnections (Unselected but previously active for this host)
    for (let i = newTunnels.length - 1; i >= 0; i--) {
      const tunnel = newTunnels[i];
      if (tunnel.host === host && !selectedSet.has(tunnel.serial)) {
        // Was connected, now unselected -> Disconnect
        await client.disconnectDevice(tunnel);
        newTunnels.splice(i, 1);
      }
    }

    // Process Connections (Selected)
    for (const serial of selectedSet) {
      const device = remoteDevices.find(d => d.serial === serial);
      if (!device) continue;

      const existing = newTunnels.find(t => t.serial === serial && t.host === host);
      if (!existing) {
        // Not connected, now selected -> Connect
        const tunnel = await client.connectDevice(host, device);
        newTunnels.push(tunnel);
      }
    }

    await client.saveTunnels(newTunnels);
    console.log(chalk.green('\nSynchronization complete!'));
    console.log('Run `adb devices` to verify.');
  });