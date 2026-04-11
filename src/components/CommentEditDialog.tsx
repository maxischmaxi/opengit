import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState } from "react";

import { editComment } from "../api";
import { getTextareaThemeProps, useTheme } from "../app/theme";
import { showToast, useApp } from "../state/AppContext";
import { matchesKey } from "../util/keys";
import { DialogFrame } from "./DialogFrame";

export const CommentEditDialog = ({
  projectId,
  iid,
  commentId,
  initialBody,
  onClose,
}: {
  projectId: number;
  iid: number;
  commentId: number;
  initialBody: string;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const { dispatch } = useApp();
  const [draft, setDraft] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.cursorOffset = initialBody.length;
    }
  }, [initialBody]);

  useKeyboard((key) => {
    if (matchesKey(key, { name: "s", ctrl: true })) {
      key.preventDefault();
      const body = draft.trim();
      if (!body || submitting) return;
      setSubmitting(true);
      void editComment(projectId, iid, commentId, body)
        .then(() => {
          showToast(dispatch, "success", "Comment updated");
          onClose();
        })
        .catch((err) => {
          showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to edit");
          setSubmitting(false);
        });
      return;
    }

    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      onClose();
    }
  });

  return (
    <DialogFrame
      title="Edit comment"
      footer={submitting ? "Saving…" : "Ctrl+S save · Esc cancel"}
      preferredWidth={72}
      preferredHeight={18}
    >
      <textarea
        ref={textareaRef}
        focused
        flexGrow={1}
        initialValue={initialBody}
        placeholder="Edit your comment…"
        onContentChange={() => {
          setDraft(textareaRef.current?.plainText ?? "");
        }}
        {...getTextareaThemeProps(theme)}
      />
    </DialogFrame>
  );
};
