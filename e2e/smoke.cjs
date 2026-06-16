// Runs inside the target-architecture container after the packed package and
// the nats client have been installed. Starts the server, performs one pub/sub
// round-trip, and exits 0 only if the message round-trips.
//
// Every await is timeout-guarded: the server child is unref()'d in start(), so
// in this minimal script the event loop can otherwise drain mid-teardown and
// exit 0 with the round-trip unverified. The timeouts both keep a ref'd timer
// alive long enough for calls to settle AND turn a real hang into a loud
// failure instead of a false success.
const { NatsServerBuilder } = require('nats-memory-server');
const { connect, StringCodec } = require('nats');

const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms),
    ),
  ]);

(async () => {
  const server = await withTimeout(
    NatsServerBuilder.create().setVerbose(false).build().start(),
    30000,
    'server start',
  );
  const url = server.getUrl();
  const nc = await withTimeout(connect({ servers: url }), 15000, 'client connect');
  const sc = StringCodec();
  const sub = nc.subscribe('e2e.smoke', { max: 1 });
  nc.publish('e2e.smoke', sc.encode('ping'));

  let received;
  await withTimeout(
    (async () => {
      for await (const m of sub) received = sc.decode(m.data);
    })(),
    15000,
    'message round-trip',
  );

  if (received !== 'ping') {
    throw new Error('payload mismatch: got ' + String(received));
  }
  console.log('[e2e] OK ' + process.platform + '/' + process.arch + ' via ' + url);

  await withTimeout(nc.close(), 5000, 'client close').catch(() => {});
  await withTimeout(server.stop(), 5000, 'server stop').catch(() => {});
  process.exit(0);
})().catch((err) => {
  console.error('[e2e] FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
