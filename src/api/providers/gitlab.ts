import { Gitlab } from "@gitbeaker/rest";
import type { OffsetPagination } from "@gitbeaker/rest";

import type { Instance } from "../../config/schema";
import { getRateLimitError, normalizeError } from "../errors";
import type { Provider } from "../provider";
import type {
  ChangeRequest,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffResult,
  PageInfo,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
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

  constructor(instance: Instance) {
    this.api = new Gitlab({ host: instance.host, token: instance.token });
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
    return this.mapChangeRequest(mr);
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
    const response = await withApi(() =>
      this.api.MergeRequestNotes.all(projectId, iid, {
        sort: "desc",
        orderBy: "updated_at",
      }),
    );

    const notes = response.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author?.name ?? null,
      createdAt: note.created_at,
      system: note.system,
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
    };
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
  private mapChangeRequest(mr: any): ChangeRequest {
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
    };
  }
}
