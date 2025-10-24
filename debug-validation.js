const ProgramSandbox = require('./src/program-system/runtime/sandbox');

const sandbox = new ProgramSandbox();

const source = `
  const program = defineProgram({
    name: 'test-program',
    version: '1.0.0',
    async run(ctx) {
      return ctx.control.success({ message: 'done' });
    }
  });
  program
`;

console.log('Testing validation...');
const result = sandbox.validateProgram(source);
console.log('Result:', JSON.stringify(result, null, 2));

// Let's also check what happens when we run the script
const testSandbox = new ProgramSandbox([], 5000);
testSandbox.injectSDK();

const vm = require('vm');
const script = new vm.Script(source, {
  filename: 'test.js'
});

try {
  const scriptResult = script.runInContext(testSandbox.context, {
    timeout: 5000
  });
  console.log('Script result:', scriptResult);
  console.log('Type of result:', typeof scriptResult);
  console.log('Result has name?:', scriptResult?.name);
  console.log('Module exports:', testSandbox.contextObject.module?.exports);
} catch (error) {
  console.error('Error running script:', error);
}