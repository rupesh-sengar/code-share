import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { useEffect, useRef } from "react";
import io from "socket.io-client";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api

interface TextAreaProps {
  value: string;
  onChange: (event: any) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  room: string;
}

const socket = io("https://code-share-backend.onrender.com"); // or your server URL

const TextArea = ({
  value,
  onChange,
  onKeyDown,
  onBlur,
  room,
}: TextAreaProps) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("monaco");

    // Join the room on the server
    socket.emit("join_room", { user: "anonymous", room });

    // When the server sends the document state
    const handleSync = (state: Uint8Array) => {
      Y.applyUpdate(ydoc, state);
    };
    socket.on("sync", handleSync);

    // When the server sends an update from another client
    const handleUpdate = (update: Uint8Array) => {
      Y.applyUpdate(ydoc, update);
    };
    socket.on("update", handleUpdate);

    // Propagate local changes to the server
    const handleDocUpdate = (update: Uint8Array) => {
      socket.emit("update", update);
    };
    ydoc.on("update", handleDocUpdate);

    // Set up Monaco editor and bind it to Yjs
    const editor = monaco.editor.create(editorContainerRef.current!, {
      value: "",
      language: "javascript",
      theme: "vs-dark",
    });

    const binding = new MonacoBinding(
      ytext,
      editor.getModel()!,
      new Set([editor]),
      null,
    );

    return () => {
      binding.destroy();
      editor.dispose();
      ydoc.off("update", handleDocUpdate);
      socket.off("sync", handleSync);
      socket.off("update", handleUpdate);
    };
  }, [room]);

  return (
    <div id="editor" ref={editorContainerRef} style={{ height: "100%" }} />
  );
};

export default TextArea;
