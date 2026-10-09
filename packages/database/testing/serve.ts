import { createServer, type Socket } from 'node:net';
import type { PGlite } from '@electric-sql/pglite';

const SSL_REQUEST_CODE = 80_877_103;
const CANCEL_REQUEST_CODE = 80_877_102;
const STARTUP_HEADER_BYTES = 8;
const MESSAGE_HEADER_BYTES = 5;
const READY_FOR_QUERY = 0x5a;
const SYNC = 0x53;
const SIMPLE_QUERY = 0x51;
const FLUSH = 0x48;
const TERMINATE = 0x58;
const IDLE = 0x49;

type Release = () => void;

interface Session {
  acquire: () => Promise<Release>;
}

/**
 * Serves one PGlite over the Postgres wire protocol on a free local port. PGlite is one session,
 * so each batch (Parse through Sync, or one simple Query) runs whole. A connection in a
 * transaction keeps the session until it ends. PGlite sends an extra ReadyForQuery after a
 * failed Execute, so this server sends one ReadyForQuery per Sync.
 */
export async function serve(db: PGlite, host: string): Promise<{ port: number; stop: () => Promise<void> }> {
  const session = createSession();
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    new Connection(db, socket, session);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test database did not get a TCP port');
  }

  return {
    port: address.port,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      }),
  };
}

function createSession(): Session {
  let tail: Promise<void> = Promise.resolve();
  return {
    acquire() {
      let release: Release = () => undefined;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      const previous = tail;
      tail = next;
      return previous.then(() => release);
    },
  };
}

class Connection {
  private readonly db: PGlite;
  private readonly socket: Socket;
  private readonly session: Session;
  private buffer: Buffer = Buffer.alloc(0);
  private batch: Buffer[] = [];
  private started = false;
  private releaseSession: Release | undefined;
  private work: Promise<void> = Promise.resolve();

  constructor(db: PGlite, socket: Socket, session: Session) {
    this.db = db;
    this.socket = socket;
    this.session = session;
    socket.on('data', (chunk: Buffer) => this.enqueue(() => this.receive(chunk)));
    socket.on('close', () => this.enqueue(() => this.abandon()));
    socket.on('error', () => socket.destroy());
  }

  private enqueue(step: () => Promise<void>): void {
    this.work = this.work.then(step).catch(() => {
      this.socket.destroy();
    });
  }

  private async receive(chunk: Buffer): Promise<void> {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.socket.writable) {
      const message = this.started ? this.takeMessage() : this.takeStartup();
      if (!message) {
        return;
      }
      // biome-ignore lint/performance/noAwaitInLoops: a connection's batches must reach PGlite in order.
      await this.dispatch(message);
    }
  }

  /** Answers SSL and cancel requests itself and returns the startup message once it is whole. */
  private takeStartup(): Buffer | undefined {
    while (this.buffer.length >= STARTUP_HEADER_BYTES) {
      const length = this.buffer.readInt32BE(0);
      const code = this.buffer.readInt32BE(4);
      if (code === CANCEL_REQUEST_CODE) {
        this.socket.destroy();
        return;
      }
      if (code !== SSL_REQUEST_CODE) {
        return this.buffer.length < length ? undefined : this.consume(length);
      }
      this.consume(length);
      this.socket.write('N');
    }
  }

  private takeMessage(): Buffer | undefined {
    if (this.buffer.length < MESSAGE_HEADER_BYTES) {
      return;
    }
    const length = 1 + this.buffer.readInt32BE(1);
    return this.buffer.length < length ? undefined : this.consume(length);
  }

  private consume(length: number): Buffer {
    const message = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return message;
  }

  private dispatch(message: Buffer): Promise<void> {
    if (!this.started) {
      this.started = true;
      return this.run([message], 1);
    }

    const [type] = message;
    if (type === TERMINATE) {
      this.socket.end();
      return Promise.resolve();
    }

    this.batch.push(message);
    if (type === SYNC || type === SIMPLE_QUERY || type === FLUSH) {
      const batch = this.batch;
      this.batch = [];
      return this.run(batch, type === FLUSH ? 0 : batch.filter(endsBatch).length);
    }
    return Promise.resolve();
  }

  private async run(messages: Buffer[], replies: number): Promise<void> {
    this.releaseSession ??= await this.session.acquire();

    const output = Buffer.from(await this.db.execProtocolRaw(Buffer.concat(messages)));
    const { kept, lastStatus } = keepReplies(output, replies);
    if (this.socket.writable) {
      this.socket.write(kept);
    }

    // Any status but idle (in a transaction, or in a failed one) keeps the session for this connection.
    if (lastStatus === IDLE) {
      this.release();
    }
  }

  private async abandon(): Promise<void> {
    if (this.releaseSession) {
      await this.db.exec('ROLLBACK');
      this.release();
    }
  }

  private release(): void {
    this.releaseSession?.();
    this.releaseSession = undefined;
  }
}

function endsBatch(message: Buffer): boolean {
  return message[0] === SYNC || message[0] === SIMPLE_QUERY;
}

/** Drops all but the last `replies` ReadyForQuery messages and reports the status of the last one PGlite sent. */
function keepReplies(output: Buffer, replies: number): { kept: Buffer; lastStatus: number | undefined } {
  const messages: Buffer[] = [];
  for (let start = 0; start < output.length; ) {
    const end = start + 1 + output.readInt32BE(start + 1);
    messages.push(output.subarray(start, end));
    start = end;
  }

  const ready = messages.filter((message) => message[0] === READY_FOR_QUERY);
  const surplus = new Set(ready.slice(0, Math.max(0, ready.length - replies)));
  return {
    kept: Buffer.concat(messages.filter((message) => !surplus.has(message))),
    lastStatus: ready.at(-1)?.at(-1),
  };
}
