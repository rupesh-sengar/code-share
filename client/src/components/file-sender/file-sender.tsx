import React, { useState } from "react";
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
    <div className="sender-container">
      <div className="sender-folder">
        <div className="sender-front-side">
          <div className="sender-tip"></div>
          <div className="sender-cover"></div>
        </div>
        <div className="sender-back-side sender-cover"></div>
      </div>
      {!file && (
        <label className="sender-custom-file-upload">
          <input
            className="sender-title"
            type="file"
            onChange={handleFileChange}
          />
          Choose a file
        </label>
      )}
      {file && (
        <label className="sender-custom-file-upload" onClick={sendFile}>
          Send File
        </label>
      )}
    </div>
  );
};

export default FileSender;
