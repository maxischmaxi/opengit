import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { App } from "./app/App";
import { flushSession } from "./navigation/sessionStore";

const renderer = await createCliRenderer({ exitOnCtrlC: false });
const root = createRoot(renderer);

let closed = false;

const shutdown = () => {
  if (closed) return;

  closed = true;
  flushSession();
  root.unmount();
  renderer.destroy();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

root.render(<App onExit={shutdown} />);
