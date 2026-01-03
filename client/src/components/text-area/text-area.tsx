import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import socket from "../../utils/socket";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness";

interface TextAreaProps {
  room: string;
  currentUser: string;
}

const TextArea = ({ room, currentUser }: TextAreaProps) => {
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!room) return;

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("monaco");
    const awareness = new Awareness(ydoc);
    const remoteDocOrigin = Symbol("remote-doc");
    const remoteAwarenessOrigin = Symbol("remote-awareness");

    const userColor =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    awareness.setLocalStateField("user", {
      name: currentUser,
      color: userColor,
    });

    const normalize = (data: ArrayBuffer | Uint8Array | number[]) =>
      data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);

    const handleSync = (state: ArrayBuffer | Uint8Array | number[]) => {
      Y.applyUpdate(ydoc, normalize(state), remoteDocOrigin);
    };
    socket.on("sync", handleSync);

    const handleDocUpdate = (update: ArrayBuffer | Uint8Array | number[]) => {
      Y.applyUpdate(ydoc, normalize(update), remoteDocOrigin);
    };
    socket.on("update", handleDocUpdate);

    const emitDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === remoteDocOrigin) return;
      socket.emit("update", Array.from(update));
    };
    ydoc.on("update", emitDocUpdate);

    const emitAwarenessUpdate = (
      {
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      },
      origin: unknown,
    ) => {
      if (origin === remoteAwarenessOrigin) return;
      const ids = added.concat(updated).concat(removed);
      const update = encodeAwarenessUpdate(awareness, ids);
      socket.emit("awareness", Array.from(update));
    };
    awareness.on("update", emitAwarenessUpdate);

    const handleAwarenessFromServer = (
      update: ArrayBuffer | Uint8Array | number[],
    ) => {
      applyAwarenessUpdate(awareness, normalize(update), remoteAwarenessOrigin);
    };
    socket.on("awareness", handleAwarenessFromServer);

    const editor = monaco.editor.create(editorContainerRef.current!, {
      value: "",
      language: "javascript",
      theme: "vs-dark",
    });

    const binding = new MonacoBinding(
      ytext,
      editor.getModel()!,
      new Set([editor]),
      awareness,
    );

    const styleEl = document.createElement("style");
    styleEl.id = "yjs-remote-styles";
    document.head.appendChild(styleEl);

    function hexToRgba(hex: string, alpha = 0.3): string {
      let h = hex.replace("#", "");
      if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      }
      if (h.length !== 6 || /[^0-9a-f]/i.test(h)) {
        return `rgba(0, 0, 0, ${alpha})`;
      }
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function escapeCssContent(value: string): string {
      return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, " ");
    }

    function isValidHexColor(value: string): boolean {
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
    }

    function updateRemoteStyles() {
      const states = awareness.getStates();
      let css = `
        .monaco-editor .margin-view-overlays,
        .monaco-editor .view-overlays,
        .monaco-editor .contentWidgets {
          overflow: visible !important;
        }
        .yRemoteSelection {
          background-color: rgba(255, 213, 79, 0.2);
          border-radius: 2px;
          pointer-events: none;
        }
        .yRemoteSelectionHead {
          position: relative;
          border-left: 2px solid #ffb300;
          border-top: 2px solid transparent;
          border-bottom: 2px solid transparent;
          margin-left: -1px;
          box-sizing: border-box;
          z-index: 50;
          pointer-events: none;
        }
        .yRemoteSelectionHead::after {
          position: absolute;
          top: 1.2em;
          left: -1px;
          transform: none;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 999px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          line-height: 1.2;
          max-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          z-index: 2000;
        }
      `;
      states.forEach((state: any, clientId: number) => {
        if (clientId === awareness.clientID) return;
        const user = state.user;
        if (!user) return;
        const name =
          typeof user.name === "string" ? user.name : String(user.name ?? "");
        const color = typeof user.color === "string" ? user.color : "";
        const safeColor = isValidHexColor(color) ? color : "#999999";
        css += `
          .yRemoteSelection-${clientId} {
            background-color: ${hexToRgba(safeColor)};
          }
          .yRemoteSelectionHead-${clientId} {
            border-left: 2px solid ${safeColor};
            border-top: 2px solid transparent;
            border-bottom: 2px solid transparent;
          }
          .yRemoteSelectionHead-${clientId}::after {
            content: "${escapeCssContent(name)}";
            background-color: ${safeColor};
            border: 1px solid ${hexToRgba(safeColor, 0.6)};
          }
        `;
      });
      styleEl.textContent = css;
    }

    awareness.on("change", updateRemoteStyles);
    updateRemoteStyles();

    return () => {
      binding.destroy();
      editor.dispose();
      ydoc.off("update", emitDocUpdate);
      socket.off("sync", handleSync);
      socket.off("update", handleDocUpdate);
      socket.off("awareness", handleAwarenessFromServer);
      awareness.off("update", emitAwarenessUpdate);
      awareness.off("change", updateRemoteStyles);
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      ydoc.destroy();
    };
  }, [room, currentUser]);

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
