import type { Instance } from "../../config/schema";
import { getRateLimitError, normalizeError } from "../errors";
import type { Provider } from "../provider";
import type {
  ApprovalInfo,
  ChangeRequest,
  ChangeRequestCommit,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffChange,
  DiffRefs,
  DiffResult,
  DraftComment,
  InlineComment,
  Notification,
  PageInfo,
  PaginatedResult,
  PipelineStatus,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  ReviewEvent,
  User,
} from "../types";

const BASE_URL = "https://api.github.com";

const parseLinkHeader = (header: string | null): Record<string, number> => {
  if (!header) return {};
  const links: Record<string, number> = {};

  for (const part of header.split(",")) {
    const match = part.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="(\w+)"/);
    if (match?.[1] && match[2]) {
      links[match[2]] = Number(match[1]);
    }
  }

  return links;
};

const buildPageInfo = (
  linkHeader: string | null,
  currentPage: number,
  perPage: number,
): PageInfo => {
  const links = parseLinkHeader(linkHeader);

  return {
    current: currentPage,
    previous: links.prev ?? null,
    next: links.next ?? null,
    totalPages: links.last ?? (links.next ? currentPage + 1 : currentPage),
    perPage,
  };
};

const parseUnifiedDiff = (diffText: string): DiffChange[] => {
  const changes: DiffChange[] = [];
  const parts = diffText.split(/(?=^diff --git )/m).filter(Boolean);

  for (const part of parts) {
    const headerMatch = part.match(
      /^diff --git a\/(.+?) b\/(.+?)$/m,
    );
    if (!headerMatch?.[1] || !headerMatch[2]) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];
    const newFile = part.includes("new file mode");
    const deleted = part.includes("deleted file mode");
    const renamed =
      part.includes("rename from") || (oldPath !== newPath && !newFile && !deleted);

    const diffStart = part.indexOf("@@");
    const fileDiff = diffStart >= 0 ? part.slice(diffStart) : "";

    changes.push({
      oldPath,
      newPath,
      diffText: fileDiff,
      renamed,
      deleted,
      newFile,
    });
  }

  return changes;
};

export class GitHubProvider implements Provider {
  readonly kind: ProviderKind = "github";
  private token: string;
  private username: string;
  private repoCache = new Map<number, string>();
  private notifLastModified: string | null = null;

  constructor(instance: Instance) {
    this.token = instance.token;
    this.username = instance.username ?? "";
  }

