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
    // <div className="FileReceiver-container">
    //   <h2 className="FileReceiver-heading">Receive File</h2>
    //   {receivedChunks.length > 0 && (
    //     <div>
    //       <p className="FileReceiver-fileInfo">Receiving file: {filename}</p>
    //       <button className="FileReceiver-button" onClick={downloadFile}>
    //         Download File
    //       </button>
    //     </div>
    //   )}
    // </div>
    <>
      {receivedChunks.length > 0 && (
        <button id="btn-message" className="button-message">
          <div className="content-avatar">
            <div className="status-user"></div>
            <div className="avatar">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g
                  id="SVGRepo_tracerCarrier"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                ></g>
                <g id="SVGRepo_iconCarrier">
                  <path
                    d="M13.5 3H12H7C5.89543 3 5 3.89543 5 5V19C5 20.1046 5.89543 21 7 21H7.5M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V9.75V12V19C19 20.1046 18.1046 21 17 21H16.5"
                    stroke="#82868c"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  ></path>{" "}
                  <path
                    d="M12 12V20M12 20L9.5 17.5M12 20L14.5 17.5"
                    stroke="#82868c"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  ></path>{" "}
                </g>
              </svg>
            </div>
          </div>
          <div className="notice-content">
            <div className="label-message" onClick={downloadFile}>
              {filename}
            </div>
          </div>
        </button>
      )}
    </>
  );
};

export default FileReceiver;
