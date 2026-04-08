import { useKeyboard } from "@opentui/react";

import { isQuestionMark, matchesKey } from "../util/keys";

type UseGlobalKeysOptions = {
  disabled: boolean;
  dialogOpen: boolean;
  exitOnEscape: boolean;
  helpOpen: boolean;
  canPop: boolean;
  onExit: () => void;
  onBack: () => void;
  onCloseDialog: () => void;
  onOpenSettings: () => void;
  onToggleHelp: () => void;
  onOpenInstances: () => void;
};

export const useGlobalKeys = ({
  disabled,
  dialogOpen,
  exitOnEscape,
  helpOpen,
  canPop,
  onExit,
  onBack,
  onCloseDialog,
  onOpenSettings,
  onToggleHelp,
  onOpenInstances,
}: UseGlobalKeysOptions) => {
  useKeyboard((key) => {
    if (matchesKey(key, { name: "c", ctrl: true })) {
      key.preventDefault();
      onExit();
      return;
    }

    if (helpOpen && (matchesKey(key, { name: "escape" }) || matchesKey(key, { name: "q" }))) {
      key.preventDefault();
      onToggleHelp();
      return;
    }

    if (matchesKey(key, { name: "o", ctrl: true })) {
      key.preventDefault();
      onOpenSettings();
      return;
    }

    if (dialogOpen && matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      onCloseDialog();
      return;
    }

    if (dialogOpen) return;

    if (exitOnEscape && matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      onExit();
      return;
    }

    if (disabled) return;

    if (isQuestionMark(key)) {
      key.preventDefault();
      onToggleHelp();
      return;
    }

    if (matchesKey(key, { name: "i", ctrl: true })) {
      key.preventDefault();
      onOpenInstances();
      return;
    }

    if (canPop && (matchesKey(key, { name: "escape" }) || matchesKey(key, { name: "q" }))) {
      key.preventDefault();
      onBack();
    }
  });
};
