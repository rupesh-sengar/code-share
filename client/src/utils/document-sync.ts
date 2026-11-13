import { Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  DocumentAck,
  DocumentAssembler,
  DocumentChunk,
  documentChunks,
  DOCUMENT_TIMEOUT_MS,
  MAX_DOCUMENT_UPDATE_SIZE,
  normalizeDocumentBytes,
} from "./document-protocol";

// Keep up to 1 MiB in flight instead of paying one network round trip per chunk.
export const DOCUMENT_UPLOAD_WINDOW = 16;

export function createDocumentSync(
  socket: Socket,
  doc: Y.Doc,
  room: string,
  user: string,
  onError: (message: string | null) => void,
  onSynced: () => void = () => {},
) {
  const remoteOrigin = Symbol("remote-document");
  const assembler = new DocumentAssembler();
  let disposed = false;
  let generation = 0;
  let transferId = 0;
  let syncId = "";
  let serverStateVector: Uint8Array | undefined;
  let ready = false;
  let sending = false;
  let blockedBySize = false;
  let queue: Uint8Array[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    generation++;
    ready = false;
    sending = false;
    blockedBySize = false;
    queue = [];
    serverStateVector = undefined;
    assembler.clear();
    clearTimeout(retryTimer);
    clearTimeout(syncTimer);
  };

  const retry = (message: string) => {
    reset();
    onError(`${message} Your edits remain in this editor; retrying synchronization.`);
    if (socket.connected && !disposed) {
      retryTimer = setTimeout(join, 1000);
    }
  };

  const sendChunk = (chunk: DocumentChunk, activeGeneration: number) =>
    new Promise<void>((resolve, reject) => {
      if (activeGeneration !== generation || !socket.connected || disposed) {
        resolve();
        return;
      }
      socket.timeout(DOCUMENT_TIMEOUT_MS).emit(
        "document:chunk",
        chunk,
        (error: Error | null, ack?: DocumentAck) => {
          if (error || !ack?.ok) {
            reject(error || new Error(ack?.message || "Text was not saved."));
          } else {
            resolve();
          }
        },
      );
    });

  const sendQueuedUpdates = async () => {
    if (sending || !ready || !socket.connected || disposed) return;
    const activeGeneration = generation;
    sending = true;
    try {
      while (queue.length && ready && socket.connected && !disposed) {
        const update = queue.shift()!;
        const chunks = documentChunks(
          update,
          room,
          `${doc.clientID}-${++transferId}`,
          "update",
        );
        for (let start = 0; start < chunks.length; start += DOCUMENT_UPLOAD_WINDOW) {
          if (activeGeneration !== generation || !socket.connected || disposed) {
            return;
          }
          // Socket.IO keeps these ordered. Bound outstanding acknowledgements,
          // and finish this update before starting another one.
          await Promise.all(
            chunks.slice(start, start + DOCUMENT_UPLOAD_WINDOW)
              .map((chunk) => sendChunk(chunk, activeGeneration)),
          );
          if (activeGeneration !== generation) return;
        }
      }
    } catch (error) {
      if (activeGeneration === generation && !disposed) {
        retry(error instanceof Error ? error.message : "Text was not saved.");
      }
    } finally {
      if (activeGeneration === generation) sending = false;
    }
  };

  const enqueue = (update: Uint8Array) => {
    if (update.byteLength > MAX_DOCUMENT_UPDATE_SIZE) {
      reset();
      blockedBySize = true;
      onError("This text change exceeds the 256 MiB synchronization limit. Reduce it to resume sharing. Your edits remain in this editor.");
      return;
    }
    queue.push(update);
    void sendQueuedUpdates();
  };

  const waitForSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => retry("Text synchronization timed out."), DOCUMENT_TIMEOUT_MS);
  };

  function join() {
    reset();
    if (!socket.connected || disposed) return;
    const activeGeneration = generation;
    syncId = `${doc.clientID}-sync-${generation}`;
    waitForSync();
    socket.timeout(DOCUMENT_TIMEOUT_MS).emit(
      "join_room",
      { room, user, documentSyncId: syncId, stateVector: Y.encodeStateVector(doc) },
      (error: Error | null, ack?: DocumentAck) => {
        if (activeGeneration !== generation || disposed) return;
        if (error || !ack?.ok) {
          if (ack?.retryable === false) {
            reset();
            blockedBySize = true;
            onError(ack.message || "This room is too large to synchronize.");
            return;
          }
          retry(ack?.message || "Could not synchronize this room.");
          return;
        }
        try {
          serverStateVector = ack.stateVector
            ? normalizeDocumentBytes(ack.stateVector)
            : undefined;
        } catch (error) {
          retry("Could not read the room synchronization state.");
          return;
        }
        socket.emit("joined_user", { room, user });
      },
    );
  }

  const receiveChunk = (chunk: DocumentChunk) => {
    if (!chunk || chunk.room !== room || (chunk.kind === "sync" && chunk.id !== syncId)) {
      return;
    }
    try {
      const update = assembler.accept(chunk);
      if (!ready) waitForSync();
      if (!update) return;
      Y.applyUpdate(doc, update, remoteOrigin);
      if (chunk.kind === "sync") {
        clearTimeout(syncTimer);
        // The server vector covers its entire document even when it sends only
        // a delta. Fall back to the snapshot for older backend versions.
        const missing = Y.encodeStateAsUpdate(
          doc,
          serverStateVector ?? Y.encodeStateVectorFromUpdate(update),
        );
        ready = true;
        onError(null);
        if (missing.byteLength > 2) enqueue(missing);
        if (ready) onSynced();
      }
    } catch (error) {
      retry(error instanceof Error ? error.message : "Could not read shared text.");
    }
  };

  const sendLocalUpdate = (update: Uint8Array, origin: unknown) => {
    // Offline edits live in the Y.Doc, not Socket.IO's buffer. The handshake
    // recovers them after room membership has been restored.
    if (origin === remoteOrigin || !socket.connected) return;
    if (blockedBySize) {
      join();
    } else if (ready) {
      enqueue(update);
    }
  };

  doc.on("update", sendLocalUpdate);
  socket.on("document:chunk", receiveChunk);
  socket.on("connect", join);
  socket.on("disconnect", reset);
  if (socket.connected) join();

  return () => {
    disposed = true;
    reset();
    doc.off("update", sendLocalUpdate);
    socket.off("document:chunk", receiveChunk);
    socket.off("connect", join);
    socket.off("disconnect", reset);
  };
}
