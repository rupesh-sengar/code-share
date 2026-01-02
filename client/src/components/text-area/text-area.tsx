import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import socket from "../../utils/socket";

interface TextAreaProps {
  room: string;
}

const TextArea = ({ room }: TextAreaProps) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!room) {
      return;
    }
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("monaco");
    const normalizeUpdate = (data: ArrayBuffer | Uint8Array | number[]) => {
      if (data instanceof Uint8Array) {
        return data;
      }
      if (Array.isArray(data)) {
        return new Uint8Array(data);
      }
      return new Uint8Array(data);
    };

    // When the server sends the document state
    const handleSync = (state: ArrayBuffer | Uint8Array | number[]) => {
      Y.applyUpdate(ydoc, normalizeUpdate(state));
    };
    socket.on("sync", handleSync);

    // When the server sends an update from another client
    const handleUpdate = (update: ArrayBuffer | Uint8Array | number[]) => {
      Y.applyUpdate(ydoc, normalizeUpdate(update));
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
    <div
      id="editor"
      className="editor"
      ref={editorContainerRef}
      style={{ height: "100vh", width: "100vw" }}
    />
  );
};

export default TextArea;
