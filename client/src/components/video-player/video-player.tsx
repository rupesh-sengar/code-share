import "./video-player.scss";
import { useState, useEffect, useRef } from "react";
import socket from "../../utils/socket";

interface VideoPlayerProps {
  className: string;
}
const VideoPlayer = ({ className }: VideoPlayerProps) => {
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<MediaStream>();
  const peerConnections = useRef<any>({});

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  console.log({ remoteStreams });
  console.log({ peerConnections });

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        console.log({ stream });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        socket.on("video-player-message", (message) => {
          const data = JSON.parse(message);
          if (data.type === "offer") {
            handleReceivedOffer(data.offer, data.from);
          } else if (data.type === "answer") {
            peerConnections.current[data.from].setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
          } else if (data.type === "ice-candidate") {
            const candidate = new RTCIceCandidate(data.candidate);
            peerConnections.current[data.from].addIceCandidate(candidate);
          }
        });
        socket.emit(
          "video-player-message",
          JSON.stringify({ type: "new-user" })
        );
      })
      .catch((error) => console.error("Error accessing media devices:", error));

    return () => {
      localStream && localStream.getTracks().forEach((track) => track.stop());
      socket.off("video-player-message");
    };
  }, [socket]);

  const handleReceivedOffer = (offer: any, from: any) => {
    const peerConnection = createPeerConnection(from);
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => peerConnection.createAnswer())
      .then((answer: any) => peerConnection.setLocalDescription(answer))
      .then(() => {
        socket.emit(
          "video-player-message",
          JSON.stringify({
            type: "answer",
            answer: peerConnection.localDescription,
            to: from,
          })
        );
      });
  };

  const createPeerConnection = (socketId: any) => {
    if (peerConnections.current[socketId]) {
      return peerConnections.current[socketId];
    }

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections.current[socketId] = peerConnection;

    if (localStream)
      localStream
        .getTracks()
        .forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      setRemoteStreams((prevStreams: any) => ({
        ...prevStreams,
        [socketId]: event.streams[0],
      }));
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(
          "video-player-message",
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
            to: socketId,
          })
        );
      }
    };

    peerConnection.oniceconnectionstatechange = (event) => {
      if (peerConnection.iceConnectionState === "disconnected") {
        setRemoteStreams((prevStreams: any) => {
          const updatedStreams = { ...prevStreams };
          delete updatedStreams[socketId];
          return updatedStreams;
        });
        peerConnections.current[socketId] &&
          peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
    };

    return peerConnection;
  };
  return (
    <div className={className}>
      <video className={className} ref={localVideoRef} autoPlay muted />
      {remoteStreams &&
        Object.entries(remoteStreams).map(([socketId, stream]) => (
          <video
            className={className}
            key={socketId}
            autoPlay
            playsInline
            ref={(ref) => {
              if (ref) ref.srcObject = stream;
            }}
          />
        ))}
    </div>
  );
};

export default VideoPlayer;
