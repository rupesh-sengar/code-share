import React, { useCallback, useEffect, useRef, useState } from "react";
import socket from "../../utils/socket";
import "./file-receiver.scss";

type TransferStatus = "receiving" | "completed" | "failed";

type FileTransferPayload = {
  room: string;
  transferId: string;
  senderId: string;
  senderName?: string;
  filename: string;
  size: number;
  type?: string;
  totalChunks: number;
};

type FileChunkPayload = FileTransferPayload & {
  chunkIndex: number;
  chunk: ArrayBuffer | Uint8Array | number[];
};

type FileCancelPayload = {
  transferId: string;
  message?: string;
};

type ReceiverTransfer = {
  transferId: string;
  senderId: string;
  senderName: string;
  filename: string;
  size: number;
  type: string;
  totalChunks: number;
  receivedChunks: number;
  receivedBytes: number;
  status: TransferStatus;
  message: string;
  downloadUrl?: string;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / Math.pow(1024, unitIndex)).toFixed(
    unitIndex === 0 ? 0 : 1,
  )} ${units[unitIndex]}`;
};

const normalizeChunk = (chunk: ArrayBuffer | Uint8Array | number[]) => {
  if (chunk instanceof ArrayBuffer) {
    return chunk;
  }

  if (ArrayBuffer.isView(chunk)) {
    const view = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    return view.slice().buffer;
  }

  return new Uint8Array(chunk).buffer;
};

const FileReceiver: React.FC = () => {
  const [transfer, setTransfer] = useState<ReceiverTransfer | null>(null);
  const transferRef = useRef<ReceiverTransfer | null>(null);
  const chunksRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const downloadUrlRef = useRef<string>("");

  const setActiveTransfer = useCallback((nextTransfer: ReceiverTransfer | null) => {
    transferRef.current = nextTransfer;
    setTransfer(nextTransfer);
  }, []);

  const revokeDownloadUrl = useCallback(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = "";
    }
  }, []);

  const createTransfer = useCallback(
    (payload: FileTransferPayload) => {
      revokeDownloadUrl();
      chunksRef.current.clear();

      const nextTransfer: ReceiverTransfer = {
        transferId: payload.transferId,
        senderId: payload.senderId,
        senderName: payload.senderName || "Peer",
        filename: payload.filename,
        size: payload.size,
        type: payload.type || "application/octet-stream",
        totalChunks: payload.totalChunks,
        receivedChunks: 0,
        receivedBytes: 0,
        status: "receiving",
        message: "Waiting for file data...",
      };

      setActiveTransfer(nextTransfer);
      return nextTransfer;
    },
    [revokeDownloadUrl, setActiveTransfer],
  );

  const completeTransferIfReady = useCallback(() => {
    const currentTransfer = transferRef.current;
    if (!currentTransfer) return;
    if (chunksRef.current.size !== currentTransfer.totalChunks) return;

    const orderedChunks: ArrayBuffer[] = [];
    for (let index = 0; index < currentTransfer.totalChunks; index += 1) {
      const chunk = chunksRef.current.get(index);
      if (!chunk) return;
      orderedChunks.push(chunk);
    }

    revokeDownloadUrl();
    const blob = new Blob(orderedChunks, { type: currentTransfer.type });
    const downloadUrl = URL.createObjectURL(blob);
    downloadUrlRef.current = downloadUrl;

    setActiveTransfer({
      ...currentTransfer,
      downloadUrl,
      receivedChunks: currentTransfer.totalChunks,
      receivedBytes: currentTransfer.size,
      status: "completed",
      message: "Ready to download.",
    });
  }, [revokeDownloadUrl, setActiveTransfer]);

  useEffect(() => {
    const handleOffer = (payload: FileTransferPayload) => {
      const nextTransfer = createTransfer(payload);
      socket.emit("file:ready", {
        room: payload.room,
        transferId: nextTransfer.transferId,
        senderId: payload.senderId,
      });
    };

    const handleChunk = (payload: FileChunkPayload) => {
      let currentTransfer = transferRef.current;
      if (!currentTransfer || currentTransfer.transferId !== payload.transferId) {
        currentTransfer = createTransfer(payload);
      }

      const normalizedChunk = normalizeChunk(payload.chunk);
      const isDuplicate = chunksRef.current.has(payload.chunkIndex);

      if (!isDuplicate) {
        chunksRef.current.set(payload.chunkIndex, normalizedChunk);
        currentTransfer = {
          ...currentTransfer,
          receivedChunks: currentTransfer.receivedChunks + 1,
          receivedBytes: currentTransfer.receivedBytes + normalizedChunk.byteLength,
          status: "receiving",
          message: "Receiving file...",
        };
        setActiveTransfer(currentTransfer);
      }

      socket.emit("file:chunk-ack", {
        room: payload.room,
        transferId: payload.transferId,
        chunkIndex: payload.chunkIndex,
        senderId: payload.senderId,
      });

      completeTransferIfReady();
    };

    const handleComplete = ({ transferId }: { transferId: string }) => {
      if (transferRef.current?.transferId !== transferId) return;
      completeTransferIfReady();
    };

    const handleCancel = ({ transferId, message }: FileCancelPayload) => {
      const currentTransfer = transferRef.current;
      if (!currentTransfer || currentTransfer.transferId !== transferId) return;

      revokeDownloadUrl();
      chunksRef.current.clear();
      setActiveTransfer({
        ...currentTransfer,
        status: "failed",
        message: message || "Sender cancelled the transfer.",
      });
    };

    socket.on("file:offer", handleOffer);
    socket.on("file:chunk", handleChunk);
    socket.on("file:complete", handleComplete);
    socket.on("file:cancel", handleCancel);

    return () => {
      socket.off("file:offer", handleOffer);
      socket.off("file:chunk", handleChunk);
      socket.off("file:complete", handleComplete);
      socket.off("file:cancel", handleCancel);
      revokeDownloadUrl();
    };
  }, [completeTransferIfReady, createTransfer, revokeDownloadUrl, setActiveTransfer]);

  const clearTransfer = () => {
    revokeDownloadUrl();
    chunksRef.current.clear();
    setActiveTransfer(null);
  };

  const downloadFile = () => {
    const currentTransfer = transferRef.current;
    if (!currentTransfer?.downloadUrl) return;

    const link = document.createElement("a");
    link.href = currentTransfer.downloadUrl;
    link.download = currentTransfer.filename;
    link.click();
    clearTransfer();
  };

  if (!transfer) {
    return null;
  }

  const progress = Math.min(
    100,
    transfer.size > 0
      ? (transfer.receivedBytes / transfer.size) * 100
      : (transfer.receivedChunks / transfer.totalChunks) * 100,
  );
  const progressLabel = `${Math.round(progress)}%`;

  return (
    <div className={`receiver-container receiver-container-${transfer.status}`}>
      <div className="receiver-header">
        <span className="receiver-title">
          {transfer.status === "completed" ? "File ready" : "Incoming file"}
        </span>
        <button
          className="receiver-close"
          onClick={clearTransfer}
          type="button"
          aria-label="Dismiss file transfer"
        >
          X
        </button>
      </div>

      <div className="receiver-file-name" title={transfer.filename}>
        {transfer.filename}
      </div>
      <div className="receiver-meta">
        <span>{formatBytes(transfer.receivedBytes)}</span>
        <span>{formatBytes(transfer.size)}</span>
      </div>

      <div className="receiver-progress-row">
        <progress className="receiver-progress" value={progress} max={100} />
        <span className="receiver-progress-label">{progressLabel}</span>
      </div>

      <p className="receiver-message">{transfer.message}</p>

      {transfer.status === "completed" && (
        <button
          className="receiver-download"
          onClick={downloadFile}
          type="button"
        >
          Download
        </button>
      )}
    </div>
  );
};

export default FileReceiver;
