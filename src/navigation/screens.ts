export type Screen =
  | { kind: "wizard"; instanceName?: string }
  | { kind: "instancePicker" }
  | { kind: "projects" }
  | { kind: "projectDetail"; projectId: number }
  | { kind: "mrList"; projectId: number }
  | {
      kind: "mrDetail";
      projectId: number;
      iid: number;
      tab: "overview" | "commits" | "diff";
    }
  | { kind: "commentCompose"; projectId: number; iid: number };
