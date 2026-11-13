# Code Share frontend

React 18, TypeScript, Ant Design, and Vite with the official React plugin.

Use Node.js 24.15+ on the 24.x release line, or another version allowed by
`package.json`. Install dependencies with `npm ci`.

- `npm run dev` (or `npm start`): start Vite at http://localhost:3000.
- `npm run build`: type-check and build production assets into `build/`.
- `npm run preview`: preview the production build at http://localhost:4173.
- `npm test`: run the frontend tests with Vitest and jsdom.
- `npm run test:watch`: run tests in watch mode.
- `npm run typecheck`: check TypeScript without building.

Copy `.env.example` to `.env.local` to connect to a local TypeScript backend on
port 3001. Set `VITE_SERVER_URL` to select another backend. Without this variable,
the frontend connects to the existing production server. Vite embeds this value
at build time, so rebuild after changing the production backend URL. Variables
prefixed with `VITE_` are public and must not contain secrets.

The root `index.html` is Vite's entry page; static icons and the manifest remain
in `public/`. Monaco's editor and JavaScript/TypeScript workers are bundled by
Vite. The editor code loads when the application opens, so joining a room does
not wait for a separate editor download. Ant Design's
`ConfigProvider` follows the application's dark theme. The room selector retains
its original native inputs, button, and styling.

Joining adds `?name=Alice&room=my-room` to the URL. Refreshing or opening that
URL automatically joins the room with the same name. Invalid or incomplete
parameters show the normal join selector. Exiting removes the two parameters;
browser Back/Forward follows the room encoded in the URL.

Firebase hosting still serves `build/` using the existing `firebase.json`.
Build before running your usual Firebase deployment command.
