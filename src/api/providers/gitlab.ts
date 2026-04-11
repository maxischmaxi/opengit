import { Gitlab } from "@gitbeaker/rest";
import type { OffsetPagination } from "@gitbeaker/rest";

import type { Instance } from "../../config/schema";
import { getRateLimitError, normalizeError } from "../errors";
import type { Provider } from "../provider";
import type {
  ChangeRequest,
  ChangeRequestCommit,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffRefs,
  DiffResult,
  DraftComment,
  InlineComment,
  Notification,
  PageInfo,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  ReviewEvent,
  User,
} from "../types";

const normalizePageInfo = (
  paginationInfo?: Partial<OffsetPagination>,
): PageInfo => ({
  current: paginationInfo?.current ?? 1,
  previous: paginationInfo?.previous ?? null,
  next: paginationInfo?.next ?? null,
  totalPages: paginationInfo?.totalPages ?? 1,
  perPage: paginationInfo?.perPage ?? 50,
});

const withApi = async <T>(run: () => Promise<T>) => {
  const blockedError = getRateLimitError();
  if (blockedError) throw blockedError;

  try {
    return await run();
  } catch (error) {
    throw normalizeError(error, "GitLab");
  }
};

const stateToGitlab = (
  state: "open" | "closed" | "merged",
): "opened" | "closed" | "merged" => (state === "open" ? "opened" : state);

const stateFromGitlab = (
  state: string,
): "open" | "closed" | "merged" => {
  if (state === "opened") return "open";
  if (state === "merged") return "merged";
  return "closed";
};

export class GitLabProvider implements Provider {
  readonly kind: ProviderKind = "gitlab";
  private api: Gitlab<false>;
  private currentUsername: string | null = null;

  constructor(instance: Instance) {
    this.api = new Gitlab({ host: instance.host, token: instance.token });
  }

  private async getUsername(): Promise<string> {
    if (!this.currentUsername) {
      const user = await withApi(() => this.api.Users.showCurrentUser());
      this.currentUsername = user.username;
    }
    return this.currentUsername;
  }

