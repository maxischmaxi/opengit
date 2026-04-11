import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";

import { getTextareaThemeProps, useTheme } from "../app/theme";
import { DialogFrame } from "../components/DialogFrame";
import { useReview } from "../state/ReviewContext";
import { matchesKey } from "../util/keys";
import type { DiffPosition } from "../api/types";

export const InlineCommentComposer = ({
  position,
  onClose,
}: {
  position: DiffPosition;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const { addDraft } = useReview();
  const [draft, setDraft] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const lineLabel = position.startNewLine
    ? `L${position.startNewLine}–${position.newLine}`
    : position.startOldLine
      ? `L${position.startOldLine}–${position.oldLine}`
      : position.newLine
        ? `L${position.newLine}`
        : `L${position.oldLine}`;

  useKeyboard((key) => {
    if (matchesKey(key, { name: "s", ctrl: true })) {
      key.preventDefault();
      const body = draft.trim();
      if (!body) return;
      addDraft(body, position);
      onClose();
      return;
    }

    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      if (!draft.trim() || confirmDiscard) {
        onClose();
        return;
      }
      setConfirmDiscard(true);
    }
  });

  const footer = confirmDiscard
    ? "Press Esc again to discard"
    : "Ctrl+S save draft · Esc cancel";

  return (
    <DialogFrame
      title={`Comment on ${position.path} ${lineLabel}`}
      footer={footer}
      preferredWidth={72}
      preferredHeight={16}
    >
      <textarea
        ref={textareaRef}
        focused
        flexGrow={1}
        placeholder="Write your review comment…"
        onContentChange={() => {
          const next = textareaRef.current?.plainText ?? "";
          setDraft(next);
          setConfirmDiscard(false);
        }}
        {...getTextareaThemeProps(theme)}
      />
    </DialogFrame>
  );
};
