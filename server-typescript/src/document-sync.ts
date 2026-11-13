import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import { getOrCreateDoc } from "./yjs-server";
import {
  DocumentAck,
  DocumentAssembler,
  DocumentChunk,
  DocumentSizeError,
  documentChunks,
  normalizeDocumentBytes,
} from "./document-protocol";

export function registerDocumentSync(io: Server) {
  let transferId = 0;

  const broadcastUpdate = (sender: Socket, room: string, update: Uint8Array) => {
    const id = `${sender.id}-${++transferId}`;
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

    socket.on(
      "join_room",
      (
        payload: { room: string; documentSyncId?: string },
        ack?: (result: DocumentAck) => void,
      ) => {
        try {
          const { room, documentSyncId } = payload ?? {};
          if (
            typeof room !== "string" || !room ||
            (documentSyncId !== undefined &&
              (typeof documentSyncId !== "string" || !documentSyncId || documentSyncId.length > 128))
          ) {
            throw new Error("Invalid room synchronization request.");
          }
          const previousRoom = socket.data.room;
          if (previousRoom && previousRoom !== room) socket.leave(previousRoom);
          assembler.clear();
          socket.join(room);
          socket.data.room = room;
          socket.data.documentSyncId = documentSyncId;

          const state = Y.encodeStateAsUpdate(getOrCreateDoc(room));
          if (documentSyncId) {
            const chunks = documentChunks(state, room, documentSyncId, "sync");
            ack?.({ ok: true });
            chunks.forEach((chunk) => socket.emit("document:chunk", chunk));
          } else {
            // Retain compatibility while older browser sessions are open.
            socket.emit("sync", state);
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

    const applyUpdate = (room: string, update: Uint8Array) => {
      if (!room || room !== socket.data.room || !socket.rooms.has(room)) {
        throw new Error("Join the room before sending text.");
      }
      Y.applyUpdate(getOrCreateDoc(room), update);
      broadcastUpdate(socket, room, update);
    };

    socket.on("document:chunk", (chunk: DocumentChunk, ack?: (result: DocumentAck) => void) => {
      try {
        if (chunk.kind !== "update" || chunk.room !== socket.data.room || !socket.rooms.has(chunk.room)) {
          throw new Error("Join the room before sending text.");
        }
        const update = assembler.accept(chunk);
        if (update) applyUpdate(chunk.room, update);
        // The final acknowledgement means the entire Yjs update was applied.
        ack?.({ ok: true });
      } catch (error) {
        assembler.clear();
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
      console.log("User disconnected:", socket.id, reason);
    });
  });
}
