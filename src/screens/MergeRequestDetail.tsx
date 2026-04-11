import { useEffect, useRef, useState } from "react";

import {
  approveChangeRequest,
  deleteComment,
  getChangeRequest,
  listChangeRequestCommits,
  listChangeRequestNotes,
  listInlineComments,
  resolveInlineComment,
  unapproveChangeRequest,
} from "../api";
import type { ChangeRequestNote, InlineComment } from "../api/types";
import { getSelectThemeProps, useTheme } from "../app/theme";
import { useProviderKind } from "../hooks/useProviderKind";
import { useNotifications } from "../state/NotificationContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useNavigation } from "../navigation/useNavigation";
import { showToast, useApp } from "../state/AppContext";
import { formatDate, truncate } from "../util/format";
import { matchesKey, type KeymapItem } from "../util/keys";
import { MergeRequestDiff } from "./MergeRequestDiff";

export const mergeRequestDetailKeymap: KeymapItem[] = [
  { key: "1 / 2 / 3 / ← / →", description: "Switch tab" },
  { key: "a", description: "Approve / unapprove" },
  { key: "r", description: "Reload" },
];

export const overviewKeymap: KeymapItem[] = [
  { key: "j / k", description: "Navigate comments" },
  { key: "c", description: "Compose comment" },
  { key: "r (on comment)", description: "Reply" },
  { key: "e", description: "Edit own comment" },
  { key: "d", description: "Delete own comment" },
  { key: "x", description: "Resolve / unresolve" },
];

const tabs = ["overview", "commits", "diff"] as const;

