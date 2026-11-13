// Keep the client and server copies of this wire format and its limits in sync.
export const DOCUMENT_CHUNK_SIZE = 64 * 1024;
export const MAX_DOCUMENT_UPDATE_SIZE = 256 * 1024 * 1024;
export const DOCUMENT_TIMEOUT_MS = 30000;

export type DocumentChunk = {
  room: string;
  id: string;
  kind: "sync" | "update";
  index: number;
  total: number;
  data: Uint8Array;
};

export type DocumentAck = { ok: boolean; message?: string; retryable?: boolean };

export class DocumentSizeError extends Error {}

export function normalizeDocumentBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // Older clients send Yjs updates as JSON arrays.
  if (Array.isArray(data)) return new Uint8Array(data);
  throw new Error("Invalid document data.");
}

export function documentChunks(
  bytes: Uint8Array,
  room: string,
  id: string,
  kind: DocumentChunk["kind"],
): DocumentChunk[] {
  if (bytes.byteLength > MAX_DOCUMENT_UPDATE_SIZE) {
    throw new DocumentSizeError("This text change exceeds the 256 MiB synchronization limit.");
  }
  const chunks: DocumentChunk[] = [];
  const total = Math.ceil(bytes.byteLength / DOCUMENT_CHUNK_SIZE);
  for (let index = 0; index < total; index++) {
    chunks.push({
      room,
      id,
      kind,
      index,
      total,
      data: bytes.subarray(
        index * DOCUMENT_CHUNK_SIZE,
        (index + 1) * DOCUMENT_CHUNK_SIZE,
      ),
    });
  }
  return chunks;
}

// Socket.IO preserves ordering. Only one incomplete update is retained per peer.
export class DocumentAssembler {
  private current: DocumentChunk | null = null;
  private chunks: Uint8Array[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  clear = () => {
    clearTimeout(this.timer);
    this.current = null;
    this.chunks = [];
  };

  accept(chunk: DocumentChunk): Uint8Array | null {
    const data = normalizeDocumentBytes(chunk.data);
    if (
      typeof chunk.room !== "string" ||
      typeof chunk.id !== "string" ||
      chunk.id.length > 128 ||
      (chunk.kind !== "sync" && chunk.kind !== "update") ||
      !Number.isSafeInteger(chunk.total) ||
      chunk.total < 1 ||
      chunk.total > MAX_DOCUMENT_UPDATE_SIZE / DOCUMENT_CHUNK_SIZE ||
      !Number.isSafeInteger(chunk.index) ||
      chunk.index < 0 ||
      chunk.index >= chunk.total ||
      data.byteLength < 1 ||
      data.byteLength > DOCUMENT_CHUNK_SIZE ||
      (chunk.index < chunk.total - 1 && data.byteLength !== DOCUMENT_CHUNK_SIZE)
    ) {
      this.clear();
      throw new Error("Invalid document chunk.");
    }
    if (chunk.index === 0) {
      this.clear();
      this.current = chunk;
    }
    if (
      !this.current ||
      this.current.id !== chunk.id ||
      this.current.room !== chunk.room ||
      this.current.kind !== chunk.kind ||
      this.current.total !== chunk.total ||
      chunk.index !== this.chunks.length
    ) {
      this.clear();
      throw new Error("Document chunks arrived out of order.");
    }
    this.chunks.push(data);
    clearTimeout(this.timer);
    this.timer = setTimeout(this.clear, DOCUMENT_TIMEOUT_MS);
    if (this.chunks.length !== chunk.total) return null;

    const bytes = new Uint8Array(
      (chunk.total - 1) * DOCUMENT_CHUNK_SIZE + data.byteLength,
    );
    this.chunks.forEach((part, index) => {
      bytes.set(part, index * DOCUMENT_CHUNK_SIZE);
    });
    this.clear();
    return bytes;
  }
}
