import { Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  DocumentAck,
  DocumentAssembler,
  DocumentChunk,
  IncomingDocumentProgress,
  documentChunks,
  DOCUMENT_CHUNK_SIZE,
  DOCUMENT_TIMEOUT_MS,
  MAX_DOCUMENT_UPDATE_SIZE,
  normalizeDocumentBytes,
} from "./document-protocol";

// Keep up to 1 MiB in flight instead of paying one network round trip per chunk.
export const DOCUMENT_UPLOAD_WINDOW = 16;

export type DocumentTransferProgress = {
  id: string;
  phase: "waiting" | "uploading" | "preparing" | "receiving" | "applying" | "complete" | "interrupted";
  receivedBytes: number;
  totalBytes: number | null;
};

export function createDocumentSync(
  socket: Socket,
  doc: Y.Doc,
  room: string,
  user: string,
  onError: (message: string | null) => void,
  onSynced: () => void = () => {},
  onProgress: (progress: DocumentTransferProgress | null) => void = () => {},
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
  let progress: DocumentTransferProgress | null = null;
  let lastProgressAt = 0;
  let applications: { chunk: DocumentChunk; update: Uint8Array; showProgress: boolean }[] = [];
  let applying = false;
  let cancelPaintWait: (() => void) | undefined;

  const reportProgress = (next: DocumentTransferProgress | null) => {
    const changed = next?.id !== progress?.id || next?.phase !== progress?.phase;
    progress = next;
    if (!disposed && (changed || next === null || Date.now() - lastProgressAt >= 100)) {
      lastProgressAt = Date.now();
      onProgress(next);
    }
  };

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
    applications = [];
    applying = false;
    cancelPaintWait?.();
    reportProgress(null);
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
    reportProgress({ id: syncId, phase: "waiting", receivedBytes: 0, totalBytes: null });
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

  // Give React and the browser a paint before applying a large Yjs update to
  // Monaco. Otherwise the "Finishing" state would be hidden by the same work
  // that blocks the editor. Cancel on room changes, disconnects and disposal.
  const beforePaint = () => new Promise<void>((resolve) => {
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      cancelPaintWait = undefined;
      resolve();
    };
    cancelPaintWait = finish;
    if (typeof requestAnimationFrame === "function") {
      // Animation frames pause in background tabs; keep synchronization moving.
      timer = setTimeout(finish, 100);
      frame = requestAnimationFrame(() => {
        clearTimeout(timer);
        timer = setTimeout(finish, 0);
      });
    } else {
      timer = setTimeout(finish, 0);
    }
  });

  const applyIncomingUpdates = async () => {
    if (applying || disposed) return;
    const activeGeneration = generation;
    applying = true;
    try {
      while (applications.length) {
        const { chunk, update, showProgress } = applications.shift()!;
        if (showProgress) {
          reportProgress({
            id: chunk.id, phase: "applying",
            receivedBytes: update.byteLength, totalBytes: update.byteLength,
          });
          await beforePaint();
        }
        if (disposed || activeGeneration !== generation) return;
        Y.applyUpdate(doc, update, remoteOrigin);
        if (chunk.kind === "sync") {
          clearTimeout(syncTimer);
          // The server vector covers the whole document, including when the
          // downloaded update is just a delta. Older backends send a snapshot.
          const missing = Y.encodeStateAsUpdate(
            doc, serverStateVector ?? Y.encodeStateVectorFromUpdate(update),
          );
          ready = true;
          onError(null);
          if (missing.byteLength > 2) enqueue(missing);
          if (ready) onSynced();
        }
        if (disposed || activeGeneration !== generation) return;
        if (showProgress) {
          reportProgress({
            id: chunk.id, phase: "complete",
            receivedBytes: update.byteLength, totalBytes: update.byteLength,
          });
        }
      }
    } catch (error) {
      if (!disposed && activeGeneration === generation) {
        retry(error instanceof Error ? error.message : "Could not read shared text.");
      }
    } finally {
      if (activeGeneration === generation) applying = false;
    }
  };

  const receiveChunk = (chunk: DocumentChunk) => {
    if (!chunk || chunk.room !== room || (chunk.kind === "sync" && chunk.id !== syncId)) return;
    try {
      const update = assembler.accept(chunk);
      if (!ready) waitForSync();
      const showProgress = chunk.total > 1 || chunk.kind === "sync";
      if (showProgress && !applying) {
        reportProgress({
          id: chunk.id, phase: "receiving",
          receivedBytes: chunk.index * DOCUMENT_CHUNK_SIZE + normalizeDocumentBytes(chunk.data).byteLength,
          totalBytes: update?.byteLength ?? chunk.size ?? chunk.total * DOCUMENT_CHUNK_SIZE,
        });
      }
      if (update) {
        applications.push({ chunk, update, showProgress });
        void applyIncomingUpdates();
      }
    } catch (error) {
      retry(error instanceof Error ? error.message : "Could not read shared text.");
    }
  };

  const receiveUploadProgress = (incoming: IncomingDocumentProgress) => {
    if (!incoming || incoming.room !== room || applying) return;
    if (incoming.phase === "interrupted" && progress?.id !== incoming.id) return;
    reportProgress({
      id: incoming.id, phase: incoming.phase,
      receivedBytes: incoming.receivedBytes, totalBytes: incoming.totalBytes,
    });
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
  socket.on("document:incoming", receiveUploadProgress);
  socket.on("connect", join);
  socket.on("disconnect", reset);
  if (socket.connected) join();

  return () => {
    disposed = true;
    reset();
    doc.off("update", sendLocalUpdate);
    socket.off("document:chunk", receiveChunk);
    socket.off("document:incoming", receiveUploadProgress);
    socket.off("connect", join);
    socket.off("disconnect", reset);
  };
}
