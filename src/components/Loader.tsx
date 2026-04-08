import { Spinner } from "./Spinner";

export const Loader = ({ label = "Loading…" }: { label?: string }) => (
  <box flexDirection="row" gap={1} padding={1}>
    <Spinner />
    <text>{label}</text>
  </box>
);
