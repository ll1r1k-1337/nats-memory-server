const { EventEmitter } = require('events');
const { performance } = require('perf_hooks');

function runBenchmark() {
  const processStr = new EventEmitter();
  const processBuf = new EventEmitter();
  const processBufEarly = new EventEmitter();

  const data = Buffer.from('some large log message that goes on and on\n'.repeat(10) + 'Server is ready\n' + 'some more logs\n'.repeat(10));
  const dataNotReady = Buffer.from('some large log message that goes on and on\n'.repeat(10));

  // Current
  let strReady = false;
  processStr.on('data', (d) => {
    const dataStr = d?.toString();
    if (dataStr?.includes('Server is ready')) {
      strReady = true;
    }
  });

  // Optimized (No verbose)
  let bufReady = false;
  processBuf.on('data', (d) => {
    if (bufReady) return;
    const hasReadyMsg = Buffer.isBuffer(d) ? d.includes('Server is ready') : d?.toString().includes('Server is ready') === true;
    if (hasReadyMsg) {
      bufReady = true;
    }
  });

  const ITERATIONS = 100000;

  // Measurement 1: Before ready
  let start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    processStr.emit('data', dataNotReady);
  }
  const timeStrNotReady = performance.now() - start;

  start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    processBuf.emit('data', dataNotReady);
  }
  const timeBufNotReady = performance.now() - start;

  // Reset
  strReady = false;
  bufReady = false;

  // Ready message
  processStr.emit('data', data);
  processBuf.emit('data', data);

  // Measurement 2: After ready
  start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    processStr.emit('data', dataNotReady);
  }
  const timeStrReady = performance.now() - start;

  start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    processBuf.emit('data', dataNotReady);
  }
  const timeBufReady = performance.now() - start;

  console.log(`Before Ready (String allocation): ${timeStrNotReady.toFixed(2)}ms`);
  console.log(`Before Ready (Buffer includes): ${timeBufNotReady.toFixed(2)}ms`);
  console.log(`After Ready (String allocation): ${timeStrReady.toFixed(2)}ms`);
  console.log(`After Ready (Early return): ${timeBufReady.toFixed(2)}ms`);
}

runBenchmark();
