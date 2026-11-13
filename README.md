# code-share

The current backend is `server-typescript`; `server` is the older backend.

Editor synchronization sends binary Yjs updates in 64 KiB chunks, with an
acknowledgement for each uploaded chunk and up to 16 chunks (1 MiB) in flight.
This avoids waiting one network round trip per chunk on remote connections.
The server applies and broadcasts an update only after every chunk arrives.
On joining or reconnecting, both peers exchange Yjs state vectors and send only
missing changes. A new participant still downloads the full current document.
Edits made offline remain in the open editor until synchronization resumes.
An incoming-text indicator shows the sender's upload, the receiver's download
percentage and bytes remaining, and a separate finishing stage while the editor
applies the text. Interrupted transfers are reported and completed indicators
clear automatically. Ordinary single-message edits do not display the indicator.

A single update or synchronization snapshot is limited to 256 MiB to bound
incomplete-transfer memory. Failures appear above the editor. Transient failures
retry automatically; changes above that limit must be reduced before they can
sync. Incomplete transfers expire after 30 seconds without another chunk.
Large updates require additional RAM on both server and clients; chunking bounds
the network message size, while the complete update is assembled in memory.

Install dependencies with `npm ci` in both `client` and `server-typescript`.
From `server-typescript`, run `npm test` for synchronization integration tests and
`npm run build` to build the backend. From `client`, run `npm run build` to build
the frontend. Deploy the updated TypeScript backend before the frontend; existing
browser sessions using the older update format remain supported.