  private async fetchRaw(
    path: string,
    {
      accept = "application/vnd.github+json",
      method = "GET",
      body,
    }: {
      accept?: string;
      method?: string;
      body?: string;
    } = {},
  ): Promise<Response> {
    const blockedError = getRateLimitError();
    if (blockedError) throw blockedError;

    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
      });

      if (!response.ok) {
        const error = {
          statusCode: response.status,
          response: {
            status: response.status,
            headers: response.headers,
          },
          message: `GitHub API error: ${response.status}`,
        };
        throw normalizeError(error, "GitHub");
      }

      return response;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "kind" in error &&
        typeof (error as { kind: unknown }).kind === "string"
      ) {
        throw error;
      }
      throw normalizeError(error, "GitHub");
    }
  }

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.fetchRaw(`${BASE_URL}/graphql`, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });
    const json = (await response.json()) as { data: T; errors?: unknown[] };
    if (json.errors) {
      throw normalizeError({ message: `GitHub GraphQL error: ${JSON.stringify(json.errors)}` }, "GitHub");
    }
    return json.data;
  }

  private async request<T>(
    path: string,
    options: { accept?: string; method?: string; body?: string } = {},
  ): Promise<T> {
    const response = await this.fetchRaw(path, options);
    return response.json() as Promise<T>;
  }

  private async resolveFullName(projectId: number): Promise<string> {
    const cached = this.repoCache.get(projectId);
    if (cached) return cached;

    const project = await this.getProject(projectId);
    return project.fullPath;
  }

  async getCurrentUser(): Promise<User> {
    const data = await this.request<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    }>("/user", {});
    return {
      id: data.id,
      username: data.login,
      name: data.name ?? data.login,
      avatarUrl: data.avatar_url,
      webUrl: data.html_url,
    };
  }

  async listProjects(params: {
    search?: string;
    page?: number;
    perPage?: number;
    membership?: boolean;
  }): Promise<PaginatedResult<Project>> {
    const { search, page = 1, perPage = 50 } = params;

    if (search) {
      const query = encodeURIComponent(
        this.username ? `${search} user:${this.username}` : search,
      );
      const response = await this.fetchRaw(
        `/search/repositories?q=${query}&sort=updated&order=desc&per_page=${perPage}&page=${page}`,
        {},
      );
      const data = await response.json() as {
        items: GitHubRepo[];
        total_count: number;
      };
      const pageInfo = buildPageInfo(
        response.headers.get("link"),
        page,
        perPage,
      );
      return {
        items: data.items.map((r) => this.mapRepo(r)),
        pageInfo: {
          ...pageInfo,
          totalPages: Math.ceil(data.total_count / perPage),
        },
      };
    }

    const response = await this.fetchRaw(
      `/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`,
      {},
    );
    const data = (await response.json()) as GitHubRepo[];
    const pageInfo = buildPageInfo(
      response.headers.get("link"),
      page,
      perPage,
    );

    return {
      items: data.map((r) => this.mapRepo(r)),
      pageInfo,
    };
  }

  async getProject(id: number): Promise<Project> {
    const data = await this.request<GitHubRepo>(`/repositories/${id}`, {});
    const project = this.mapRepo(data);
    this.repoCache.set(id, project.fullPath);
    return project;
  }

  async listRepositoryTree(
    projectId: number,
    params: { path?: string; ref?: string } = {},
  ): Promise<RepositoryTreeEntry[]> {
    const fullName = await this.resolveFullName(projectId);
    const ref = params.ref ?? "HEAD";
    const path = params.path ? `/${params.path}` : "";
    const data = await this.request<GitHubContent[]>(
      `/repos/${fullName}/contents${path}?ref=${encodeURIComponent(ref)}`,
      {},
    );

    return data
      .map((entry) => ({
        id: entry.sha,
        name: entry.name,
        path: entry.path,
        type: (entry.type === "dir" ? "tree" : "blob") as "tree" | "blob",
        mode: entry.type === "dir" ? "040000" : "100644",
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
    const fullName = await this.resolveFullName(projectId);
    const refParam = params.ref
      ? `?ref=${encodeURIComponent(params.ref)}`
      : "";

    try {
      const data = await this.request<{
        path: string;
        content: string;
        encoding: string;
      }>(`/repos/${fullName}/readme${refParam}`, {});

      const content =
        data.encoding === "base64" ? atob(data.content) : data.content;

      return { path: data.path, content };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "kind" in error &&
        (error as { kind: string }).kind === "not_found"
      ) {
        return null;
      }
      throw error;
    }
  }

  async getRepositoryFileRaw(
    projectId: number,
    filePath: string,
    params: { ref?: string } = {},
  ): Promise<string> {
    const fullName = await this.resolveFullName(projectId);
    const refParam = params.ref
      ? `?ref=${encodeURIComponent(params.ref)}`
      : "";
    const response = await this.fetchRaw(
      `/repos/${fullName}/contents/${encodeURIComponent(filePath)}${refParam}`,
      { accept: "application/vnd.github.raw+json" },
    );
    return response.text();
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
    const { state = "open", search, page = 1, perPage = 50 } = params;
    const fullName = await this.resolveFullName(projectId);

    if (search) {
      const stateQuery =
        state === "merged" ? "is:merged" : `is:${state === "open" ? "open" : "closed"}`;
      const query = encodeURIComponent(
        `${search} is:pr ${stateQuery} repo:${fullName}`,
      );
      const response = await this.fetchRaw(
        `/search/issues?q=${query}&sort=updated&order=desc&per_page=${perPage}&page=${page}`,
        {},
      );
      const data = await response.json() as {
        items: GitHubPullRequest[];
        total_count: number;
      };
      const pageInfo = buildPageInfo(
        response.headers.get("link"),
        page,
        perPage,
      );
      return {
        items: data.items.map((pr) => this.mapPullRequest(pr)),
        pageInfo: {
          ...pageInfo,
          totalPages: Math.ceil(data.total_count / perPage),
        },
      };
    }

    if (state === "merged") {
      const ghState = "closed";
      const response = await this.fetchRaw(
        `/repos/${fullName}/pulls?state=${ghState}&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
        {},
      );
      const data = (await response.json()) as GitHubPullRequest[];
      const merged = data.filter((pr) => pr.merged_at !== null);
      const pageInfo = buildPageInfo(
        response.headers.get("link"),
        page,
        perPage,
      );
      return {
        items: merged.map((pr) => this.mapPullRequest(pr)),
        pageInfo,
      };
    }

    const ghState = state === "open" ? "open" : "closed";
    const response = await this.fetchRaw(
      `/repos/${fullName}/pulls?state=${ghState}&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      {},
    );
    const data = (await response.json()) as GitHubPullRequest[];
    const pageInfo = buildPageInfo(
      response.headers.get("link"),
      page,
      perPage,
    );

    const items =
      state === "closed"
        ? data.filter((pr) => pr.merged_at === null)
        : data;

    return {
      items: items.map((pr) => this.mapPullRequest(pr)),
      pageInfo,
    };
  }

  async getChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestDetail> {
    const fullName = await this.resolveFullName(projectId);
    const pr = await this.request<GitHubPullRequest>(
      `/repos/${fullName}/pulls/${iid}`,
      {},
    );
    const result = this.mapPullRequest(pr);
    const headSha = pr.head?.sha;

    // Fetch pipeline and approvals in parallel (best-effort)
    const [pipeline, approvals] = await Promise.all([
      headSha
        ? this.fetchPipelineStatus(fullName, headSha)
        : Promise.resolve(undefined),
      this.fetchApprovals(fullName, iid),
    ]);

    result.pipeline = pipeline;
    result.approvals = approvals;
    return result;
  }

  private async fetchPipelineStatus(
    fullName: string,
    sha: string,
  ): Promise<PipelineStatus | undefined> {
    try {
      const [status, checks] = await Promise.all([
        this.request<GitHubCombinedStatus>(
          `/repos/${fullName}/commits/${sha}/status`,
        ),
        this.request<{ check_runs: GitHubCheckRun[] }>(
          `/repos/${fullName}/commits/${sha}/check-runs?per_page=100`,
        ),
      ]);

      const details: { name: string; state: string }[] = [
        ...status.statuses.map((s) => ({ name: s.context, state: s.state })),
        ...checks.check_runs.map((c) => ({
          name: c.name,
          state: c.conclusion ?? c.status,
        })),
      ];

      const stateMap: Record<string, PipelineStatus["state"]> = {
        success: "success",
        failure: "failed",
        error: "failed",
        pending: "pending",
      };

      const overallState: PipelineStatus["state"] =
        details.some((d) => d.state === "failure" || d.state === "error")
          ? "failed"
          : details.some((d) => d.state === "pending" || d.state === "in_progress")
            ? "running"
            : details.every((d) => d.state === "success" || d.state === "neutral" || d.state === "skipped")
              ? "success"
              : stateMap[status.state] ?? "unknown";

      return { state: overallState, url: null, details };
    } catch {
      return undefined;
    }
  }

  private async fetchApprovals(
    fullName: string,
    iid: number,
  ): Promise<ApprovalInfo | undefined> {
    try {
      const reviews = await this.request<GitHubReview[]>(
        `/repos/${fullName}/pulls/${iid}/reviews`,
      );

      // Get latest review per user
      const latestByUser = new Map<string, GitHubReview>();
      for (const review of reviews) {
        if (!review.user?.login) continue;
        const existing = latestByUser.get(review.user.login);
        if (!existing || (review.submitted_at ?? "") > (existing.submitted_at ?? "")) {
          latestByUser.set(review.user.login, review);
        }
      }

      const approvedBy: string[] = [];
      let currentUserApproved = false;
      for (const [login, review] of latestByUser) {
        if (review.state === "APPROVED") {
          approvedBy.push(login);
          if (login === this.username) currentUserApproved = true;
        }
      }

      return {
        approved: approvedBy.length > 0,
        approvalsGiven: approvedBy.length,
        approvalsRequired: null,
        approvedBy,
        currentUserApproved,
      };
    } catch {
      return undefined;
    }
  }

  async getChangeRequestDiff(
    projectId: number,
    iid: number,
  ): Promise<DiffResult> {
    const fullName = await this.resolveFullName(projectId);
    const response = await this.fetchRaw(
      `/repos/${fullName}/pulls/${iid}`,
      { accept: "application/vnd.github.diff" },
    );
    const diffText = await response.text();
    return { changes: parseUnifiedDiff(diffText) };
  }

  async listChangeRequestNotes(
    projectId: number,
    iid: number,
    _includeSystem = false,
  ): Promise<ChangeRequestNote[]> {
    const fullName = await this.resolveFullName(projectId);
    const data = await this.request<GitHubComment[]>(
      `/repos/${fullName}/issues/${iid}/comments?sort=created&direction=desc&per_page=100`,
      {},
    );

    return data.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.user?.login ?? null,
      createdAt: comment.created_at,
      system: false,
      isOwn: comment.user?.login === this.username,
    }));
  }

  async createChangeRequestNote(
    projectId: number,
    iid: number,
    body: string,
  ): Promise<ChangeRequestNote> {
    const fullName = await this.resolveFullName(projectId);
    const comment = await this.request<GitHubComment>(
      `/repos/${fullName}/issues/${iid}/comments`,
      { method: "POST", body: JSON.stringify({ body }) },
    );

    return {
      id: comment.id,
      body: comment.body,
      authorName: comment.user?.login ?? null,
      createdAt: comment.created_at,
      system: false,
      isOwn: true,
    };
  }

  async listInlineComments(
    projectId: number,
    iid: number,
  ): Promise<InlineComment[]> {
    const fullName = await this.resolveFullName(projectId);
    const [owner, repo] = fullName.split("/");

    // Fetch comments via REST
    const data = await this.request<GitHubReviewComment[]>(
      `/repos/${fullName}/pulls/${iid}/comments?sort=created&direction=asc&per_page=100`,
      {},
    );

    // Fetch thread resolution + node IDs via GraphQL
    const threadInfo = new Map<number, { resolved: boolean; nodeId: string }>();
    try {
      const gql = await this.graphql<{
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: {
                id: string;
                isResolved: boolean;
                comments: { nodes: { databaseId: number }[] };
              }[];
            };
          };
        };
      }>(
        `query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes { databaseId }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo, number: iid },
      );

      for (const thread of gql.repository.pullRequest.reviewThreads.nodes) {
        for (const comment of thread.comments.nodes) {
          threadInfo.set(comment.databaseId, {
            resolved: thread.isResolved,
            nodeId: thread.id,
          });
        }
      }
    } catch {
      // GraphQL might not be available
    }

    const mapComment = (c: GitHubReviewComment): InlineComment => {
      const info = threadInfo.get(c.id);
      return {
        id: c.id,
        body: c.body,
        authorName: c.user?.login ?? null,
        createdAt: c.created_at,
        resolved: info?.resolved ?? false,
        isOwn: c.user?.login === this.username,
        threadId: info?.nodeId,
        position: {
          path: c.path,
          oldPath: c.path,
          newLine: c.side === "RIGHT" ? (c.line ?? undefined) : undefined,
          oldLine: c.side === "LEFT" ? (c.line ?? undefined) : undefined,
          startNewLine:
            c.side === "RIGHT" && c.start_line ? c.start_line : undefined,
          startOldLine:
            c.side === "LEFT" && c.start_line ? c.start_line : undefined,
        },
        replies: [],
      };
    };

    // Group into threads: root comments have no in_reply_to_id
    const rootComments: InlineComment[] = [];
    const replyMap = new Map<number, InlineComment[]>();

    for (const c of data) {
      const mapped = mapComment(c);
      if (c.in_reply_to_id) {
        const replies = replyMap.get(c.in_reply_to_id) ?? [];
        replies.push(mapped);
        replyMap.set(c.in_reply_to_id, replies);
      } else {
        rootComments.push(mapped);
      }
    }

    // Attach replies to their root comments
    for (const root of rootComments) {
      root.replies = replyMap.get(root.id) ?? [];
      // Propagate threadId from root to replies
      for (const reply of root.replies) {
        if (!reply.threadId && root.threadId) {
          reply.threadId = root.threadId;
        }
      }
    }

    return rootComments;
  }

  async submitReview(
    projectId: number,
    iid: number,
    params: {
      event: ReviewEvent;
      body?: string;
      comments: DraftComment[];
    },
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    const pr = await this.request<GitHubPullRequest>(
      `/repos/${fullName}/pulls/${iid}`,
      {},
    );

    const eventMap: Record<ReviewEvent, string> = {
      approve: "APPROVE",
      request_changes: "REQUEST_CHANGES",
      comment: "COMMENT",
    };

    const comments = params.comments.map((draft) => {
      const comment: Record<string, unknown> = {
        path: draft.position.path,
        body: draft.body,
      };

      if (draft.position.newLine) {
        comment.line = draft.position.newLine;
        comment.side = "RIGHT";
        if (draft.position.startNewLine) {
          comment.start_line = draft.position.startNewLine;
          comment.start_side = "RIGHT";
        }
      } else if (draft.position.oldLine) {
        comment.line = draft.position.oldLine;
        comment.side = "LEFT";
        if (draft.position.startOldLine) {
          comment.start_line = draft.position.startOldLine;
          comment.start_side = "LEFT";
        }
      }

      return comment;
    });

    await this.fetchRaw(`/repos/${fullName}/pulls/${iid}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        commit_id: pr.head?.sha,
        event: eventMap[params.event],
        body: params.body ?? "",
        comments,
      }),
    });
  }

  async resolveInlineComment(
    _projectId: number,
    _iid: number,
    threadId: string,
    resolved: boolean,
  ): Promise<void> {
    const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
    await this.graphql(
      `mutation($threadId: ID!) { ${mutation}(input: { threadId: $threadId }) { clientMutationId } }`,
      { threadId },
    );
  }

  async replyToComment(
    projectId: number,
    iid: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    await this.fetchRaw(
      `/repos/${fullName}/pulls/${iid}/comments/${commentId}/replies`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
  }

  async editComment(
    projectId: number,
    _iid: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    await this.fetchRaw(
      `/repos/${fullName}/pulls/comments/${commentId}`,
      { method: "PATCH", body: JSON.stringify({ body }) },
    );
  }

  async deleteComment(
    projectId: number,
    _iid: number,
    commentId: number,
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    await this.fetchRaw(
      `/repos/${fullName}/pulls/comments/${commentId}`,
      { method: "DELETE" },
    );
  }

  async listChangeRequestCommits(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestCommit[]> {
    const fullName = await this.resolveFullName(projectId);
    const data = await this.request<GitHubCommit[]>(
      `/repos/${fullName}/pulls/${iid}/commits?per_page=100`,
    );

    return data.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      title: c.commit.message.split("\n")[0] ?? "",
      message: c.commit.message,
      authorName: c.commit.author?.name ?? null,
      createdAt: c.commit.author?.date ?? "",
    }));
  }

  async approveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    await this.fetchRaw(`/repos/${fullName}/pulls/${iid}/reviews`, {
      method: "POST",
      body: JSON.stringify({ event: "APPROVE", body: "" }),
    });
  }

  async unapproveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void> {
    const fullName = await this.resolveFullName(projectId);
    const reviews = await this.request<GitHubReview[]>(
      `/repos/${fullName}/pulls/${iid}/reviews`,
    );

    const myApproval = [...reviews]
      .reverse()
      .find((r) => r.user?.login === this.username && r.state === "APPROVED");

    if (!myApproval) throw new Error("No approval to remove");

    await this.fetchRaw(
      `/repos/${fullName}/pulls/${iid}/reviews/${myApproval.id}/dismissals`,
      { method: "PUT", body: JSON.stringify({ message: "Approval removed" }) },
    );
  }

  async getNotifications(
    options?: { since?: string },
  ): Promise<{ notifications: Notification[]; pollInterval: number }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
    };
    if (this.notifLastModified) {
      headers["If-Modified-Since"] = this.notifLastModified;
    }

    const params = new URLSearchParams({ participating: "true", per_page: "50" });
    if (options?.since) params.set("since", options.since);

    const response = await fetch(`${BASE_URL}/notifications?${params}`, {
      headers,
    });

    const pollInterval = Number(response.headers.get("X-Poll-Interval")) || 60;

    if (response.status === 304) {
      return { notifications: [], pollInterval };
    }

    if (!response.ok) {
      return { notifications: [], pollInterval };
    }

    const lastMod = response.headers.get("Last-Modified");
    if (lastMod) this.notifLastModified = lastMod;

    const data = (await response.json()) as {
      id: string;
      reason: string;
      subject: { title: string; url: string | null; type: string };
      repository: { full_name: string };
      updated_at: string;
    }[];

    return {
      pollInterval,
      notifications: data.map((n) => ({
        id: n.id,
        reason: n.reason,
        subject: n.subject.title,
        updatedAt: n.updated_at,
        repository: n.repository.full_name,
        url: n.subject.url,
      })),
    };
  }

  async validateToken(): Promise<User> {
    return this.getCurrentUser();
  }

  private mapRepo(r: GitHubRepo): Project {
    this.repoCache.set(r.id, r.full_name);
    return {
      id: r.id,
      name: r.name,
      path: r.name,
      fullPath: r.full_name,
      fullName: r.full_name,
      description: r.description ?? null,
      visibility: r.private ? "private" : "public",
      defaultBranch: r.default_branch ?? null,
      webUrl: r.html_url,
      lastActivityAt: r.updated_at ?? r.pushed_at ?? r.created_at,
      openIssuesCount: r.open_issues_count ?? 0,
      starCount: r.stargazers_count ?? 0,
    };
  }

  private mapPullRequest(pr: GitHubPullRequest): ChangeRequestDetail {
    let state: "open" | "closed" | "merged";
    if (pr.merged_at) {
      state = "merged";
    } else if (pr.state === "open") {
      state = "open";
    } else {
      state = "closed";
    }

    const diffRefs: DiffRefs | undefined =
      pr.head?.sha && pr.base?.sha
        ? {
            baseSha: pr.base.sha,
            headSha: pr.head.sha,
            startSha: pr.base.sha,
          }
        : undefined;

    return {
      id: pr.id,
      iid: pr.number,
      title: pr.title,
      description: pr.body ?? null,
      state,
      sourceBranch: pr.head?.ref ?? "",
      targetBranch: pr.base?.ref ?? "",
      authorName: pr.user?.login ?? null,
      webUrl: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      diffRefs,
      metadata: {
        draft: pr.draft ?? false,
        labels: (pr.labels ?? []).map((l) => ({ name: l.name, color: l.color ? `#${l.color}` : null })),
        milestone: pr.milestone?.title ?? null,
        assignees: (pr.assignees ?? []).map((a) => a.login),
        reviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
        additions: pr.additions ?? null,
        deletions: pr.deletions ?? null,
        changedFiles: pr.changed_files ?? null,
        mergeable: pr.mergeable ?? null,
        mergeableState: pr.mergeable_state ?? null,
      },
    };
  }
}

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string | null;
  html_url: string;
  updated_at: string | null;
  pushed_at: string | null;
  created_at: string;
  open_issues_count: number;
  stargazers_count: number;
};

type GitHubContent = {
  sha: string;
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  head: { ref: string; sha: string } | null;
  base: { ref: string; sha: string } | null;
  user: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels?: { name: string; color: string }[];
  milestone?: { title: string } | null;
  assignees?: { login: string }[];
  requested_reviewers?: { login: string }[];
  additions?: number;
  deletions?: number;
  changed_files?: number;
  mergeable?: boolean | null;
  mergeable_state?: string;
};

type GitHubCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
};

type GitHubReview = {
  id: number;
  user: { login: string } | null;
  state: string;
  submitted_at: string | null;
};

type GitHubCheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
};

type GitHubCombinedStatus = {
  state: string;
  statuses: { context: string; state: string }[];
};

type GitHubComment = {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
};

type GitHubReviewComment = {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  start_line: number | null;
  original_start_line: number | null;
  side: "LEFT" | "RIGHT";
  start_side: "LEFT" | "RIGHT" | null;
  user: { login: string } | null;
  created_at: string;
  in_reply_to_id?: number;
};