  async getCurrentUser(): Promise<User> {
    const user = await withApi(() => this.api.Users.showCurrentUser());
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatar_url ?? null,
      webUrl: user.web_url,
    };
  }

  async listProjects(params: {
    search?: string;
    page?: number;
    perPage?: number;
    membership?: boolean;
  }): Promise<PaginatedResult<Project>> {
    const { search, page, perPage = 50, membership = true } = params;
    const response = await withApi(() =>
      this.api.Projects.all({
        search,
        page,
        perPage,
        membership,
        pagination: "offset",
        orderBy: "last_activity_at",
        sort: "desc",
        showExpanded: true,
      }),
    );

    return {
      items: response.data.map((p) => this.mapProject(p)),
      pageInfo: normalizePageInfo(response.paginationInfo),
    };
  }

  async getProject(id: number): Promise<Project> {
    const p = await withApi(() => this.api.Projects.show(id));
    return this.mapProject(p);
  }

  async listRepositoryTree(
    projectId: number,
    params: { path?: string; ref?: string } = {},
  ): Promise<RepositoryTreeEntry[]> {
    const response = await withApi(() =>
      this.api.Repositories.allRepositoryTrees(projectId, {
        path: params.path,
        ref: params.ref,
      }),
    );

    return response
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path,
        type: (entry.type === "tree" ? "tree" : "blob") as "tree" | "blob",
        mode: entry.mode,
      }))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "tree" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
  }

  async getProjectReadme(
    projectId: number,
    params: { ref?: string } = {},
  ): Promise<ProjectReadme | null> {
    const tree = await this.listRepositoryTree(projectId, params);
    const readmeEntry = tree.find(
      (entry) =>
        entry.type === "blob" &&
        /^readme(?:\.[a-z0-9._-]+)?$/i.test(entry.name),
    );

    if (!readmeEntry) return null;

    const rawContent = await withApi<string | Blob>(() =>
      this.api.RepositoryFiles.showRaw(
        projectId,
        readmeEntry.path,
        params.ref ?? "HEAD",
      ),
    );

    return {
      path: readmeEntry.path,
      content:
        typeof rawContent === "string"
          ? rawContent
          : rawContent instanceof Blob
            ? await rawContent.text()
            : String(rawContent),
    };
  }

  async getRepositoryFileRaw(
    projectId: number,
    filePath: string,
    params: { ref?: string } = {},
  ): Promise<string> {
    const rawContent = await withApi<string | Blob>(() =>
      this.api.RepositoryFiles.showRaw(
        projectId,
        filePath,
        params.ref ?? "HEAD",
      ),
    );

    return typeof rawContent === "string"
      ? rawContent
      : rawContent instanceof Blob
        ? await rawContent.text()
        : String(rawContent);
  }

  async listChangeRequests(
    projectId: number,
    params: {
      state?: "open" | "closed" | "merged";
      search?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<PaginatedResult<ChangeRequest>> {
    const { state = "open", search, page, perPage = 50 } = params;
    const response = await withApi(() =>
      this.api.MergeRequests.all({
        projectId,
        state: stateToGitlab(state),
        search,
        page,
        perPage,
        pagination: "offset",
        orderBy: "updated_at",
        sort: "desc",
        showExpanded: true,
      }),
    );

    return {
      items: response.data.map((mr) => this.mapChangeRequest(mr)),
      pageInfo: normalizePageInfo(response.paginationInfo),
    };
  }

  async getChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestDetail> {
    const mr = await withApi(() =>
      this.api.MergeRequests.show(projectId, iid),
    );
    const result = this.mapChangeRequest(mr);

    // Fetch approvals (GitLab EE only, best-effort)
    try {
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker approval types
      const approvals: any = await withApi(() =>
        (this.api as any).MergeRequestApprovals.show(projectId, iid),
      );
      const username = await this.getUsername();
      result.approvals = {
        approved: approvals.approved === true,
        approvalsGiven: approvals.approved_by?.length ?? 0,
        approvalsRequired: approvals.approvals_required ?? null,
        approvedBy: (approvals.approved_by ?? []).map((a: any) => a.user?.username ?? a.user?.name ?? ""),
        currentUserApproved: (approvals.approved_by ?? []).some(
          (a: any) => a.user?.username === username,
        ),
      };
    } catch {
      // GitLab CE doesn't have approvals API
    }

    return result;
  }

  async getChangeRequestDiff(
    projectId: number,
    iid: number,
  ): Promise<DiffResult> {
    const response = await withApi(() =>
      this.api.MergeRequests.showChanges(projectId, iid),
    );

    return {
      changes: response.changes.map((change) => ({
        oldPath: change.old_path,
        newPath: change.new_path,
        diffText: change.diff,
        renamed: change.renamed_file,
        deleted: change.deleted_file,
        newFile: change.new_file,
      })),
    };
  }

  async listChangeRequestNotes(
    projectId: number,
    iid: number,
    includeSystem = false,
  ): Promise<ChangeRequestNote[]> {
    const [response, username] = await Promise.all([
      withApi(() =>
        this.api.MergeRequestNotes.all(projectId, iid, {
          sort: "desc",
          orderBy: "updated_at",
        }),
      ),
      this.getUsername(),
    ]);

    const notes = response.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author?.name ?? null,
      createdAt: note.created_at,
      system: note.system,
      isOwn: note.author?.username === username,
    }));

    return includeSystem ? notes : notes.filter((note) => !note.system);
  }

  async createChangeRequestNote(
    projectId: number,
    iid: number,
    body: string,
  ): Promise<ChangeRequestNote> {
    const note = await withApi(() =>
      this.api.MergeRequestNotes.create(projectId, iid, body),
    );

    return {
      id: note.id,
      body: note.body,
      authorName: note.author?.name ?? null,
      createdAt: note.created_at,
      system: note.system,
      isOwn: true,
    };
  }

  async listInlineComments(
    projectId: number,
    iid: number,
  ): Promise<InlineComment[]> {
    const [discussions, username] = await Promise.all([
      withApi(() => this.api.MergeRequestDiscussions.all(projectId, iid)),
      this.getUsername(),
    ]);

    const comments: InlineComment[] = [];

    for (const discussion of discussions) {
      if (!Array.isArray(discussion.notes)) continue;
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker discussion types are complex
      const discussionId = (discussion as any).id as string;

      // Find the first note with a text position — that's the root
      let root: InlineComment | null = null;

      for (const note of discussion.notes) {
        // biome-ignore lint/suspicious/noExplicitAny: gitbeaker discussion note types are complex
        const n = note as any;
        const pos = n.position;
        if (!pos || pos.position_type !== "text") continue;

        const mapped: InlineComment = {
          id: n.id,
          body: n.body ?? "",
          authorName: n.author?.name ?? null,
          createdAt: n.created_at ?? "",
          resolved: n.resolved === true,
          isOwn: n.author?.username === username,
          threadId: discussionId,
          position: {
            path: pos.new_path ?? pos.old_path ?? "",
            oldPath: pos.old_path ?? pos.new_path ?? "",
            newLine: pos.new_line ?? undefined,
            oldLine: pos.old_line ?? undefined,
          },
          replies: [],
        };

        if (!root) {
          root = mapped;
        } else {
          root.replies.push(mapped);
        }
      }

      if (root) comments.push(root);
    }

    return comments;
  }

  async submitReview(
    projectId: number,
    iid: number,
    params: {
      event: ReviewEvent;
      body?: string;
      comments: DraftComment[];
      diffRefs?: DiffRefs;
    },
  ): Promise<void> {
    const refs = params.diffRefs;

    for (const draft of params.comments) {
      const position: Record<string, unknown> = {
        position_type: "text",
        old_path: draft.position.oldPath,
        new_path: draft.position.path,
      };

      if (refs) {
        position.base_sha = refs.baseSha;
        position.head_sha = refs.headSha;
        position.start_sha = refs.startSha;
      }

      if (draft.position.newLine) {
        position.new_line = draft.position.newLine;
      }
      if (draft.position.oldLine) {
        position.old_line = draft.position.oldLine;
      }

      await withApi(() =>
        // biome-ignore lint/suspicious/noExplicitAny: gitbeaker draft note types
        (this.api as any).MergeRequestDraftNotes.create(
          projectId,
          iid,
          draft.body,
          { position },
        ),
      );
    }

    // Publish all drafts at once
    await withApi(() =>
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker draft note types
      (this.api as any).MergeRequestDraftNotes.publishBulk(projectId, iid),
    );

    // Handle approval separately
    if (params.event === "approve") {
      await withApi(() =>
        // biome-ignore lint/suspicious/noExplicitAny: gitbeaker approval types
        (this.api as any).MergeRequestApprovals.approve(projectId, iid),
      );
    }

    // Add general review comment if body provided
    if (params.body?.trim()) {
      await withApi(() =>
        this.api.MergeRequestNotes.create(projectId, iid, params.body!),
      );
    }
  }

  async resolveInlineComment(
    projectId: number,
    iid: number,
    threadId: string,
    resolved: boolean,
  ): Promise<void> {
    await withApi(() =>
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker discussion resolve types
      (this.api.MergeRequestDiscussions as any).editNote(
        projectId,
        iid,
        threadId,
        { resolved },
      ),
    );
  }

  async replyToComment(
    projectId: number,
    iid: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    await withApi(() =>
      this.api.MergeRequestNotes.create(projectId, iid, body, {
        inReplyToId: commentId,
      } as any), // biome-ignore lint/suspicious/noExplicitAny: gitbeaker reply types
    );
  }

  async editComment(
    projectId: number,
    iid: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    await withApi(() =>
      this.api.MergeRequestNotes.edit(projectId, iid, commentId, { body }),
    );
  }

  async deleteComment(
    projectId: number,
    iid: number,
    commentId: number,
  ): Promise<void> {
    await withApi(() =>
      this.api.MergeRequestNotes.remove(projectId, iid, commentId),
    );
  }

  async getNotifications(
    options?: { since?: string },
  ): Promise<{ notifications: Notification[]; pollInterval: number }> {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker event types are complex
      const events = await withApi(() =>
        (this.api as any).Events.all({
          action: "commented",
          after: options?.since?.split("T")[0],
          per_page: 50,
        }),
      );

      const notifications: Notification[] = (events as any[]).map((e: any) => ({
        id: String(e.id ?? e.created_at),
        reason: e.action_name ?? "comment",
        subject: e.target_title ?? e.note?.noteable_type ?? "Update",
        updatedAt: e.created_at ?? "",
        repository: e.project?.path_with_namespace ?? "",
        url: e.target_url ?? null,
      }));

      return { notifications, pollInterval: 60 };
    } catch {
      return { notifications: [], pollInterval: 60 };
    }
  }

  async listChangeRequestCommits(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestCommit[]> {
    const commits = await withApi(() =>
      this.api.MergeRequests.allCommits(projectId, iid),
    );

    return commits.map((c: any) => ({
      sha: c.id ?? c.sha ?? "",
      shortSha: (c.short_id ?? c.id ?? "").slice(0, 7),
      title: c.title ?? c.message?.split("\n")[0] ?? "",
      message: c.message ?? "",
      authorName: c.author_name ?? null,
      createdAt: c.created_at ?? c.authored_date ?? "",
    }));
  }

  async approveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void> {
    await withApi(() =>
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker approval types
      (this.api as any).MergeRequestApprovals.approve(projectId, iid),
    );
  }

  async unapproveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void> {
    await withApi(() =>
      // biome-ignore lint/suspicious/noExplicitAny: gitbeaker approval types
      (this.api as any).MergeRequestApprovals.unapprove(projectId, iid),
    );
  }

  async validateToken(): Promise<User> {
    return this.getCurrentUser();
  }

  // biome-ignore lint/suspicious/noExplicitAny: gitbeaker types are complex
  private mapProject(p: any): Project {
    return {
      id: p.id,
      name: p.name,
      path: p.path,
      fullPath: p.path_with_namespace,
      fullName: p.name_with_namespace,
      description: p.description ?? null,
      visibility: p.visibility,
      defaultBranch: p.default_branch ?? null,
      webUrl: p.web_url,
      lastActivityAt: p.last_activity_at,
      openIssuesCount: p.open_issues_count ?? 0,
      starCount: p.star_count ?? 0,
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: gitbeaker types are complex
  private mapChangeRequest(mr: any): ChangeRequestDetail {
    const diffRefs: DiffRefs | undefined =
      mr.diff_refs?.base_sha && mr.diff_refs?.head_sha
        ? {
            baseSha: mr.diff_refs.base_sha,
            headSha: mr.diff_refs.head_sha,
            startSha: mr.diff_refs.start_sha ?? mr.diff_refs.base_sha,
          }
        : undefined;

    const pipelineState: Record<string, "pending" | "running" | "success" | "failed" | "canceled"> = {
      pending: "pending",
      running: "running",
      success: "success",
      failed: "failed",
      canceled: "canceled",
    };

    return {
      id: mr.id,
      iid: mr.iid,
      title: mr.title,
      description: mr.description ?? null,
      state: stateFromGitlab(mr.state),
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      authorName: mr.author?.name ?? null,
      webUrl: mr.web_url,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      diffRefs,
      metadata: {
        draft: mr.draft === true || mr.work_in_progress === true,
        labels: (mr.labels ?? []).map((l: any) =>
          typeof l === "string" ? { name: l, color: null } : { name: l.name ?? l, color: l.color ?? null },
        ),
        milestone: mr.milestone?.title ?? null,
        assignees: (mr.assignees ?? []).map((a: any) => a.username ?? a.name ?? ""),
        reviewers: (mr.reviewers ?? []).map((r: any) => r.username ?? r.name ?? ""),
        additions: null,
        deletions: null,
        changedFiles: mr.changes_count ? Number(mr.changes_count) : null,
        mergeable: mr.merge_status === "can_be_merged" ? true : mr.merge_status === "cannot_be_merged" ? false : null,
        mergeableState: mr.merge_status ?? null,
      },
      pipeline: mr.head_pipeline
        ? {
            state: pipelineState[mr.head_pipeline.status] ?? "unknown",
            url: mr.head_pipeline.web_url ?? null,
          }
        : undefined,
    };
  }
}
