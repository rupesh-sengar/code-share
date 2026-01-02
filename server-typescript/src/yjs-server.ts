import * as Y from "yjs";

import { WebSocketServer } from "ws";
export const wss = new WebSocketServer({ noServer: true });

const docs: Map<string, Y.Doc> = new Map();

export function getOrCreateDoc(room: string): Y.Doc {
  console.log({ docs });
  let doc = docs.get(room);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(room, doc);
  }
  return doc;
}
