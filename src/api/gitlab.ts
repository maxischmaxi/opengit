import type {
  ExpandedMergeRequestSchema,
  ExpandedUserSchema,
  MergeRequestChangesSchema,
  MergeRequestNoteSchema,
  MergeRequestSchema,
  OffsetPagination,
  ProjectSchema,
  RepositoryTreeSchema,
} from "@gitbeaker/rest";

import { getApi } from "./client";
import { getRateLimitError, normalizeError } from "./errors";

export type PageInfo = {
  current: number;
  previous: number | null;
  next: number | null;
  totalPages: number;
  perPage: number;
};

export type PaginatedResult<T> = {
  items: T[];
  pageInfo: PageInfo;
};

export type MergeRequestDiffChange = {
  oldPath: string;
  newPath: string;
  diffText: string;
  renamed: boolean;
  deleted: boolean;
  newFile: boolean;
};

export type MergeRequestDiffResult = {
  changes: MergeRequestDiffChange[];
};

export type RepositoryTreeEntry = {
  id: string;
  name: string;
  path: string;
  type: "tree" | "blob";
  mode: string;
};

export type ProjectReadme = {
  path: string;
  content: string;
};

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
    throw normalizeError(error);
  }
};

export const getCurrentUser = async () =>
  withApi<ExpandedUserSchema>(() => getApi().Users.showCurrentUser());

export const listProjects = async ({
  search,
  page,
  perPage = 50,
  membership = true,
}: {
  search?: string;
  page?: number;
  perPage?: number;
  membership?: boolean;
}): Promise<PaginatedResult<ProjectSchema>> => {
  const response = await withApi(() =>
    getApi().Projects.all({
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
    items: response.data,
    pageInfo: normalizePageInfo(response.paginationInfo),
  };
};

export const getProject = async (id: number) =>
  withApi<ProjectSchema>(() => getApi().Projects.show(id));

export const listRepositoryTree = async (
  projectId: number,
  {
    path,
    ref,
  }: {
    path?: string;
    ref?: string;
  } = {},
): Promise<RepositoryTreeEntry[]> => {
  const response = await withApi<RepositoryTreeSchema[]>(() =>
    getApi().Repositories.allRepositoryTrees(projectId, {
      path,
      ref,
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
};

export const getProjectReadme = async (
  projectId: number,
  { ref }: { ref?: string } = {},
): Promise<ProjectReadme | null> => {
  const repositoryTree = await listRepositoryTree(projectId, { ref });
  const readmeEntry = repositoryTree.find(
    (entry) =>
      entry.type === "blob" && /^readme(?:\.[a-z0-9._-]+)?$/i.test(entry.name),
  );

  if (!readmeEntry) {
    return null;
  }

  const rawContent = await withApi<string | Blob>(() =>
    getApi().RepositoryFiles.showRaw(
      projectId,
      readmeEntry.path,
      ref ?? "HEAD",
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
};

export const getRepositoryFileRaw = async (
  projectId: number,
  filePath: string,
  { ref }: { ref?: string } = {},
) => {
  const rawContent = await withApi<string | Blob>(() =>
    getApi().RepositoryFiles.showRaw(projectId, filePath, ref ?? "HEAD"),
  );

  return typeof rawContent === "string"
    ? rawContent
    : rawContent instanceof Blob
      ? await rawContent.text()
      : String(rawContent);
};

export const listMergeRequests = async (
  projectId: number,
  {
    state = "opened",
    search,
    page,
    perPage = 50,
  }: {
    state?: "opened" | "closed" | "merged";
    search?: string;
    page?: number;
    perPage?: number;
  },
): Promise<PaginatedResult<MergeRequestSchema>> => {
  const response = await withApi(() =>
    getApi().MergeRequests.all({
      projectId,
      state,
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
    items: response.data,
    pageInfo: normalizePageInfo(response.paginationInfo),
  };
};

export const getMergeRequest = async (projectId: number, iid: number) =>
  withApi<ExpandedMergeRequestSchema>(() =>
    getApi().MergeRequests.show(projectId, iid),
  );

export const getMergeRequestDiff = async (
  projectId: number,
  iid: number,
): Promise<MergeRequestDiffResult> => {
  const response = await withApi<MergeRequestChangesSchema>(() =>
    getApi().MergeRequests.showChanges(projectId, iid),
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
};

export const listMergeRequestNotes = async (
  projectId: number,
  iid: number,
  includeSystem = false,
) => {
  const response = await withApi<MergeRequestNoteSchema[]>(() =>
    getApi().MergeRequestNotes.all(projectId, iid, {
      sort: "desc",
      orderBy: "updated_at",
    }),
  );

  return includeSystem ? response : response.filter((note) => !note.system);
};

export const createMergeRequestNote = async (
  projectId: number,
  iid: number,
  body: string,
) =>
  withApi<MergeRequestNoteSchema>(() =>
    getApi().MergeRequestNotes.create(projectId, iid, body),
  );
