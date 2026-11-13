import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import { getOrCreateDoc } from "./yjs-server";
import {
  DocumentAck,
  DocumentAssembler,
  DocumentChunk,
  DocumentSizeError,
  IncomingDocumentProgress,
  DOCUMENT_CHUNK_SIZE,
  DOCUMENT_TIMEOUT_MS,
  documentChunks,
  normalizeDocumentBytes,
} from "./document-protocol";

export function registerDocumentSync(io: Server) {
  let transferId = 0;

  const broadcastUpdate = (
    sender: Socket, room: string, update: Uint8Array,
    id = `${sender.id}-${++transferId}`,
  ) => {
    const chunks = documentChunks(update, room, id, "update");
    for (const peerId of io.sockets.adapter.rooms.get(room) ?? []) {
      if (peerId === sender.id) continue;
      const peer = io.sockets.sockets.get(peerId);
      if (peer?.data.documentSyncId) {
        chunks.forEach((chunk) => peer.emit("document:chunk", chunk));
      } else {
        peer?.emit("update", update);
      }
    }
  };

  io.on("connection", (socket) => {
    const assembler = new DocumentAssembler();
    let incoming: IncomingDocumentProgress | undefined;
    let lastProgressAt = 0;
    let uploadTimer: ReturnType<typeof setTimeout> | undefined;

    const interruptUpload = () => {
      clearTimeout(uploadTimer);
      if (incoming) {
        socket.to(incoming.room).emit("document:incoming", {
          ...incoming, phase: "interrupted",
        });
        incoming = undefined;
      }
    };

    const reportUpload = (chunk: DocumentChunk, complete: boolean) => {
      if (chunk.index === 0) {
        interruptUpload();
        if (chunk.total > 1) {
          incoming = {
            room: chunk.room,
            id: `${socket.id}-${++transferId}`,
            phase: "uploading",
            receivedBytes: 0,
            totalBytes: chunk.size ?? chunk.total * DOCUMENT_CHUNK_SIZE,
          };
          lastProgressAt = 0;
        }
      }
      if (!incoming) return;
      incoming.receivedBytes += normalizeDocumentBytes(chunk.data).byteLength;
      if (complete) {
        incoming.totalBytes = incoming.receivedBytes;
        incoming.phase = "preparing";
      }
      if (complete || Date.now() - lastProgressAt >= 100) {
        socket.to(chunk.room).emit("document:incoming", { ...incoming });
        lastProgressAt = Date.now();
      }
      clearTimeout(uploadTimer);
      if (!complete) uploadTimer = setTimeout(interruptUpload, DOCUMENT_TIMEOUT_MS);
    };

    socket.on(
      "join_room",
      (
        payload: { room: string; documentSyncId?: string; stateVector?: Uint8Array },
        ack?: (result: DocumentAck) => void,
      ) => {
        try {
          const { room, documentSyncId, stateVector } = payload ?? {};
          if (
            typeof room !== "string" || !room ||
            (documentSyncId !== undefined &&
              (typeof documentSyncId !== "string" || !documentSyncId || documentSyncId.length > 128))
          ) {
            throw new Error("Invalid room synchronization request.");
          }
          const previousRoom = socket.data.room;
          interruptUpload();
          if (previousRoom && previousRoom !== room) socket.leave(previousRoom);
          assembler.clear();
          socket.join(room);
          socket.data.room = room;
          socket.data.documentSyncId = documentSyncId;

          const doc = getOrCreateDoc(room);
          if (documentSyncId) {
            const state = Y.encodeStateAsUpdate(
              doc,
              stateVector === undefined ? undefined : normalizeDocumentBytes(stateVector),
            );
            const chunks = documentChunks(state, room, documentSyncId, "sync");
            ack?.({ ok: true, stateVector: Y.encodeStateVector(doc) });
            chunks.forEach((chunk) => socket.emit("document:chunk", chunk));
          } else {
            // Retain compatibility while older browser sessions are open.
            socket.emit("sync", Y.encodeStateAsUpdate(doc));
            ack?.({ ok: true });
          }
        } catch (error) {
          ack?.({
            ok: false,
            message: (error as Error).message,
            retryable: !(error instanceof DocumentSizeError),
          });
        }
      },
    );

    const applyUpdate = (room: string, update: Uint8Array, id?: string) => {
      if (!room || room !== socket.data.room || !socket.rooms.has(room)) {
        throw new Error("Join the room before sending text.");
      }
      Y.applyUpdate(getOrCreateDoc(room), update);
      broadcastUpdate(socket, room, update, id);
    };

    socket.on("document:chunk", (chunk: DocumentChunk, ack?: (result: DocumentAck) => void) => {
      try {
        if (chunk.kind !== "update" || chunk.room !== socket.data.room || !socket.rooms.has(chunk.room)) {
          throw new Error("Join the room before sending text.");
        }
        const update = assembler.accept(chunk);
        reportUpload(chunk, update !== null);
        if (update) {
          applyUpdate(chunk.room, update, incoming?.id);
          incoming = undefined;
        }
        // The final acknowledgement means the entire Yjs update was applied.
        ack?.({ ok: true });
      } catch (error) {
        assembler.clear();
        interruptUpload();
        ack?.({ ok: false, message: (error as Error).message });
      }
    });

    socket.on("update", (payload, ack?: (result: DocumentAck) => void) => {
      try {
        const room = payload?.room ?? socket.data.room;
        applyUpdate(room, normalizeDocumentBytes(payload?.update ?? payload));
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: (error as Error).message });
      }
    });

    socket.on("disconnect", (reason) => {
      assembler.clear();
      interruptUpload();
      console.log("User disconnected:", socket.id, reason);
    });
  });
}
