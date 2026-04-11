import { useKeyboard } from "@opentui/react";

import { useAppState } from "../state/AppContext";

export const useDialogAwareKeyboard = (handler: Parameters<typeof useKeyboard>[0]) => {
  const { dialog, helpOpen } = useAppState();

  useKeyboard((key) => {
    if (dialog || helpOpen) return;
    handler(key);
  });
};
