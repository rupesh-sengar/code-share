import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import socket from "../../utils/socket";
import "./file-sender.scss";

const CHUNK_SIZE = 256 * 1024;
const CONNECTION_TIMEOUT_MS = 15000;
const BUFFER_LOW_THRESHOLD = 512 * 1024;
const MAX_BUFFERED_AMOUNT = 2 * 1024 * 1024;

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type SenderStatus =
  | "idle"
  | "waiting"
  | "connecting"
  | "sending"
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

type PeerState = {
  channel: RTCDataChannel;
  connection: RTCPeerConnection;
  confirmed: boolean;
  pendingCandidates: RTCIceCandidateInit[];
};

type WebRtcAnswerPayload = {
  transferId: string;
  receiverId: string;
  description: RTCSessionDescriptionInit;
};

type WebRtcIceCandidatePayload = {
  transferId: string;
  fromId: string;
  candidate: RTCIceCandidateInit;
};

type WebRtcReadyPayload = {
  transferId: string;
  receiverId: string;
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

const createChunkPacket = (chunkIndex: number, chunk: ArrayBuffer) => {
  const packet = new ArrayBuffer(8 + chunk.byteLength);
  const view = new DataView(packet);
  view.setUint32(0, chunkIndex);
  view.setUint32(4, chunk.byteLength);
  new Uint8Array(packet, 8).set(new Uint8Array(chunk));
  return packet;
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

const FileSender: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SenderStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const room = useSelector((state: any) => state.joinRoom.room);
  const senderName = useSelector(
    (state: any) => state.joinRoom.loggedInUser || "Anonymous",
  );

  const activeTransferRef = useRef<FileTransferMeta | null>(null);
  const cancelledRef = useRef<boolean>(false);
  const peersRef = useRef<Map<string, PeerState>>(new Map());

  const isBusy =
    status === "waiting" || status === "connecting" || status === "sending";
  const progressLabel = useMemo(() => `${Math.round(progress)}%`, [progress]);

  const closePeers = () => {
    peersRef.current.forEach(({ channel, connection }) => {
      channel.close();
      connection.close();
    });
    peersRef.current.clear();
  };

  useEffect(() => {
    const handlePeerReady = async ({
      transferId,
      receiverId,
    }: WebRtcReadyPayload) => {
      const activeTransfer = activeTransferRef.current;
      if (!activeTransfer || activeTransfer.transferId !== transferId) return;
      if (peersRef.current.has(receiverId)) return;

      try {
        await createPeerConnection(receiverId, activeTransfer);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not create WebRTC offer.";
        setStatus("failed");
        setStatusMessage(message);
      }
    };

    const handleAnswer = async ({
      transferId,
      receiverId,
      description,
    }: WebRtcAnswerPayload) => {
      const activeTransfer = activeTransferRef.current;
      if (!activeTransfer || activeTransfer.transferId !== transferId) return;

      const peer = peersRef.current.get(receiverId);
      if (!peer) return;

      await peer.connection.setRemoteDescription(
        new RTCSessionDescription(description),
      );

      const candidates = peer.pendingCandidates.splice(0);
      await Promise.all(
        candidates.map((candidate) =>
          peer.connection.addIceCandidate(new RTCIceCandidate(candidate)),
        ),
      );
    };

    const handleIceCandidate = async ({
      transferId,
      fromId,
      candidate,
    }: WebRtcIceCandidatePayload) => {
      const activeTransfer = activeTransferRef.current;
      if (!activeTransfer || activeTransfer.transferId !== transferId) return;

      const peer = peersRef.current.get(fromId);
      if (!peer) return;

      if (!peer.connection.remoteDescription) {
        peer.pendingCandidates.push(candidate);
        return;
      }

      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const handleCancel = ({
      transferId,
      message,
    }: {
      transferId: string;
      message?: string;
    }) => {
      const activeTransfer = activeTransferRef.current;
      if (!activeTransfer || activeTransfer.transferId !== transferId) return;

      closePeers();
      activeTransferRef.current = null;
      setStatus("failed");
      setStatusMessage(message || "Receiver cancelled the transfer.");
    };

    socket.on("webrtc:file-ready", handlePeerReady);
    socket.on("webrtc:file-answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:file-cancel", handleCancel);

    return () => {
      socket.off("webrtc:file-ready", handlePeerReady);
      socket.off("webrtc:file-answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      socket.off("webrtc:file-cancel", handleCancel);
      closePeers();
    };
  }, []);

  const createPeerConnection = async (
    receiverId: string,
    meta: FileTransferMeta,
  ) => {
    const connection = new RTCPeerConnection(RTC_CONFIGURATION);
    const channel = connection.createDataChannel(`file-${meta.transferId}`, {
      ordered: true,
    });
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

    const peerState: PeerState = {
      channel,
      connection,
      confirmed: false,
      pendingCandidates: [],
    };
    peersRef.current.set(receiverId, peerState);

    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;

      socket.emit("webrtc:ice-candidate", {
        room: meta.room,
        transferId: meta.transferId,
        targetId: receiverId,
        candidate: candidate.toJSON(),
      });
    };

    connection.onconnectionstatechange = () => {
      if (
        !cancelledRef.current &&
        activeTransferRef.current?.transferId === meta.transferId &&
        connection.connectionState === "disconnected"
      ) {
        setStatus("connecting");
        setStatusMessage("Peer connection interrupted. Waiting...");
        return;
      }

      if (
        !cancelledRef.current &&
        activeTransferRef.current?.transferId === meta.transferId &&
        ["failed", "closed"].includes(connection.connectionState)
      ) {
        setStatus("failed");
        setStatusMessage("Direct connection was interrupted.");
      }
    };

    channel.onopen = () => {
      setStatus("connecting");
      setStatusMessage("Direct peer connection ready.");
    };

    channel.onmessage = ({ data }) => {
      const message = parseControlMessage(data);
      if (message?.messageType !== "received") return;

      const peer = peersRef.current.get(receiverId);
      if (peer) {
        peer.confirmed = true;
      }
    };

    channel.onerror = () => {
      if (activeTransferRef.current?.transferId === meta.transferId) {
        setStatus("failed");
        setStatusMessage("Data channel failed.");
      }
    };

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    socket.emit("webrtc:file-offer", {
      ...meta,
      targetId: receiverId,
      description: connection.localDescription?.toJSON(),
    });
  };

  const waitForOpenChannels = (expectedRecipients: number) =>
    new Promise<RTCDataChannel[]>((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (cancelledRef.current) {
          reject(new Error("Transfer cancelled."));
          return;
        }

        const openChannels = Array.from(peersRef.current.values())
          .map((peer) => peer.channel)
          .filter((channel) => channel.readyState === "open");

        if (openChannels.length >= expectedRecipients) {
          resolve(openChannels);
          return;
        }

        if (Date.now() - startedAt > CONNECTION_TIMEOUT_MS) {
          if (openChannels.length > 0) {
            resolve(openChannels);
            return;
          }

          reject(new Error("No direct peer connection could be established."));
          return;
        }

        window.setTimeout(check, 100);
      };

      check();
    });

  const emitWithAck = <TPayload,>(eventName: string, payload: TPayload) =>
    new Promise<ServerAck>((resolve, reject) => {
      socket.timeout(CONNECTION_TIMEOUT_MS).emit(
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

  const waitForBufferedAmount = (channel: RTCDataChannel) =>
    new Promise<void>((resolve, reject) => {
      if (channel.readyState !== "open") {
        reject(new Error("Data channel is not open."));
        return;
      }

      if (channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
        resolve();
      return;
    }

      let timeoutId: number;
      const handleLowBuffer = () => {
        window.clearTimeout(timeoutId);
        channel.removeEventListener("bufferedamountlow", handleLowBuffer);
        resolve();
      };

      timeoutId = window.setTimeout(() => {
        channel.removeEventListener("bufferedamountlow", handleLowBuffer);
        reject(new Error("Peer connection buffer stayed full too long."));
      }, CONNECTION_TIMEOUT_MS);

      channel.addEventListener("bufferedamountlow", handleLowBuffer);
    });

  const sendToChannels = async (
    channels: RTCDataChannel[],
    payload: string | ArrayBuffer,
  ) => {
    await Promise.all(
      channels.map(async (channel) => {
        await waitForBufferedAmount(channel);
        if (typeof payload === "string") {
          channel.send(payload);
          return;
        }

        channel.send(payload);
      }),
    );
  };

  const cancelTransfer = () => {
    cancelledRef.current = true;
    const activeTransfer = activeTransferRef.current;

    if (activeTransfer) {
      socket.emit("webrtc:file-cancel", {
        room: activeTransfer.room,
        transferId: activeTransfer.transferId,
        message: "Sender cancelled the transfer.",
      });
    }

    closePeers();
    activeTransferRef.current = null;
    setStatus("idle");
    setStatusMessage("Transfer cancelled.");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;
    setFile(selectedFile);
    setProgress(0);
    setStatus(selectedFile ? "idle" : status);
    setStatusMessage(selectedFile ? "" : "Choose a file to share.");
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

    closePeers();
    cancelledRef.current = false;

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

    activeTransferRef.current = meta;
    setStatus("waiting");
    setProgress(0);
    setStatusMessage("Finding receivers...");

    try {
      const ack = await emitWithAck("webrtc:file-request", meta);
      const expectedRecipients = Math.max(ack.recipients || 0, 1);

      setStatus("connecting");
      setStatusMessage("Creating direct peer connection...");

      const channels = await waitForOpenChannels(expectedRecipients);
      await sendToChannels(
        channels,
        JSON.stringify({
          messageType: "manifest",
          ...meta,
        }),
      );

      setStatus("sending");
      setStatusMessage(`Sending directly to ${channels.length} peer(s)...`);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        if (cancelledRef.current) {
          throw new Error("Transfer cancelled.");
        }

        const start = chunkIndex * CHUNK_SIZE;
        const chunk = await file
          .slice(start, Math.min(start + CHUNK_SIZE, file.size))
          .arrayBuffer();
        const packet = createChunkPacket(chunkIndex, chunk);

        await sendToChannels(channels, packet);
        setProgress(((chunkIndex + 1) / totalChunks) * 100);
      }

      await sendToChannels(
        channels,
        JSON.stringify({
          messageType: "complete",
          transferId,
          totalChunks,
          size: file.size,
        }),
      );

      setStatus("completed");
      setStatusMessage("File sent over direct peer connection.");
      activeTransferRef.current = null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "File transfer failed.";

      if (message !== "Transfer cancelled.") {
        socket.emit("webrtc:file-cancel", {
          room,
          transferId,
          message,
        });
        setStatus("failed");
        setStatusMessage(message);
      }
    } finally {
      activeTransferRef.current = null;
    }
  };

  return (
    <div className="sender-container">
      <div className="sender-header">
        <span className="sender-title">Share file</span>
        <span className={`sender-status sender-status-${status}`}>
          {status}
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
