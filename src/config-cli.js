#!/usr/bin/env node

const { Command } = require('commander');
const configManager = require('./config/ConfigManager');
const Table = require('cli-table3');
const chalk = require('chalk');
const fs = require('fs');

const program = new Command();

// Helper function to display configuration in table format
function displayConfigTable(config, schema) {
  const table = new Table({
    head: ['Section', 'Field', 'Value', 'Description'],
    colWidths: [15, 20, 30, 45]
  });
  
  for (const [section, fields] of Object.entries(config)) {
    for (const [field, value] of Object.entries(fields)) {
      const desc = schema[section]?.[field]?.description || '';
      table.push([
        section,
        field,
        JSON.stringify(value),
        desc
      ]);
    }
  }
  
  return table.toString();
}

program
  .name('mineflayer-config')
  .description('Configuration management for Mineflayer bot')
  .version('1.0.0');

// Get configuration
program
  .command('get [path]')
  .description('Get configuration value(s)')
  .option('-p, --profile <name>', 'Use specific profile')
  .option('--json', 'Output as JSON')
  .action((path, options) => {
    try {
      const value = configManager.get(path, options.profile);
      
      if (options.json) {
        console.log(JSON.stringify(value, null, 2));
      } else if (path) {
        console.log(`${chalk.cyan(path)}: ${chalk.green(JSON.stringify(value))}`);
      } else {
        const schema = configManager.getSchema();
        console.log(chalk.bold(`\nConfiguration (Profile: ${chalk.yellow(options.profile || configManager.getActiveProfile())})\n`));
        console.log(displayConfigTable(value, schema));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Set configuration
program
  .command('set <path> <value>')
  .description('Set configuration value')
  .option('-p, --profile <name>', 'Use specific profile')
  .action((path, value, options) => {
    try {
      // Try to parse value as JSON first (for objects/arrays)
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      
      configManager.set(path, parsedValue, options.profile);
      console.log(chalk.green('✓'), `Set ${chalk.cyan(path)} to ${chalk.green(JSON.stringify(parsedValue))}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Profile management
const profileCmd = program
  .command('profile')
  .description('Manage configuration profiles');

profileCmd
  .command('list')
  .description('List all profiles')
  .action(() => {
    const profiles = configManager.listProfiles();
    const active = configManager.getActiveProfile();
    
    console.log(chalk.bold('\nAvailable Profiles:\n'));
    profiles.forEach(profile => {
      const marker = profile === active ? chalk.green('* ') : '  ';
      console.log(marker + chalk.cyan(profile));
    });
    console.log();
  });

profileCmd
  .command('active')
  .description('Show active profile')
  .action(() => {
    console.log(chalk.cyan('Active profile:'), chalk.green(configManager.getActiveProfile()));
  });

profileCmd
  .command('switch <name>')
  .description('Switch to a different profile')
  .action((name) => {
    try {
      configManager.setActiveProfile(name);
      console.log(chalk.green('✓'), `Switched to profile: ${chalk.cyan(name)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

profileCmd
  .command('create <name>')
  .description('Create a new profile')
  .option('-b, --base <profile>', 'Base profile to copy from', 'default')
  .action((name, options) => {
    try {
      configManager.createProfile(name, options.base);
      console.log(chalk.green('✓'), `Created profile: ${chalk.cyan(name)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

profileCmd
  .command('delete <name>')
  .description('Delete a profile')
  .action((name) => {
    try {
      configManager.deleteProfile(name);
      console.log(chalk.green('✓'), `Deleted profile: ${chalk.cyan(name)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Reset configuration
program
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-p, --profile <name>', 'Reset specific profile')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    if (!options.yes) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const profile = options.profile || configManager.getActiveProfile();
      const answer = await new Promise(resolve => {
        rl.question(chalk.yellow(`Reset profile '${profile}' to defaults? (y/n): `), resolve);
      });
      rl.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log('Reset cancelled');
        return;
      }
    }
    
    try {
      configManager.reset(options.profile);
      console.log(chalk.green('✓'), 'Configuration reset to defaults');
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Export configuration
program
  .command('export [file]')
  .description('Export configuration to file')
  .option('-p, --profile <name>', 'Export specific profile')
  .action((file, options) => {
    try {
      const config = configManager.exportConfig(options.profile);
      const json = JSON.stringify(config, null, 2);
      
      if (file) {
        fs.writeFileSync(file, json);
        console.log(chalk.green('✓'), `Configuration exported to: ${chalk.cyan(file)}`);
      } else {
        console.log(json);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Import configuration
program
  .command('import <file>')
  .description('Import configuration from file')
  .option('-p, --profile <name>', 'Import to specific profile')
  .action((file, options) => {
    try {
      const json = fs.readFileSync(file, 'utf8');
      const config = JSON.parse(json);
      
      configManager.importConfig(config, options.profile);
      console.log(chalk.green('✓'), `Configuration imported from: ${chalk.cyan(file)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Show schema
program
  .command('schema')
  .description('Show configuration schema')
  .option('--json', 'Output as JSON')
  .action((options) => {
    const schema = configManager.getSchema();
    
    if (options.json) {
      console.log(JSON.stringify(schema, null, 2));
    } else {
      console.log(chalk.bold('\nConfiguration Schema:\n'));
      
      for (const [section, fields] of Object.entries(schema)) {
        console.log(chalk.yellow(`[${section}]`));
        
        for (const [field, spec] of Object.entries(fields)) {
          console.log(`  ${chalk.cyan(field)}:`);
          console.log(`    Type: ${chalk.green(spec.type)}`);
          console.log(`    Default: ${chalk.green(JSON.stringify(spec.default))}`);
          if (spec.enum) {
            console.log(`    Values: ${chalk.green(spec.enum.join(', '))}`);
          }
          if (spec.min !== undefined || spec.max !== undefined) {
            console.log(`    Range: ${chalk.green(`${spec.min || '-∞'} to ${spec.max || '+∞'}`)}`);
          }
          console.log(`    Description: ${spec.description}`);
          console.log();
        }
      }
    }
  });

// Validate configuration
program
  .command('validate')
  .description('Validate current configuration')
  .option('-p, --profile <name>', 'Validate specific profile')
  .action((options) => {
    try {
      const config = configManager.get(null, options.profile);
      const schema = configManager.getSchema();
      
      let hasErrors = false;
      
      for (const [section, fields] of Object.entries(schema)) {
        for (const [field, spec] of Object.entries(fields)) {
          const value = config[section]?.[field];
          
          if (value === undefined) {
            console.log(chalk.yellow('⚠'), `Missing: ${section}.${field}`);
            continue;
          }
          
          const validation = configManager.validateValue(value, spec);
          if (!validation.valid) {
            console.log(chalk.red('✗'), `Invalid ${section}.${field}: ${validation.error}`);
            hasErrors = true;
          }
        }
      }
      
      if (!hasErrors) {
        console.log(chalk.green('✓'), 'Configuration is valid');
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();