export const MergeRequestDetail = ({
  projectId,
  iid,
  tab,
}: {
  projectId: number;
  iid: number;
  tab: "overview" | "commits" | "diff";
}) => {
  const theme = useTheme();
  const providerKind = useProviderKind();
  const crPrefix = providerKind === "github" ? "#" : "!";
  const { state: appState, dispatch } = useApp();
  const navigation = useNavigation();
  const [commentIndex, setCommentIndex] = useState(0);
  const [commitIndex, setCommitIndex] = useState(0);
  const dialog = appState.dialog;
  const dialogOpen = dialog !== null;

  const mergeRequest = useAsync(
    async () => getChangeRequest(projectId, iid),
    [projectId, iid],
  );
  const notes = useAsync(
    async () =>
      tab === "overview" ? listChangeRequestNotes(projectId, iid) : [],
    [projectId, iid, tab],
  );
  const inlineComments = useAsync(
    async () =>
      tab === "overview" ? listInlineComments(projectId, iid) : [],
    [projectId, iid, tab],
  );
  const commits = useAsync(
    async () =>
      tab === "commits" ? listChangeRequestCommits(projectId, iid) : [],
    [projectId, iid, tab],
  );

  // Build unified comment list for navigation
  type CommentEntry =
    | { kind: "inline"; comment: InlineComment }
    | { kind: "note"; note: ChangeRequestNote };

  const allComments: CommentEntry[] = [
    ...(inlineComments.data ?? []).map((c): CommentEntry => ({ kind: "inline", comment: c })),
    ...(notes.data ?? []).map((n): CommentEntry => ({ kind: "note", note: n })),
  ];

  const selectedComment = allComments[commentIndex];

  const reloadComments = () => {
    notes.reload();
    inlineComments.reload();
  };

  const reloadAll = () => {
    mergeRequest.reload();
    if (tab === "overview") reloadComments();
    if (tab === "commits") commits.reload();
  };

  // Reload comments when a dialog closes
  const prevDialogOpen = useRef(dialogOpen);
  useEffect(() => {
    if (prevDialogOpen.current && !dialogOpen && tab === "overview") {
      reloadComments();
    }
    prevDialogOpen.current = dialogOpen;
  }, [dialogOpen, tab]);

  // Auto-reload on notifications
  const { state: notifState, markRead } = useNotifications();
  const prevUnread = useRef(notifState.unreadCount);
  useEffect(() => {
    if (notifState.unreadCount > prevUnread.current) {
      reloadComments();
      markRead();
    }
    prevUnread.current = notifState.unreadCount;
  }, [notifState.unreadCount, markRead]);

  const handleApprove = () => {
    const mr = mergeRequest.data;
    if (!mr?.approvals) {
      showToast(dispatch, "error", "Approvals not available");
      return;
    }
    if (mr.approvals.currentUserApproved) {
      void unapproveChangeRequest(projectId, iid)
        .then(() => {
          showToast(dispatch, "success", "Approval removed");
          mergeRequest.reload();
        })
        .catch((err) => {
          showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to unapprove");
        });
    } else {
      dispatch({ type: "DIALOG_OPEN", dialog: { kind: "approveConfirm" } });
    }
  };

  useDialogAwareKeyboard((key) => {
    // Tab switching
    if (matchesKey(key, { name: "1" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "overview" });
      return;
    }
    if (matchesKey(key, { name: "2" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "commits" });
      return;
    }
    if (matchesKey(key, { name: "3" })) {
      key.preventDefault();
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: "diff" });
      return;
    }
    if (matchesKey(key, { name: "right" })) {
      key.preventDefault();
      key.stopPropagation();
      const nextIndex = (tabs.indexOf(tab) + 1) % tabs.length;
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: tabs[nextIndex]! });
      return;
    }
    if (matchesKey(key, { name: "left" })) {
      key.preventDefault();
      key.stopPropagation();
      const prevIndex = (tabs.indexOf(tab) + tabs.length - 1) % tabs.length;
      navigation.replace({ kind: "mrDetail", projectId, iid, tab: tabs[prevIndex]! });
      return;
    }

    // Approve
    if (matchesKey(key, { name: "a" })) {
      key.preventDefault();
      handleApprove();
      return;
    }

    // Approve confirm dialog
    if (dialog?.kind === "approveConfirm") {
      if (matchesKey(key, { name: "y" })) {
        key.preventDefault();
        dispatch({ type: "DIALOG_CLOSE" });
        void approveChangeRequest(projectId, iid)
          .then(() => {
            showToast(dispatch, "success", "Approved");
            mergeRequest.reload();
          })
          .catch((err) => {
            showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to approve");
          });
        return;
      }
      if (matchesKey(key, { name: "n" }) || matchesKey(key, { name: "escape" })) {
        key.preventDefault();
        dispatch({ type: "DIALOG_CLOSE" });
        return;
      }
    }

    // Overview tab: comment actions
    if (tab === "overview") {
      if (matchesKey(key, { name: "j" }) || matchesKey(key, { name: "down" })) {
        key.preventDefault();
        key.stopPropagation();
        setCommentIndex((prev) => Math.min(allComments.length - 1, prev + 1));
        return;
      }
      if (matchesKey(key, { name: "k" }) || matchesKey(key, { name: "up" })) {
        key.preventDefault();
        key.stopPropagation();
        setCommentIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (matchesKey(key, { name: "c" })) {
        key.preventDefault();
        navigation.push({ kind: "commentCompose", projectId, iid });
        return;
      }

      // Reply
      if (matchesKey(key, { name: "r" }) && selectedComment) {
        key.preventDefault();
        const id = selectedComment.kind === "inline" ? selectedComment.comment.id : selectedComment.note.id;
        const author = selectedComment.kind === "inline"
          ? selectedComment.comment.authorName ?? "unknown"
          : selectedComment.note.authorName ?? "unknown";
        const body = selectedComment.kind === "inline" ? selectedComment.comment.body : selectedComment.note.body;
        dispatch({
          type: "DIALOG_OPEN",
          dialog: { kind: "commentReply", commentId: id, authorName: author, body, isInline: selectedComment.kind === "inline" },
        });
        return;
      }

      // Edit
      if (matchesKey(key, { name: "e" }) && selectedComment) {
        key.preventDefault();
        const isOwn = selectedComment.kind === "inline" ? selectedComment.comment.isOwn : selectedComment.note.isOwn;
        if (!isOwn) { showToast(dispatch, "error", "Can only edit your own comments"); return; }
        const id = selectedComment.kind === "inline" ? selectedComment.comment.id : selectedComment.note.id;
        const body = selectedComment.kind === "inline" ? selectedComment.comment.body : selectedComment.note.body;
        dispatch({ type: "DIALOG_OPEN", dialog: { kind: "commentEdit", commentId: id, body, isInline: selectedComment.kind === "inline" } });
        return;
      }

      // Delete
      if (matchesKey(key, { name: "d" }) && selectedComment) {
        key.preventDefault();
        const isOwn = selectedComment.kind === "inline" ? selectedComment.comment.isOwn : selectedComment.note.isOwn;
        if (!isOwn) { showToast(dispatch, "error", "Can only delete your own comments"); return; }
        const id = selectedComment.kind === "inline" ? selectedComment.comment.id : selectedComment.note.id;
        void deleteComment(projectId, iid, id)
          .then(() => { showToast(dispatch, "success", "Comment deleted"); reloadComments(); })
          .catch((err) => { showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to delete"); });
        return;
      }

      // Resolve
      if (matchesKey(key, { name: "x" }) && selectedComment?.kind === "inline") {
        key.preventDefault();
        const c = selectedComment.comment;
        if (!c.threadId) { showToast(dispatch, "error", "Cannot resolve this comment"); return; }
        void resolveInlineComment(projectId, iid, c.threadId, !c.resolved)
          .then(() => { showToast(dispatch, "success", c.resolved ? "Comment unresolved" : "Comment resolved"); reloadComments(); })
          .catch((err) => { showToast(dispatch, "error", err instanceof Error ? err.message : "Failed to resolve"); });
        return;
      }
    }

    // Global reload
    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      reloadAll();
    }
  });

  if (mergeRequest.loading) return <Loader label="Loading merge request…" />;
  if (mergeRequest.error)
    return <ErrorBanner error={mergeRequest.error as Error} />;
  if (!mergeRequest.data)
    return (
      <EmptyState
        title="Merge request missing"
        description="The merge request could not be loaded."
      />
    );

  const mr = mergeRequest.data;
  const meta = mr.metadata;
  const pipeline = mr.pipeline;
  const approvals = mr.approvals;
  const selectedCommit = commits.data?.[commitIndex];

  // Pipeline state icons
  const pipelineIcon = (state: string) => {
    switch (state) {
      case "success": return "✓";
      case "failed": return "✗";
      case "running": return "●";
      case "pending": return "○";
      case "canceled": return "⊘";
      default: return "?";
    }
  };

  const pipelineColor = (state: string) => {
    switch (state) {
      case "success": return theme.colors.success;
      case "failed": return theme.colors.error;
      case "running": case "pending": return theme.colors.warning;
      default: return theme.colors.muted;
    }
  };

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        flexShrink={0}
      >
        <text>
          <strong>{`${crPrefix}${mr.iid} ${mr.title}`}</strong>
          {meta?.draft ? <span fg={theme.colors.warning}>{" DRAFT"}</span> : null}
          {`\nState: ${mr.state} · Author: ${mr.authorName ?? "unknown"} · Updated: ${formatDate(mr.updatedAt)}`}
          {`\n${mr.sourceBranch} → ${mr.targetBranch}`}
        </text>
      </box>

      <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column" flexShrink={0}>
        <text wrapMode="none">
          {tabs.map((item, index) => {
            const isSelected = item === tab;
            const label = ` ${item} `;
            const separator = index < tabs.length - 1 ? "  " : "";
            return (
              <span key={item}>
                {isSelected ? (
                  <span fg={theme.colors.background} bg={theme.colors.accent}>{label}</span>
                ) : (
                  <span fg={theme.colors.muted}>{label}</span>
                )}
                {separator}
              </span>
            );
          })}
        </text>
      </box>

      <box flexGrow={1}>
        {/* === OVERVIEW TAB === */}
        {tab === "overview" ? (
          <scrollbox focused={!dialogOpen} flexGrow={1}>
            <box flexDirection="column" gap={1} paddingRight={1}>
              {/* Description */}
              <box backgroundColor={theme.colors.surface} padding={1}>
                <text>{mr.description || "No description provided."}</text>
              </box>

              {/* Status: Pipeline */}
              {pipeline ? (
                <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column">
                  <text fg={theme.colors.muted}>Pipeline</text>
                  <text fg={pipelineColor(pipeline.state)}>
                    {`${pipelineIcon(pipeline.state)} ${pipeline.state}`}
                  </text>
                  {pipeline.details?.map((d) => (
                    <text key={d.name} fg={pipelineColor(d.state)}>
                      {`  ${pipelineIcon(d.state)} ${d.name}`}
                    </text>
                  ))}
                </box>
              ) : null}

              {/* Approvals */}
              {approvals ? (
                <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column">
                  <text fg={theme.colors.muted}>Approvals</text>
                  <text>
                    {approvals.approvalsRequired !== null
                      ? `${approvals.approvalsGiven}/${approvals.approvalsRequired} required`
                      : `${approvals.approvalsGiven} approval${approvals.approvalsGiven !== 1 ? "s" : ""}`}
                    {approvals.approvedBy.length > 0
                      ? ` · by ${approvals.approvedBy.join(", ")}`
                      : ""}
                  </text>
                  <text fg={approvals.currentUserApproved ? theme.colors.success : theme.colors.muted}>
                    {approvals.currentUserApproved
                      ? "You approved · press a to unapprove"
                      : "Press a to approve"}
                  </text>
                </box>
              ) : null}

              {/* Details: Labels, Milestone, Assignees, Reviewers, Stats */}
              {meta ? (
                <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column">
                  <text fg={theme.colors.muted}>Details</text>
                  {meta.labels.length > 0 ? (
                    <text>{`Labels: ${meta.labels.map((l) => l.name).join(", ")}`}</text>
                  ) : null}
                  {meta.milestone ? <text>{`Milestone: ${meta.milestone}`}</text> : null}
                  {meta.assignees.length > 0 ? (
                    <text>{`Assignees: ${meta.assignees.join(", ")}`}</text>
                  ) : null}
                  {meta.reviewers.length > 0 ? (
                    <text>{`Reviewers: ${meta.reviewers.join(", ")}`}</text>
                  ) : null}
                  {meta.additions !== null || meta.deletions !== null ? (
                    <text fg={theme.colors.muted}>
                      {`+${meta.additions ?? 0} -${meta.deletions ?? 0}${meta.changedFiles !== null ? ` in ${meta.changedFiles} files` : ""}`}
                    </text>
                  ) : null}
                  {meta.mergeable !== null ? (
                    <text fg={meta.mergeable ? theme.colors.success : theme.colors.warning}>
                      {meta.mergeable ? "Mergeable" : `Not mergeable${meta.mergeableState ? ` (${meta.mergeableState})` : ""}`}
                    </text>
                  ) : null}
                </box>
              ) : null}

              {/* Comments section */}
              <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column">
                <text fg={theme.colors.muted}>
                  {`Comments (${allComments.length}) · c to compose`}
                </text>
              </box>
              {notes.loading || inlineComments.loading ? (
                <Loader label="Loading comments…" />
              ) : allComments.length === 0 ? (
                <box backgroundColor={theme.colors.surface} padding={1}>
                  <text fg={theme.colors.muted}>No comments yet.</text>
                </box>
              ) : (
                allComments.map((entry, idx) => {
                  const isSelected = idx === commentIndex;
                  const bg = isSelected ? theme.colors.surfaceElevated : theme.colors.surface;

                  if (entry.kind === "inline") {
                    const c = entry.comment;
                    const resolvedTag = c.resolved ? " · resolved" : "";
                    const ownTag = c.isOwn ? " · you" : "";
                    return (
                      <box
                        key={`inline-${c.id}`}
                        backgroundColor={bg}
                        borderStyle={isSelected ? "single" : undefined}
                        borderColor={isSelected ? theme.colors.accent : undefined}
                        padding={1}
                        flexDirection="column"
                        gap={1}
                      >
                        <text fg={c.resolved ? theme.colors.muted : theme.colors.accent}>
                          {`${c.authorName ?? "unknown"} · ${c.position.path}:${c.position.newLine ?? c.position.oldLine} · ${formatDate(c.createdAt)}${resolvedTag}${ownTag}`}
                        </text>
                        <text fg={c.resolved ? theme.colors.muted : undefined}>{c.body}</text>
                        {c.replies.length > 0 ? (
                          <box flexDirection="column" gap={1} paddingLeft={2}>
                            {c.replies.map((reply) => (
                              <box key={reply.id} backgroundColor={theme.colors.surfaceAlt} padding={1} flexDirection="column">
                                <text fg={theme.colors.muted}>
                                  {`${reply.authorName ?? "unknown"} · ${formatDate(reply.createdAt)}${reply.isOwn ? " · you" : ""}`}
                                </text>
                                <text>{reply.body}</text>
                              </box>
                            ))}
                          </box>
                        ) : null}
                        {isSelected ? (
                          <text fg={theme.colors.muted}>
                            {`r reply${c.isOwn ? " · e edit · d delete" : ""}${c.threadId ? ` · x ${c.resolved ? "unresolve" : "resolve"}` : ""}`}
                          </text>
                        ) : null}
                      </box>
                    );
                  }

                  const n = entry.note;
                  const ownTag = n.isOwn ? " · you" : "";
                  return (
                    <box
                      key={`note-${n.id}`}
                      backgroundColor={bg}
                      borderStyle={isSelected ? "single" : undefined}
                      borderColor={isSelected ? theme.colors.accent : undefined}
                      padding={1}
                      flexDirection="column"
                      gap={1}
                    >
                      <text fg={theme.colors.muted}>
                        {`${n.authorName ?? "unknown"} · ${formatDate(n.createdAt)}${ownTag}`}
                      </text>
                      <text>{n.body}</text>
                      {isSelected ? (
                        <text fg={theme.colors.muted}>
                          {`r reply${n.isOwn ? " · e edit · d delete" : ""}`}
                        </text>
                      ) : null}
                    </box>
                  );
                })
              )}
            </box>
          </scrollbox>
        ) : null}

        {/* === COMMITS TAB === */}
        {tab === "commits" ? (
          commits.loading ? (
            <Loader label="Loading commits…" />
          ) : commits.error ? (
            <ErrorBanner error={commits.error as Error} />
          ) : !commits.data || commits.data.length === 0 ? (
            <EmptyState title="No commits" description="No commits found on this branch." />
          ) : (
            <box flexDirection="column" gap={1} flexGrow={1}>
              <box
                backgroundColor={theme.colors.surface}
                padding={1}
                flexGrow={1}
                maxHeight="50%"
              >
                <select
                  focused={!dialogOpen}
                  flexGrow={1}
                  selectedIndex={commitIndex}
                  options={commits.data.map((c) => ({
                    name: truncate(`${c.shortSha} ${c.title}`, 72),
                    description: `${c.authorName ?? "unknown"} · ${formatDate(c.createdAt)}`,
                    value: c.sha,
                  }))}
                  onChange={(index) => setCommitIndex(index)}
                  {...getSelectThemeProps(theme)}
                />
              </box>
              {selectedCommit ? (
                <scrollbox focused={false} flexGrow={1}>
                  <box backgroundColor={theme.colors.surface} padding={1} flexDirection="column" gap={1}>
                    <text>
                      <strong>{selectedCommit.shortSha}</strong>
                      {` ${selectedCommit.authorName ?? "unknown"} · ${formatDate(selectedCommit.createdAt)}`}
                    </text>
                    <text>{selectedCommit.message}</text>
                  </box>
                </scrollbox>
              ) : null}
            </box>
          )
        ) : null}

        {/* === DIFF TAB === */}
        {tab === "diff" ? (
          <MergeRequestDiff
            projectId={projectId}
            iid={iid}
            sourceBranch={mr.sourceBranch}
            targetBranch={mr.targetBranch}
          />
        ) : null}
      </box>
    </box>
  );
};
