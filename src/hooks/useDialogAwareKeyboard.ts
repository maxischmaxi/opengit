import { useKeyboard } from "@opentui/react";

import { useAppState } from "../state/AppContext";

export const useDialogAwareKeyboard = (handler: Parameters<typeof useKeyboard>[0]) => {
  const { dialog } = useAppState();

  useKeyboard((key) => {
    if (dialog) return;
    handler(key);
  });
};
