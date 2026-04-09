import type { Instance } from "../../config/schema";
import { getRateLimitError, normalizeError } from "../errors";
import type { Provider } from "../provider";
import type {
  ChangeRequest,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffChange,
  DiffResult,
  PageInfo,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
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
    return this.mapPullRequest(pr);
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

  private mapPullRequest(pr: GitHubPullRequest): ChangeRequest {
    let state: "open" | "closed" | "merged";
    if (pr.merged_at) {
      state = "merged";
    } else if (pr.state === "open") {
      state = "open";
    } else {
      state = "closed";
    }

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
  merged_at: string | null;
  head: { ref: string } | null;
  base: { ref: string } | null;
  user: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
};

type GitHubComment = {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
};
