const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { test, before, after } = require("node:test");
const { io } = require("../../client/node_modules/socket.io-client");
// The app builds install Yjs separately. Use one instance in this shared test
// process so Yjs's constructor checks also work across the two build roots.
const Y = require("yjs");
require.cache[require.resolve("../../client/node_modules/yjs")] = require.cache[require.resolve("yjs")];
const server = require("../src/socket").default;
const { getOrCreateDoc } = require("../src/yjs-server");
const { createDocumentSync, DOCUMENT_UPLOAD_WINDOW } = require("../../client/src/utils/document-sync");
const clientProtocol = require("../../client/src/utils/document-protocol");
const serverProtocol = require("../src/document-protocol");

let url;
let nextRoom = 0;
const roomName = () => `document-test-${++nextRoom}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(message);
    await sleep(10);
  }
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
const text = (peer) => peer.doc.getText("monaco");
const savedText = (room) => getOrCreateDoc(room).getText("monaco").toString();
const emitWithAck = (socket, event, payload) => new Promise((resolve, reject) => {
  socket.timeout(2000).emit(event, payload, (error, ack) => error ? reject(error) : resolve(ack));
});

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function peer(t, room, transports = ["websocket"], initialText = "") {
  const socket = io(url, { transports, autoConnect: false, reconnection: false });
  const doc = new Y.Doc();
  const errors = [];
  const outgoingChunks = [];
  const incomingChunks = [];
  const connectionErrors = [];
  let syncCount = 0;
  let disconnects = 0;
  let lastError = null;
  socket.on("disconnect", () => disconnects++);
  socket.on("connect_error", (error) => connectionErrors.push(error.message));
  socket.onAnyOutgoing((event, payload) => {
    if (event === "document:chunk") outgoingChunks.push(payload.data.byteLength);
  });
  socket.on("document:chunk", (chunk) => incomingChunks.push(chunk.data.byteLength));
  const stop = createDocumentSync(socket, doc, room, "Test user", (error) => {
    lastError = error;
    if (error) errors.push(error);
  }, () => syncCount++);
  t.after(() => { stop(); socket.disconnect(); doc.destroy(); });
  if (initialText) doc.getText("monaco").insert(0, initialText);
  socket.connect();
  try {
    await eventually(() => syncCount === 1, "Peer did not synchronize after joining.");
  } catch (error) {
    t.diagnostic(JSON.stringify({ room, connected: socket.connected, syncCount, errors, connectionErrors }));
    throw error;
  }
  return {
    socket, doc, errors, outgoingChunks, incomingChunks, stop,
    get syncCount() { return syncCount; },
    get disconnects() { return disconnects; },
    get lastError() { return lastError; },
  };
}

for (const transport of ["websocket", "polling"]) {
  test(`large Unicode pastes, subsequent edits and large snapshots over ${transport}`, async (t) => {
    const room = roomName();
    const sender = await peer(t, room, [transport]);
    const receiver = await peer(t, room, [transport]);
    const content = 'const data = "🙂नमस्ते";\n'.repeat(70000);
    assert.ok(Buffer.byteLength(content) > 2_000_000);
    text(sender).insert(0, content);
    await eventually(() => text(receiver).length === content.length, "Large paste was not delivered.");
    assert.equal(hash(text(receiver).toString()), hash(content));
    assert.equal(hash(savedText(room)), hash(content));

    // Edits and deletions following a large transfer must remain usable.
    text(sender).insert(0, "prefix|");
    text(sender).delete(7, 20);
    text(sender).insert(text(sender).length, "|suffix");
    await eventually(() => savedText(room) === text(sender).toString() &&
      text(receiver).toString() === text(sender).toString(), "Subsequent edits did not converge.");

    const lateJoiner = await peer(t, room, [transport]);
    assert.equal(hash(text(lateJoiner).toString()), hash(text(sender).toString()));
    assert.ok(sender.outgoingChunks.length > 30);
    assert.ok(lateJoiner.incomingChunks.length > 30);
    for (const size of [...sender.outgoingChunks, ...receiver.incomingChunks, ...lateJoiner.incomingChunks]) {
      assert.ok(size > 0 && size <= 64 * 1024, `Unbounded frame: ${size}`);
    }
    assert.equal(sender.disconnects + receiver.disconnects + lateJoiner.disconnects, 0);
    assert.deepEqual([...sender.errors, ...receiver.errors, ...lateJoiner.errors], []);
  });

  test(`chunk uploads stay bounded without a round trip per chunk over ${transport}`, async (t) => {
    const room = roomName();
    const sender = await peer(t, room, [transport]);
    const receiver = await peer(t, room, [transport]);
    const ackDelayMs = 50;
    let outstanding = 0;
    let peakOutstanding = 0;
    let chunkCount = 0;
    const originalEmit = sender.socket.emit;
    // Delay real server acknowledgements to model a remote connection. Data,
    // chunk ordering, room routing and Yjs application still use real sockets.
    sender.socket.emit = function(event, ...args) {
      if (event === "document:chunk") {
        chunkCount++;
        outstanding++;
        peakOutstanding = Math.max(peakOutstanding, outstanding);
        const callback = args[args.length - 1];
        args[args.length - 1] = (...ackArgs) => setTimeout(() => {
          outstanding--;
          callback(...ackArgs);
        }, ackDelayMs);
      }
      return originalEmit.call(this, event, ...args);
    };
    const content = "x".repeat(4 * 1024 * 1024);
    const startedAt = performance.now();
    text(sender).insert(0, content);
    await eventually(() => text(receiver).length === content.length, "Pipelined paste was not delivered.");
    const elapsedMs = performance.now() - startedAt;
    assert.equal(hash(text(receiver).toString()), hash(content));
    assert.equal(hash(savedText(room)), hash(content));
    assert.ok(peakOutstanding > 1, "Each chunk still waits for its own round trip.");
    assert.ok(peakOutstanding <= DOCUMENT_UPLOAD_WINDOW, "Upload buffering is unbounded.");
    assert.ok(elapsedMs < chunkCount * ackDelayMs / 2, "Transfer still scales with one round trip per chunk.");
    await eventually(() => outstanding === 0, "The final chunk was not acknowledged.");
    t.diagnostic(`4 MiB, ${ackDelayMs} ms ack delay: ${Math.round(elapsedMs)} ms, ${peakOutstanding} chunks in flight`);
    assert.equal(sender.disconnects + receiver.disconnects, 0);
    assert.deepEqual([...sender.errors, ...receiver.errors], []);
  });
}

test("a dropped connection mid-paste recovers offline and concurrent remote edits", async (t) => {
  const room = roomName();
  const sender = await peer(t, room, ["websocket"], "base|");
  const receiver = await peer(t, room);
  await eventually(() => text(receiver).toString() === "base|", "Initial text was not saved.");
  let interrupted = false;
  const interrupt = (event, chunk) => {
    if (event === "document:chunk" && chunk.index === 1 && !interrupted) {
      interrupted = true;
      setImmediate(() => sender.socket.io.engine.close());
    }
  };
  sender.socket.onAnyOutgoing(interrupt);
  text(sender).insert(text(sender).length, "x".repeat(3_000_000));
  await eventually(() => sender.disconnects === 1, "The test did not interrupt the transport.");
  sender.socket.offAnyOutgoing(interrupt);
  text(sender).insert(0, "OFFLINE|");
  text(receiver).insert(0, "REMOTE|");
  await eventually(() => savedText(room).includes("REMOTE|"), "Remote edit was not saved.");
  assert.equal(sender.socket.sendBuffer.length, 0, "Offline edits leaked into Socket.IO's pre-join buffer.");

  sender.socket.connect();
  await eventually(() => sender.syncCount === 2, "The peer did not resynchronize.");
  await eventually(() => text(receiver).length === text(sender).length, "The interrupted paste was lost.");
  assert.equal(hash(text(receiver).toString()), hash(text(sender).toString()));
  assert.equal(hash(savedText(room)), hash(text(sender).toString()));
  assert.ok(savedText(room).includes("OFFLINE|"));
  assert.ok(savedText(room).includes("REMOTE|"));
  assert.ok(savedText(room).includes("x".repeat(3_000_000)));
  assert.equal(getOrCreateDoc(room).store.pendingStructs, null);

  text(sender).insert(text(sender).length, "|AFTER-RECONNECT");
  await eventually(() => text(receiver).toString().endsWith("|AFTER-RECONNECT"), "Editing stayed broken after reconnecting.");
  assert.deepEqual(sender.errors, []);
});

test("edits made before connecting are merged without duplicating existing text", async (t) => {
  const room = roomName();
  const first = await peer(t, room, ["websocket"], "server-text");
  await eventually(() => savedText(room) === "server-text", "Initial text was not saved.");
  const second = await peer(t, room, ["websocket"], "offline-text");
  await eventually(() => text(first).length === "server-textoffline-text".length, "Offline text was not uploaded.");
  const expected = text(first).toString();
  assert.ok(expected.includes("server-text"));
  assert.ok(expected.includes("offline-text"));
  second.socket.disconnect();
  second.socket.connect();
  await eventually(() => second.syncCount === 2, "Rejoin did not finish.");
  await sleep(50);
  assert.equal(text(second).toString(), expected);
  assert.equal(savedText(room), expected);
});

test("reconnecting a large document transfers only missing edits and deletions", async (t) => {
  const room = roomName();
  const owner = await peer(t, room, ["websocket"], "x".repeat(2 * 1024 * 1024));
  await eventually(() => savedText(room).length === text(owner).length, "Initial text was not saved.");
  const returning = await peer(t, room);
  assert.equal(text(returning).length, text(owner).length);
  returning.socket.disconnect();
  // A deletion-only delta has no new struct clocks. The server must supply its
  // full state vector, or the client would upload the entire document again.
  text(owner).delete(0, 10);
  await eventually(() => savedText(room).length === text(owner).length, "Online deletion was not saved.");
  text(returning).insert(text(returning).length, "|OFFLINE");
  returning.incomingChunks.length = 0;
  returning.outgoingChunks.length = 0;
  returning.socket.connect();
  await eventually(() => returning.syncCount === 2, "Delta synchronization did not finish.");
  await eventually(() => text(owner).toString().endsWith("|OFFLINE"), "Offline edit was not uploaded.");
  assert.equal(hash(text(returning).toString()), hash(text(owner).toString()));
  assert.equal(hash(savedText(room)), hash(text(owner).toString()));
  assert.equal(text(owner).length, 2 * 1024 * 1024 - 10 + "|OFFLINE".length);
  const downloaded = returning.incomingChunks.reduce((sum, size) => sum + size, 0);
  const uploaded = returning.outgoingChunks.reduce((sum, size) => sum + size, 0);
  assert.ok(downloaded < 1024, `Downloaded the existing document again: ${downloaded} bytes`);
  assert.ok(uploaded < 1024, `Uploaded the existing document again: ${uploaded} bytes`);
  t.diagnostic(`2 MiB reconnect: ${downloaded} bytes downloaded, ${uploaded} bytes uploaded`);
  assert.equal(getOrCreateDoc(room).store.pendingStructs, null);
  assert.deepEqual([...owner.errors, ...returning.errors], []);
});

test("a rejected update retries without disconnecting or losing subsequent local edits", async (t) => {
  const room = roomName();
  const sender = await peer(t, room);
  const receiver = await peer(t, room);
  let corrupted = false;
  const corruptOnce = (event, chunk) => {
    if (event === "document:chunk" && chunk.index === 2 && !corrupted) {
      corrupted = true;
      chunk.data = new Uint8Array([255]);
    }
  };
  sender.socket.onAnyOutgoing(corruptOnce);
  text(sender).insert(0, "retained edit|" + "x".repeat(2 * 1024 * 1024));
  await eventually(() => sender.lastError !== null, "The rejected update was not reported.");
  sender.socket.offAnyOutgoing(corruptOnce);
  text(sender).insert(text(sender).length, "|typed during retry");
  await eventually(() => savedText(room) === text(sender).toString() &&
    text(receiver).toString() === text(sender).toString(), "Retry did not recover all local edits.");
  assert.equal(sender.lastError, null);
  assert.equal(sender.disconnects, 0);
  assert.equal(sender.syncCount, 2);
});

test("a size limit reports unsaved text and resumes after the text is reduced", async (t) => {
  const originalLimit = clientProtocol.MAX_DOCUMENT_UPDATE_SIZE;
  // Exercise the same boundary using a small allocation.
  clientProtocol.MAX_DOCUMENT_UPDATE_SIZE = clientProtocol.DOCUMENT_CHUNK_SIZE;
  t.after(() => { clientProtocol.MAX_DOCUMENT_UPDATE_SIZE = originalLimit; });
  const room = roomName();
  const sender = await peer(t, room);
  text(sender).insert(0, "x".repeat(clientProtocol.DOCUMENT_CHUNK_SIZE + 1));
  assert.match(sender.lastError, /synchronization limit/);
  assert.equal(savedText(room), "");
  text(sender).delete(0, text(sender).length - 500);
  await eventually(() => savedText(room) === "x".repeat(500), "Reducing the text did not resume synchronization.");
  assert.equal(sender.lastError, null);
  assert.equal(sender.disconnects, 0);
});

test("invalid, incomplete and foreign-room chunks are rejected without breaking later edits", async (t) => {
  const room = roomName();
  const sender = await peer(t, room);
  const base = { room, id: "bad-transfer", kind: "update", index: 0, total: 1, data: new Uint8Array([0, 0]) };
  for (const chunk of [
    { ...base, room: "another-room" },
    { ...base, index: 1, total: 2 },
    { ...base, total: 1_000_000 },
    { ...base, kind: "sync" },
    { ...base, data: new Uint8Array([255]) },
  ]) {
    assert.equal((await emitWithAck(sender.socket, "document:chunk", chunk)).ok, false);
  }
  // A half-finished transfer is discarded on rejoin; it never changes the doc.
  const incomplete = { ...base, total: 2, data: new Uint8Array(64 * 1024) };
  assert.equal((await emitWithAck(sender.socket, "document:chunk", incomplete)).ok, true);
  assert.equal(savedText(room), "");
  sender.socket.disconnect();
  sender.socket.connect();
  await eventually(() => sender.syncCount === 2, "Rejoin did not finish.");
  text(sender).insert(0, "valid edit");
  await eventually(() => savedText(room) === "valid edit", "Invalid chunks broke later updates.");
  assert.ok(sender.socket.connected);
});

test("legacy clients can exchange edits with the new binary transport", async (t) => {
  const room = roomName();
  const modern = await peer(t, room);
  const legacy = io(url, { transports: ["websocket"], autoConnect: false, reconnection: false });
  const legacyDoc = new Y.Doc();
  t.after(() => { legacy.disconnect(); legacyDoc.destroy(); });
  let synced = false;
  legacy.on("sync", (bytes) => { Y.applyUpdate(legacyDoc, new Uint8Array(bytes)); synced = true; });
  legacy.on("update", (bytes) => Y.applyUpdate(legacyDoc, new Uint8Array(bytes)));
  legacy.on("connect", () => legacy.emit("join_room", { room }));
  legacy.connect();
  await eventually(() => synced, "Legacy join did not synchronize.");
  const update = new Promise((resolve) => legacyDoc.once("update", resolve));
  legacyDoc.getText("monaco").insert(0, "legacy");
  legacy.emit("update", Array.from(await update));
  await eventually(() => text(modern).toString() === "legacy", "Legacy edit did not reach modern client.");
  text(modern).insert(6, "-modern");
  await eventually(() => legacyDoc.getText("monaco").toString() === "legacy-modern", "Modern edit did not reach legacy client.");
});

test("rooms stay isolated and file relay and awareness still use restored room membership", async (t) => {
  const room = roomName();
  const sender = await peer(t, room);
  const receiver = await peer(t, room);
  const other = await peer(t, roomName());
  const file = { room, transferId: "file-test", filename: "data.bin", size: 65535, totalChunks: 1 };
  const ack = await emitWithAck(sender.socket, "file-relay:start", file);
  assert.equal(ack.ok, true);
  assert.equal(ack.recipients, 1);
  const receivedPacket = new Promise((resolve) => receiver.socket.once("file-relay:chunk", resolve));
  const packet = Buffer.alloc(65535, 120);
  assert.equal((await emitWithAck(sender.socket, "file-relay:chunk", { ...file, packet })).ok, true);
  assert.equal(hash((await receivedPacket).packet), hash(packet));
  const awareness = new Promise((resolve) => receiver.socket.once("awareness", resolve));
  sender.socket.emit("awareness", new Uint8Array([1, 2, 3]));
  assert.deepEqual(Array.from(await awareness), [1, 2, 3]);
  text(sender).insert(0, "isolated");
  await eventually(() => text(receiver).toString() === "isolated", "Room edit was not delivered.");
  assert.equal(text(other).toString(), "");
});

test("both protocol implementations preserve binary offsets and reject oversized transfers", () => {
  assert.equal(clientProtocol.DOCUMENT_CHUNK_SIZE, serverProtocol.DOCUMENT_CHUNK_SIZE);
  assert.equal(clientProtocol.MAX_DOCUMENT_UPDATE_SIZE, serverProtocol.MAX_DOCUMENT_UPDATE_SIZE);
  assert.equal(clientProtocol.MAX_DOCUMENT_UPDATE_SIZE, 256 * 1024 * 1024);
  const aboveOldLimit = new Uint8Array(64 * 1024 * 1024 + 1);
  for (const protocol of [clientProtocol, serverProtocol]) {
    const bytes = new Uint8Array([99, 1, 2, 3, 99]);
    const view = new DataView(bytes.buffer, 1, 3);
    assert.deepEqual(Array.from(protocol.normalizeDocumentBytes(view)), [1, 2, 3]);
    assert.deepEqual(Array.from(protocol.normalizeDocumentBytes(new Uint8Array([1, 2]).buffer)), [1, 2]);
    const chunks = protocol.documentChunks(aboveOldLimit, "room", "large-update", "update");
    assert.equal(chunks.length, 1025);
    assert.equal(chunks[chunks.length - 1].data.byteLength, 1);
    const assembler = new protocol.DocumentAssembler();
    try {
      assert.equal(assembler.accept(chunks[0]), null, "Receiver rejected an update above the old limit.");
    } finally {
      assembler.clear();
    }
    assert.throws(() => protocol.documentChunks(
      new Uint8Array(protocol.MAX_DOCUMENT_UPDATE_SIZE + 1), "room", "id", "update",
    ), /256 MiB/);
  }
});
