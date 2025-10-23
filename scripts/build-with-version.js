#!/usr/bin/env bun

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Get command line arguments
const args = process.argv.slice(2);

// Build the bun command with the version definition
const bunArgs = [
  'build',
  '--define',
  `__VERSION__="${version}"`,
  ...args
];

console.log(`Building with version: ${version}`);
console.log(`Running: bun ${bunArgs.join(' ')}`);

// Execute the build command
const proc = spawn('bun', bunArgs, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

proc.on('exit', (code) => {
  process.exit(code);
});