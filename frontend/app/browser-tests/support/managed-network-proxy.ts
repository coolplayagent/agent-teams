import { createConnection, createServer, type Server, type Socket } from "node:net";

export interface ManagedNetworkProxy {
  baseUrl: string;
  close: () => Promise<void>;
  interrupt: (offlineMs?: number) => Promise<void>;
}

export async function startManagedNetworkProxy(
  targetPort: number,
): Promise<ManagedNetworkProxy> {
  const sockets = new Set<Socket>();
  let offline = false;
  const server = createServer((client) => {
    trackSocket(sockets, client);
    if (offline) {
      client.destroy();
      return;
    }
    const upstream = createConnection({
      host: "127.0.0.1",
      port: targetPort,
    });
    trackSocket(sockets, upstream);
    client.pipe(upstream);
    upstream.pipe(client);
    client.once("error", () => upstream.destroy());
    upstream.once("error", () => client.destroy());
  });
  await listen(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Managed network proxy did not bind to a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      offline = true;
      destroySockets(sockets);
      await closeServer(server);
    },
    interrupt: async (offlineMs = 2_000) => {
      offline = true;
      destroySockets(sockets);
      try {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, offlineMs);
        });
      } finally {
        offline = false;
      }
    },
  };
}

function trackSocket(sockets: Set<Socket>, socket: Socket): void {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
}

function destroySockets(sockets: Set<Socket>): void {
  for (const socket of Array.from(sockets)) {
    socket.destroy();
  }
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
