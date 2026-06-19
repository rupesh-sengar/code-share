import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import socket from "../../utils/socket";
import "./file-sender.scss";

const CHUNK_SIZE = 128 * 1024;
const ACK_TIMEOUT_MS = 12000;
const READY_TIMEOUT_MS = 12000;
const MAX_CHUNK_RETRIES = 4;

type SenderStatus =
  | "idle"
  | "waiting"
  | "sending"
  | "paused"
  | "completed"
  | "failed";

type ServerAck = {
  ok: boolean;
  message?: string;
  recipients?: number;
};

type FileTransferMeta = {
  room: string;
  transferId: string;
  filename: string;
  size: number;
  type: string;
  totalChunks: number;
  chunkSize: number;
  senderName: string;
};

type PendingWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
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

const createTransferId = () => {
  const browserCrypto = window.crypto as Crypto & {
    randomUUID?: () => string;
  };

  if (browserCrypto.randomUUID) {
    return browserCrypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const FileSender: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SenderStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const room = useSelector((state: any) => state.joinRoom.room);
  const senderName = useSelector(
    (state: any) => state.joinRoom.loggedInUser || "Anonymous",
  );

  const readyWaitersRef = useRef<Map<string, PendingWaiter>>(new Map());
  const chunkAckWaitersRef = useRef<Map<string, PendingWaiter>>(new Map());
  const activeTransferIdRef = useRef<string>("");
  const cancelledRef = useRef<boolean>(false);

  const isBusy = status === "waiting" || status === "sending" || status === "paused";
  const progressLabel = useMemo(() => `${Math.round(progress)}%`, [progress]);

  useEffect(() => {
    const readyWaiters = readyWaitersRef.current;
    const chunkAckWaiters = chunkAckWaitersRef.current;

    const handlePeerReady = ({ transferId }: { transferId: string }) => {
      const waiter = readyWaitersRef.current.get(transferId);
      if (!waiter) return;

      clearTimeout(waiter.timeoutId);
      readyWaitersRef.current.delete(transferId);
      waiter.resolve();
    };

    const handleChunkAck = ({
      transferId,
      chunkIndex,
    }: {
      transferId: string;
      chunkIndex: number;
    }) => {
      const waiterKey = `${transferId}:${chunkIndex}`;
      const waiter = chunkAckWaitersRef.current.get(waiterKey);
      if (!waiter) return;

      clearTimeout(waiter.timeoutId);
      chunkAckWaitersRef.current.delete(waiterKey);
      waiter.resolve();
    };

    const handleDisconnect = () => {
      if (activeTransferIdRef.current) {
        setStatus("paused");
        setStatusMessage("Connection lost. Waiting to resume...");
      }
    };

    const handleConnect = () => {
      if (activeTransferIdRef.current) {
        setStatus("sending");
        setStatusMessage("Connection restored. Resuming transfer...");
      }
    };

    socket.on("file:ready", handlePeerReady);
    socket.on("file:chunk-ack", handleChunkAck);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);

    return () => {
      socket.off("file:ready", handlePeerReady);
      socket.off("file:chunk-ack", handleChunkAck);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);

      readyWaiters.forEach((waiter) => {
        clearTimeout(waiter.timeoutId);
        waiter.reject(new Error("File sender closed."));
      });
      chunkAckWaiters.forEach((waiter) => {
        clearTimeout(waiter.timeoutId);
        waiter.reject(new Error("File sender closed."));
      });
      readyWaiters.clear();
      chunkAckWaiters.clear();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    setFile(selectedFile);
    setProgress(0);
    setStatus(selectedFile ? "idle" : status);
    setStatusMessage(selectedFile ? "" : "Choose a file to share.");
  };

  const createWaiter = (
    waiters: React.MutableRefObject<Map<string, PendingWaiter>>,
    key: string,
    timeoutMs: number,
    timeoutMessage: string,
  ) => {
    const existingWaiter = waiters.current.get(key);
    if (existingWaiter) {
      clearTimeout(existingWaiter.timeoutId);
      existingWaiter.reject(new Error("Superseded by a newer transfer step."));
      waiters.current.delete(key);
    }

    let pendingWaiter: PendingWaiter;
    const promise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        waiters.current.delete(key);
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      pendingWaiter = { resolve, reject, timeoutId };
      waiters.current.set(key, pendingWaiter);
    });

    const cancel = () => {
      const waiter = waiters.current.get(key);
      if (!waiter) return;

      clearTimeout(waiter.timeoutId);
      waiters.current.delete(key);
      waiter.reject(new Error("Transfer cancelled."));
    };

    return { promise, cancel };
  };

  const emitWithAck = <TPayload,>(
    eventName: string,
    payload: TPayload,
    timeoutMs = ACK_TIMEOUT_MS,
  ) =>
    new Promise<ServerAck>((resolve, reject) => {
      socket.timeout(timeoutMs).emit(
        eventName,
        payload,
        (error: Error | null, response?: ServerAck) => {
          if (error) {
            reject(error);
            return;
          }

          if (response && !response.ok) {
            reject(new Error(response.message || "Transfer was rejected."));
            return;
          }

          resolve(response || { ok: true });
        },
      );
    });

  const waitForConnection = () =>
    new Promise<void>((resolve) => {
      if (socket.connected) {
        resolve();
        return;
      }

      setStatus("paused");
      setStatusMessage("Waiting for the socket connection...");
      socket.once("connect", () => resolve());
    });

  const cancelTransfer = () => {
    cancelledRef.current = true;

    if (activeTransferIdRef.current && room) {
      socket.emit("file:cancel", {
        room,
        transferId: activeTransferIdRef.current,
        message: "Sender cancelled the transfer.",
      });
    }

    setStatus("idle");
    setStatusMessage("Transfer cancelled.");
    activeTransferIdRef.current = "";
  };

  const sendFile = async () => {
    if (!file) {
      setStatusMessage("Choose a file first.");
      return;
    }

    if (!room) {
      setStatusMessage("Join a room before sharing files.");
      return;
    }

    const transferId = createTransferId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const meta: FileTransferMeta = {
      room,
      transferId,
      filename: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      totalChunks,
      chunkSize: CHUNK_SIZE,
      senderName,
    };

    cancelledRef.current = false;
    activeTransferIdRef.current = transferId;
    setStatus("waiting");
    setProgress(0);
    setStatusMessage("Waiting for a receiver...");

    const readyWaiter = createWaiter(
      readyWaitersRef,
      transferId,
      READY_TIMEOUT_MS,
      "No receiver confirmed the transfer.",
    );

    try {
      await waitForConnection();
      await emitWithAck("file:offer", meta);
      await readyWaiter.promise;

      setStatus("sending");
      setStatusMessage("Sending file...");

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        if (cancelledRef.current) {
          throw new Error("Transfer cancelled.");
        }

        const start = chunkIndex * CHUNK_SIZE;
        const chunk = await file
          .slice(start, Math.min(start + CHUNK_SIZE, file.size))
          .arrayBuffer();

        let sent = false;
        let retryCount = 0;

        while (!sent) {
          if (cancelledRef.current) {
            throw new Error("Transfer cancelled.");
          }

          await waitForConnection();

          const waiterKey = `${transferId}:${chunkIndex}`;
          const chunkAckWaiter = createWaiter(
            chunkAckWaitersRef,
            waiterKey,
            ACK_TIMEOUT_MS,
            "Receiver did not acknowledge the chunk.",
          );

          try {
            await emitWithAck("file:chunk", {
              ...meta,
              chunkIndex,
              chunk,
            });
            await chunkAckWaiter.promise;
            sent = true;
          } catch (error) {
            chunkAckWaiter.cancel();

            if (retryCount >= MAX_CHUNK_RETRIES) {
              throw error;
            }

            retryCount += 1;
            setStatus("paused");
            setStatusMessage(
              `Network issue. Retrying chunk ${chunkIndex + 1}/${totalChunks}...`,
            );
          }
        }

        setProgress(((chunkIndex + 1) / totalChunks) * 100);
      }

      socket.emit("file:complete", meta);
      setStatus("completed");
      setStatusMessage("File shared.");
    } catch (error) {
      readyWaiter.cancel();
      const message =
        error instanceof Error ? error.message : "File transfer failed.";

      if (message !== "Transfer cancelled.") {
        socket.emit("file:cancel", {
          room,
          transferId,
          message,
        });
        setStatus("failed");
        setStatusMessage(message);
      }
    } finally {
      activeTransferIdRef.current = "";
    }
  };

  return (
    <div className="sender-container">
      <div className="sender-header">
        <span className="sender-title">Share file</span>
        <span className={`sender-status sender-status-${status}`}>
          {status === "paused" ? "retrying" : status}
        </span>
      </div>

      <label className={`sender-file-picker ${isBusy ? "is-disabled" : ""}`}>
        <input type="file" onChange={handleFileChange} disabled={isBusy} />
        <span>{file ? "Change file" : "Choose file"}</span>
      </label>

      {file && (
        <div className="sender-file-details">
          <span className="sender-file-name" title={file.name}>
            {file.name}
          </span>
          <span className="sender-file-size">{formatBytes(file.size)}</span>
        </div>
      )}

      <div className="sender-progress-row">
        <progress className="sender-progress" value={progress} max={100} />
        <span className="sender-progress-label">{progressLabel}</span>
      </div>

      {statusMessage && <p className="sender-message">{statusMessage}</p>}

      <div className="sender-actions">
        <button
          className="sender-action sender-action-primary"
          onClick={sendFile}
          disabled={!file || isBusy}
          type="button"
        >
          Share
        </button>
        {isBusy && (
          <button
            className="sender-action"
            onClick={cancelTransfer}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default FileSender;
