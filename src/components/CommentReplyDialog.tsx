import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";

import { replyToComment } from "../api";
import { getTextareaThemeProps, useTheme } from "../app/theme";
import { showToast, useApp } from "../state/AppContext";
import { matchesKey } from "../util/keys";
import { DialogFrame } from "./DialogFrame";

export const CommentReplyDialog = ({
  projectId,
  iid,
  commentId,
  authorName,
  originalBody,
  onClose,
}: {
  projectId: number;
  iid: number;
  commentId: number;
  authorName: string;
  originalBody: string;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const { dispatch } = useApp();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useKeyboard((key) => {
    if (matchesKey(key, { name: "s", ctrl: true })) {
      key.preventDefault();
      const body = draft.trim();
      if (!body || submitting) return;
      setSubmitting(true);
      void replyToComment(projectId, iid, commentId, body)
        .then(() => {
          showToast(dispatch, "success", "Reply posted");
          onClose();
        })
        .catch((err) => {
          showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to reply");
          setSubmitting(false);
        });
      return;
    }

    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      onClose();
    }
  });

  const preview = originalBody.length > 120 ? originalBody.slice(0, 120) + "…" : originalBody;

  return (
    <DialogFrame
      title={`Reply to ${authorName}`}
      footer={submitting ? "Posting reply…" : "Ctrl+S send · Esc cancel"}
      preferredWidth={72}
      preferredHeight={18}
    >
      <box backgroundColor={theme.colors.surfaceAlt} padding={1}>
        <text fg={theme.colors.muted}>{preview}</text>
      </box>
      <textarea
        ref={textareaRef}
        focused
        flexGrow={1}
        placeholder="Write your reply…"
        onContentChange={() => {
          setDraft(textareaRef.current?.plainText ?? "");
        }}
        {...getTextareaThemeProps(theme)}
      />
    </DialogFrame>
  );
};
