import React, { useCallback, useEffect, useRef, useState } from "react";
import socket from "../../utils/socket";
import "./file-receiver.scss";

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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
  chunkSize?: number;
};

type WebRtcOfferPayload = FileTransferPayload & {
  description: RTCSessionDescriptionInit;
};

type WebRtcIceCandidatePayload = {
  transferId: string;
  fromId: string;
  candidate: RTCIceCandidateInit;
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

const parseControlMessage = (payload: unknown) => {
  if (typeof payload !== "string") return null;

  try {
    return JSON.parse(payload) as {
      messageType?: string;
      [key: string]: unknown;
    };
  } catch {
    return null;
  }
};

const parseChunkPacket = (payload: ArrayBuffer) => {
  if (payload.byteLength < 8) return null;

  const view = new DataView(payload);
  const chunkIndex = view.getUint32(0);
  const chunkLength = view.getUint32(4);
  const chunkEnd = 8 + chunkLength;

  if (chunkEnd > payload.byteLength) return null;

  return {
    chunkIndex,
    chunk: payload.slice(8, chunkEnd),
  };
};

const FileReceiver: React.FC = () => {
  const [transfer, setTransfer] = useState<ReceiverTransfer | null>(null);
  const transferRef = useRef<ReceiverTransfer | null>(null);
  const chunksRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const downloadUrlRef = useRef<string>("");
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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

  const closePeerConnection = useCallback(() => {
    channelRef.current?.close();
    connectionRef.current?.close();
    channelRef.current = null;
    connectionRef.current = null;
    pendingCandidatesRef.current = [];
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
        message: "Connecting directly...",
      };

      setActiveTransfer(nextTransfer);
      return nextTransfer;
    },
    [revokeDownloadUrl, setActiveTransfer],
  );

  const completeTransferIfReady = useCallback(
    (completeSignalReceived = false) => {
      const currentTransfer = transferRef.current;
      if (!currentTransfer) return;

      if (chunksRef.current.size !== currentTransfer.totalChunks) {
        if (completeSignalReceived) {
          setActiveTransfer({
            ...currentTransfer,
            status: "failed",
            message: "Transfer finished before all chunks arrived.",
          });
        }
        return;
      }

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

      channelRef.current?.send(
        JSON.stringify({
          messageType: "received",
          transferId: currentTransfer.transferId,
          receivedChunks: currentTransfer.totalChunks,
          receivedBytes: currentTransfer.size,
        }),
      );

      closePeerConnection();
      setActiveTransfer({
        ...currentTransfer,
        downloadUrl,
        receivedChunks: currentTransfer.totalChunks,
        receivedBytes: currentTransfer.size,
        status: "completed",
        message: "Ready to download.",
      });
    },
    [closePeerConnection, revokeDownloadUrl, setActiveTransfer],
  );

  const attachDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.binaryType = "arraybuffer";

      channel.onopen = () => {
        const currentTransfer = transferRef.current;
        if (!currentTransfer) return;

        setActiveTransfer({
          ...currentTransfer,
          message: "Receiving over direct peer connection...",
        });
      };

      channel.onmessage = ({ data }) => {
        const controlMessage = parseControlMessage(data);

        if (controlMessage?.messageType === "manifest") {
          const currentTransfer = transferRef.current;
          if (!currentTransfer) return;

          setActiveTransfer({
            ...currentTransfer,
            message: "Receiving file...",
          });
          return;
        }

        if (controlMessage?.messageType === "complete") {
          completeTransferIfReady(true);
          return;
        }

        if (!(data instanceof ArrayBuffer)) return;

        const packet = parseChunkPacket(data);
        const currentTransfer = transferRef.current;
        if (!packet || !currentTransfer) return;

        const isDuplicate = chunksRef.current.has(packet.chunkIndex);
        if (isDuplicate) return;

        chunksRef.current.set(packet.chunkIndex, packet.chunk);
        setActiveTransfer({
          ...currentTransfer,
          receivedChunks: currentTransfer.receivedChunks + 1,
          receivedBytes: currentTransfer.receivedBytes + packet.chunk.byteLength,
          message: "Receiving file...",
        });

        completeTransferIfReady();
      };

      channel.onerror = () => {
        const currentTransfer = transferRef.current;
        if (!currentTransfer || currentTransfer.status === "completed") return;

        setActiveTransfer({
          ...currentTransfer,
          status: "failed",
          message: "Data channel failed.",
        });
      };
    },
    [completeTransferIfReady, setActiveTransfer],
  );

  useEffect(() => {
    const handleRequest = (payload: FileTransferPayload) => {
      closePeerConnection();
      createTransfer(payload);

      socket.emit("webrtc:file-ready", {
        room: payload.room,
        transferId: payload.transferId,
        targetId: payload.senderId,
      });
    };

    const handleOffer = async (payload: WebRtcOfferPayload) => {
      let currentTransfer = transferRef.current;
      if (!currentTransfer || currentTransfer.transferId !== payload.transferId) {
        currentTransfer = createTransfer(payload);
      }

      const connection = new RTCPeerConnection(RTC_CONFIGURATION);
      connectionRef.current = connection;

      connection.ondatachannel = ({ channel }) => {
        attachDataChannel(channel);
      };

      connection.onicecandidate = ({ candidate }) => {
        if (!candidate) return;

        socket.emit("webrtc:ice-candidate", {
          room: payload.room,
          transferId: payload.transferId,
          targetId: payload.senderId,
          candidate: candidate.toJSON(),
        });
      };

      connection.onconnectionstatechange = () => {
        const activeTransfer = transferRef.current;
        if (
          activeTransfer &&
          activeTransfer.status !== "completed" &&
          connection.connectionState === "disconnected"
        ) {
          setActiveTransfer({
            ...activeTransfer,
            message: "Peer connection interrupted. Waiting...",
          });
          return;
        }

        if (
          activeTransfer &&
          activeTransfer.status !== "completed" &&
          ["failed", "closed"].includes(connection.connectionState)
        ) {
          setActiveTransfer({
            ...activeTransfer,
            status: "failed",
            message: "Direct connection was interrupted.",
          });
        }
      };

      await connection.setRemoteDescription(
        new RTCSessionDescription(payload.description),
      );
      const candidates = pendingCandidatesRef.current.splice(0);
      await Promise.all(
        candidates.map((candidate) =>
          connection.addIceCandidate(new RTCIceCandidate(candidate)),
        ),
      );

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      socket.emit("webrtc:file-answer", {
        room: payload.room,
        transferId: payload.transferId,
        targetId: payload.senderId,
        description: connection.localDescription?.toJSON(),
      });
    };

    const handleIceCandidate = async ({
      transferId,
      candidate,
    }: WebRtcIceCandidatePayload) => {
      const activeTransfer = transferRef.current;
      if (!activeTransfer || activeTransfer.transferId !== transferId) return;

      if (!connectionRef.current?.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      await connectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const handleCancel = ({ transferId, message }: FileCancelPayload) => {
      const currentTransfer = transferRef.current;
      if (!currentTransfer || currentTransfer.transferId !== transferId) return;

      closePeerConnection();
      revokeDownloadUrl();
      chunksRef.current.clear();
      setActiveTransfer({
        ...currentTransfer,
        status: "failed",
        message: message || "Sender cancelled the transfer.",
      });
    };

    socket.on("webrtc:file-request", handleRequest);
    socket.on("webrtc:file-offer", handleOffer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:file-cancel", handleCancel);

    return () => {
      socket.off("webrtc:file-request", handleRequest);
      socket.off("webrtc:file-offer", handleOffer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      socket.off("webrtc:file-cancel", handleCancel);
      closePeerConnection();
      revokeDownloadUrl();
    };
  }, [
    attachDataChannel,
    closePeerConnection,
    createTransfer,
    revokeDownloadUrl,
    setActiveTransfer,
  ]);

  const clearTransfer = () => {
    const currentTransfer = transferRef.current;
    if (currentTransfer?.status === "receiving") {
      socket.emit("webrtc:file-cancel", {
        transferId: currentTransfer.transferId,
        targetId: currentTransfer.senderId,
        message: "Receiver cancelled the transfer.",
      });
    }

    closePeerConnection();
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
