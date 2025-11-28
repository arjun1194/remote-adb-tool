#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { serveCommand } from './commands/serve.js';
import { connectCommand } from './commands/connect.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program
  .name('adb-remote')
  .description('Share and connect to ADB devices remotely')
  .version('1.0.0');

program.addCommand(serveCommand);
program.addCommand(connectCommand);
program.addCommand(listCommand);

program.parse(process.argv);
