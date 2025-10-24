/**
 * E2E Test to ensure no deprecation warnings or errors in CLI commands
 */

const { spawn } = require('child_process');
const path = require('path');

describe('E2E: No Warnings or Errors Check', () => {
  const cliPath = path.join(__dirname, '..', '..', 'mineflare');
  
  // Helper to run CLI command and capture output
  const runCommand = (args, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const warnings = [];
      const errors = [];
      let stdout = '';
      let stderr = '';
      
      const proc = spawn(cliPath, args, {
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '0', // Ensure warnings are shown
          NODE_OPTIONS: '' // Clear any options that might suppress warnings
        }
      });
      
      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Check for common warning patterns
        if (output.includes('DeprecationWarning') || 
            output.includes('Warning:') ||
            output.includes('WARN')) {
          warnings.push(output.trim());
        }
      });
      
      proc.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Check for deprecation warnings and errors
        if (output.includes('DeprecationWarning') || 
            output.includes('ExperimentalWarning') ||
            output.includes('Warning:')) {
          warnings.push(output.trim());
        }
        
        if (output.includes('Error:') && 
            !output.includes('DeprecationWarning') &&
            !output.includes('ExperimentalWarning')) {
          errors.push(output.trim());
        }
      });
      
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
      
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          code,
          stdout,
          stderr,
          warnings,
          errors
        });
      });
      
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };
  
  describe('CLI Commands Should Have No Warnings', () => {
    it('should show help without warnings', async () => {
      const result = await runCommand(['--help']);
      
      // Check for specific deprecation warning
      const hasUrlParseWarning = result.warnings.some(w => 
        w.includes('url.parse()') && w.includes('DEP0169')
      );
      
      expect(hasUrlParseWarning).toBe(false);
      expect(result.warnings.length).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(result.code).toBe(0);
    });
    
    it('should show version without warnings', async () => {
      const result = await runCommand(['--version']);
      
      expect(result.warnings.length).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(result.code).toBe(0);
    });
    
    it('should run health command without warnings', async () => {
      const result = await runCommand(['health']);
      
      // Check for url.parse deprecation specifically
      const hasUrlParseWarning = result.warnings.some(w => 
        w.includes('url.parse()') || w.includes('DEP0169')
      );
      
      if (hasUrlParseWarning) {
        console.log('Found url.parse() deprecation warning:');
        result.warnings.forEach(w => {
          if (w.includes('url.parse') || w.includes('DEP0169')) {
            console.log(w);
          }
        });
      }
      
      expect(hasUrlParseWarning).toBe(false);
      expect(result.warnings.length).toBe(0);
      
      // Allow for connection errors but no other errors
      const nonConnectionErrors = result.errors.filter(e => 
        !e.includes('ECONNREFUSED') && 
        !e.includes('Bot server is not running')
      );
      expect(nonConnectionErrors.length).toBe(0);
    });
    
    it('should run config commands without warnings', async () => {
      const result = await runCommand(['config', 'get']);
      
      expect(result.warnings.length).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(result.code).toBe(0);
    });
    
    it('should handle server commands without warnings', async () => {
      const result = await runCommand(['server', 'status']);
      
      expect(result.warnings.length).toBe(0);
      
      // Allow for status check errors but no other errors
      const nonStatusErrors = result.errors.filter(e => 
        !e.includes('not running') && 
        !e.includes('ECONNREFUSED')
      );
      expect(nonStatusErrors.length).toBe(0);
    });
    
    it('should run program commands without warnings', async () => {
      const result = await runCommand(['program', 'ls']);
      
      const hasUrlParseWarning = result.warnings.some(w => 
        w.includes('url.parse()') || w.includes('DEP0169')
      );
      
      expect(hasUrlParseWarning).toBe(false);
      expect(result.warnings.length).toBe(0);
    });
  });
  
  describe('Axios Requests Should Not Trigger Warnings', () => {
    it('should make API requests without url.parse warnings', async () => {
      // Test a command that makes API calls
      const result = await runCommand(['state']);
      
      // Specifically check for the url.parse deprecation
      const hasDeprecation = result.stderr.includes('DEP0169') || 
                            result.stderr.includes('url.parse()');
      
      if (hasDeprecation) {
        console.log('Deprecation warning found in stderr:', result.stderr);
      }
      
      expect(hasDeprecation).toBe(false);
    });
    
    it('should handle proxy configuration without warnings', async () => {
      // Test with proxy env vars that might trigger url.parse
      const proxyEnv = {
        ...process.env,
        HTTP_PROXY: 'http://proxy.example.com:8080',
        NO_PROXY: 'localhost,127.0.0.1',
        NODE_NO_WARNINGS: '0'
      };
      
      const proc = spawn(cliPath, ['health'], { env: proxyEnv });
      
      let warnings = '';
      proc.stderr.on('data', (data) => {
        warnings += data.toString();
      });
      
      await new Promise(resolve => {
        proc.on('close', resolve);
        setTimeout(() => proc.kill(), 3000);
      });
      
      const hasUrlParseWarning = warnings.includes('url.parse') || 
                                warnings.includes('DEP0169');
      
      expect(hasUrlParseWarning).toBe(false);
    });
  });
});