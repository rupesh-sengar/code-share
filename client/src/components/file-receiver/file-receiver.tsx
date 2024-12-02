import React, { useEffect, useState } from "react";
import socket from "../../utils/socket";
import "./file-receiver.scss";

interface FileChunk {
  chunk: Uint8Array;
  filename: string;
}

const FileReceiver: React.FC = () => {
  const [receivedChunks, setReceivedChunks] = useState<Uint8Array[]>([]);
  const [filename, setFilename] = useState<string>("");
  console.log(receivedChunks);

  useEffect(() => {
    socket.on("receiveFile", ({ chunk, filename }: FileChunk) => {
      console.log("receiving file");
      setReceivedChunks((prev) => [...prev, new Uint8Array(chunk)]);
      setFilename(filename);
    });
  }, []);

  const downloadFile = () => {
    const blob = new Blob(receivedChunks);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setReceivedChunks([]);
    setFilename("");
  };

  return (
    <div className="FileReceiver-container">
      <h2 className="FileReceiver-heading">Receive File</h2>
      {receivedChunks.length > 0 && (
        <div>
          <p className="FileReceiver-fileInfo">Receiving file: {filename}</p>
          <button className="FileReceiver-button" onClick={downloadFile}>
            Download File
          </button>
        </div>
      )}
    </div>
  );
};

export default FileReceiver;
