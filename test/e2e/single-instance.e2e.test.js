const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('E2E: Single Instance Enforcement', () => {
  const mineflareCmd = path.join(process.cwd(), 'mineflare');
  const pidFile = path.join(process.cwd(), 'mineflare.pid');
  
  beforeEach(async () => {
    // Clean up any existing PID file
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
        process.kill(pid, 'SIGTERM');
      } catch (e) {
        // Ignore errors
      }
      try {
        fs.unlinkSync(pidFile);
      } catch (e) {
        // Ignore errors
      }
    }
    await sleep(1000);
  });
  
  afterEach(async () => {
    // Clean up after each test
    try {
      await execAsync(`${mineflareCmd} server stop`);
    } catch (e) {
      // Ignore errors
    }
    await sleep(1000);
  });
  
  describe('Daemon Mode Single Instance', () => {
    it('should prevent starting a second daemon instance', async () => {
      // Start first daemon
      const result1 = await execAsync(`${mineflareCmd} server start --daemon`);
      expect(result1.stdout).toContain('Bot server started as daemon');
      expect(fs.existsSync(pidFile)).toBe(true);
      
      await sleep(2000);
      
      // Try to start second daemon - should fail
      try {
        await execAsync(`${mineflareCmd} server start --daemon`);
        fail('Should have thrown an error');
      } catch (error) {
        const stderr = error.stderr ? error.stderr.toString() : '';
        expect(stderr).toContain('Mineflare server is already running');
        expect(stderr).toContain('Use \'mineflare server stop\' to stop it first');
      }
    }, 30000);
    
    it('should allow force starting a new instance with --force flag', async () => {
      // Start first daemon
      const result1 = await execAsync(`${mineflareCmd} server start --daemon`);
      expect(result1.stdout).toContain('Bot server started as daemon');
      
      await sleep(2000);
      
      // Force start a new daemon
      const result2 = await execAsync(`${mineflareCmd} server start --daemon --force`);
      expect(result2.stdout).toContain('Warning: Overriding existing instance');
      expect(result2.stdout).toContain('Bot server started as daemon');
    }, 30000);
    
    it('should clean up stale PID files automatically', async () => {
      // Create a fake PID file with non-existent process
      fs.writeFileSync(pidFile, '99999999');
      
      // Try to start daemon - should clean up and start
      const result = await execAsync(`${mineflareCmd} server start --daemon`);
      expect(result.stdout).toContain('Cleaning up stale PID file');
      expect(result.stdout).toContain('Bot server started as daemon');
    }, 30000);
  });
  
  describe('Port Conflict Detection', () => {
    it('should detect port conflicts', async () => {
      // Start first instance
      const result1 = await execAsync(`${mineflareCmd} server start --daemon`);
      expect(result1.stdout).toContain('Bot server started as daemon');
      
      await sleep(3000);
      
      // Remove PID file to simulate external port conflict
      fs.unlinkSync(pidFile);
      
      // Try to start second instance - should detect port conflict
      try {
        await execAsync(`${mineflareCmd} server start --daemon`);
        fail('Should have thrown an error');
      } catch (error) {
        const stderr = error.stderr ? error.stderr.toString() : '';
        expect(stderr).toContain('Port 3000 is already in use');
        expect(stderr).toContain('Another Mineflare instance or different application may be running');
      }
      
      // Restore PID file for cleanup
      const { stdout } = await execAsync('ps aux | grep "bun.*server.js" | grep -v grep | awk \'{print $2}\'');
      const pid = stdout.trim();
      if (pid) {
        fs.writeFileSync(pidFile, pid);
      }
    }, 30000);
  });
  
  describe('Foreground Mode PID Tracking', () => {
    it('should create PID file even in foreground mode', async () => {
      // Start server in foreground mode
      const child = spawn(mineflareCmd, ['server', 'start'], {
        detached: false,
        stdio: 'pipe'
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      // Wait for server to start
      await sleep(3000);
      
      // Check PID file exists
      expect(fs.existsSync(pidFile)).toBe(true);
      const savedPid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      expect(savedPid).toBe(child.pid);
      
      // Try to start another instance - should fail
      try {
        await execAsync(`${mineflareCmd} server start --daemon`);
        fail('Should have thrown an error');
      } catch (error) {
        const stderr = error.stderr ? error.stderr.toString() : '';
        expect(stderr).toContain('Mineflare server is already running');
      }
      
      // Clean up
      child.kill('SIGINT');
      await sleep(2000);
      
      // PID file should be cleaned up
      expect(fs.existsSync(pidFile)).toBe(false);
    }, 30000);
  });
  
  describe('Server Status Command', () => {
    it('should accurately report server status', async () => {
      // Check status when no server running
      const status1 = await execAsync(`${mineflareCmd} server status`);
      expect(status1.stdout).toContain('Server daemon not running');
      
      // Start daemon
      await execAsync(`${mineflareCmd} server start --daemon`);
      await sleep(3000);
      
      // Check status when server running
      const status2 = await execAsync(`${mineflareCmd} server status`);
      expect(status2.stdout).toContain('Server daemon running');
      expect(status2.stdout).toContain('API responding');
    }, 30000);
  });
});