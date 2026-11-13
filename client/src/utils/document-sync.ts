import { Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  DocumentAck,
  DocumentAssembler,
  DocumentChunk,
  documentChunks,
  DOCUMENT_TIMEOUT_MS,
  MAX_DOCUMENT_UPDATE_SIZE,
} from "./document-protocol";

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
        for (const chunk of chunks) {
          if (activeGeneration !== generation || !socket.connected || disposed) {
            return;
          }
          await new Promise<void>((resolve, reject) => {
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
      { room, user, documentSyncId: syncId },
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
        // The snapshot tells us exactly which local edits the server lacks,
        // including edits made offline or while joining the room.
        const missing = Y.encodeStateAsUpdate(doc, Y.encodeStateVectorFromUpdate(update));
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
