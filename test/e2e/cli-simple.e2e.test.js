/**
 * Simple CLI Commands E2E Test
 * Tests the most important CLI commands with real execution
 * Uses the running Bot Server workflow
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper to run CLI commands synchronously
function runCliCommand(command) {
  const cliPath = path.join(process.cwd(), 'src', 'cli.js');
  try {
    const output = execSync(`bun ${cliPath} ${command}`, {
      encoding: 'utf8',
      env: { ...process.env, API_URL: 'http://localhost:3000' }
    });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || '', 
      error: error.stderr || error.message 
    };
  }
}

describe('E2E: CLI Commands (Simple)', () => {
  
  console.log('═'.repeat(60));
  console.log('SIMPLE CLI COMMANDS E2E TEST');
  console.log('Testing essential CLI commands with real execution');
  console.log('Using existing Bot Server on port 3000');
  console.log('═'.repeat(60));
  
  describe('Information Commands', () => {
    it('should execute health command', () => {
      const result = runCliCommand('health');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('status');
      
      const data = JSON.parse(result.output);
      expect(data.status).toBe('ok');
      
      console.log('✅ health command working');
    });
    
    it('should execute state command', () => {
      const result = runCliCommand('state');
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('position');
      
      const data = JSON.parse(result.output);
      expect(data.position).toBeDefined();
      expect(data.health).toBeTypeOf('number');
      expect(data.gameMode).toBeDefined();
      
      console.log('✅ state command working');
    });
    
    it('should execute inventory command', () => {
      const result = runCliCommand('inventory');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.items).toBeInstanceOf(Array);
      
      console.log('✅ inventory command working');
    });
    
    it('should execute entities command', () => {
      const result = runCliCommand('entities');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.entities).toBeInstanceOf(Array);
      
      console.log('✅ entities command working');
    });
    
    it('should execute events command', () => {
      const result = runCliCommand('events --since 0');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.events).toBeInstanceOf(Array);
      expect(data.events.length).toBeGreaterThan(0); // Should have at least spawn event
      
      console.log(`✅ events command working (${data.events.length} events)`);
    });
    
    it('should execute recipes command', () => {
      const result = runCliCommand('recipes -i oak_planks');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.recipes).toBeInstanceOf(Array);
      
      console.log('✅ recipes command working');
    });
  });
  
  describe('Action Commands', () => {
    it('should execute chat command', () => {
      const message = `Test message ${Date.now()}`;
      const result = runCliCommand(`chat "${message}"`);
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      expect(data.message).toBe(message);
      
      console.log('✅ chat command working');
    });
    
    it('should execute move command', () => {
      const result = runCliCommand('move -x 1 -y 0 -z 0');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      
      console.log('✅ move command working');
    });
    
    it('should execute stop command', () => {
      const result = runCliCommand('stop');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      
      console.log('✅ stop command working');
    });
    
    it('should execute look command', () => {
      const result = runCliCommand('look --yaw 0 --pitch 0');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      
      console.log('✅ look command working');
    });
    
    it('should execute dig command', () => {
      const result = runCliCommand('dig -x 0 -y 64 -z 0');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Command executes successfully even if no block to dig
      expect(data).toBeDefined();
      
      console.log('✅ dig command working');
    });
    
    it('should execute place command', () => {
      const result = runCliCommand('place -x 0 -y 64 -z 0 -b dirt');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Command executes even if no item in inventory
      expect(data).toBeDefined();
      
      console.log('✅ place command working');
    });
    
    it('should execute attack command', () => {
      const result = runCliCommand('attack -e 999');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Command executes even if entity not found
      expect(data).toBeDefined();
      
      console.log('✅ attack command working');
    });
    
    it('should execute craft command', () => {
      const result = runCliCommand('craft -i oak_planks -c 4');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Command executes even without materials
      expect(data).toBeDefined();
      
      console.log('✅ craft command working');
    });
    
    it('should execute equip command', () => {
      const result = runCliCommand('equip -i diamond_sword -d hand');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Command executes even without item
      expect(data).toBeDefined();
      
      console.log('✅ equip command working');
    });
  });
  
  describe('Batch Commands', () => {
    it('should execute batch command with simple instructions', () => {
      // Create a test batch file
      const batchFile = path.join(process.cwd(), 'test-batch-cli.json');
      const batchContent = {
        instructions: [
          { type: 'chat', params: { message: 'E2E Batch Test' } },
          { type: 'wait', params: { duration: 100 } },
          { type: 'stop', params: {} }
        ]
      };
      
      fs.writeFileSync(batchFile, JSON.stringify(batchContent, null, 2));
      
      const result = runCliCommand(`batch -f ${batchFile}`);
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(3);
      
      // Clean up
      fs.unlinkSync(batchFile);
      
      console.log('✅ batch command working');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle events with timestamp filter', () => {
      const timestamp = Date.now() - 60000; // 1 minute ago
      const result = runCliCommand(`events --since ${timestamp}`);
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.events).toBeInstanceOf(Array);
      
      // All events should be after the timestamp
      data.events.forEach(event => {
        expect(event.timestamp).toBeGreaterThanOrEqual(timestamp);
      });
      
      console.log('✅ events filtering working');
    });
    
    it('should handle move with sprint flag', () => {
      const result = runCliCommand('move -x 2 -z 2 --sprint');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      
      console.log('✅ sprint movement working');
    });
    
    it('should handle invalid entity ID gracefully', () => {
      const result = runCliCommand('attack -e 999999');
      
      expect(result.success).toBe(true);
      
      const data = JSON.parse(result.output);
      // Should return error message but not crash
      expect(data).toBeDefined();
      
      console.log('✅ Invalid entity handling working');
    });
  });
  
  describe('Command Sequences', () => {
    it('should execute multiple commands in sequence', () => {
      const commands = [
        'state',
        'chat "Starting sequence"',
        'move -x 1',
        'stop',
        'chat "Sequence complete"'
      ];
      
      let allSuccess = true;
      for (const cmd of commands) {
        const result = runCliCommand(cmd);
        if (!result.success) {
          allSuccess = false;
          console.log(`Failed: ${cmd}`);
        }
      }
      
      expect(allSuccess).toBe(true);
      console.log('✅ Command sequence working');
    });
  });
});

console.log('');
console.log('This test suite validates essential CLI commands');
console.log('All commands execute against the real Bot Server');
console.log('✅ = Working command with real execution');
console.log('');