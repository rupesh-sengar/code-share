import React, { useState } from "react";
import { io } from "socket.io-client";
import { useSelector } from "react-redux";
import socket from "../../utils/socket";
import "./file-sender.scss";

const FileSender: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const room = useSelector((state: any) => state.joinRoom.room);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const sendFile = () => {
    if (!file) {
      alert("Please select a file and enter a recipient ID");
      return;
    }

    const reader = new FileReader();
    const CHUNK_SIZE = 64 * 1024; // 64KB
    let offset = 0;

    reader.onload = () => {
      const chunk = reader.result as ArrayBuffer;
      socket.emit("sendFile", {
        room: room,
        chunk,
        filename: file.name,
      });
      offset += CHUNK_SIZE;

      if (offset < file.size) {
        readNextChunk();
      } else {
        // alert("File sent successfully!");
      }
    };

    const readNextChunk = () => {
      const blob = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(blob);
    };

    readNextChunk();
  };

  return (
    <div className="FileSender-container">
      <h2>Send File</h2>
      <input
        type="file"
        className="FileSender-fileInput"
        onChange={handleFileChange}
      />
      <button className="FileSender-button" onClick={sendFile}>
        Send File
      </button>
    </div>
  );
};

export default FileSender;
