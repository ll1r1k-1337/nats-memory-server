import net, { type AddressInfo } from 'net';

export async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      // listen(0) always yields a bound TCP socket, so address() is an
      // AddressInfo (never a string pipe path or null) here.
      const { port } = srv.address() as AddressInfo;
      srv.close(() => {
        resolve(port);
      });
    });
  });
}
