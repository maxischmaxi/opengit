import type { SelectRenderable } from "@opentui/core";
import type { RefObject } from "react";

import { getSelectThemeProps, useTheme } from "../app/theme";

export type ProjectSectionId =
  | "overview"
  | "mergeRequests"
  | "pipelines"
  | "repository"
  | "packageRegistry"
  | "settings";

export type ProjectSection = {
  id: ProjectSectionId;
  label: string;
  description: string;
};

type ProjectSidebarProps = {
  sections: ProjectSection[];
  selectedIndex: number;
  focused: boolean;
  sidebarRef: RefObject<SelectRenderable | null>;
  onChange: (index: number) => void;
};

export const ProjectSidebar = ({
  sections,
  selectedIndex,
  focused,
  sidebarRef,
  onChange,
}: ProjectSidebarProps) => {
  const theme = useTheme();

  const backgroundColor = focused
    ? theme.colors.surfaceAlt
    : theme.colors.surface;

  return (
    <box
      width={28}
      backgroundColor={backgroundColor}
      padding={1}
      flexDirection="column"
      gap={1}
    >
      <text fg={theme.colors.muted}>Project</text>
      <select
        ref={sidebarRef}
        focused={focused}
        flexGrow={1}
        selectedIndex={selectedIndex}
        options={sections.map((section) => ({
          name: section.label,
          description: section.description,
          value: section.id,
        }))}
        onChange={onChange}
        onSelect={onChange}
        {...getSelectThemeProps(theme)}
        backgroundColor={backgroundColor}
        focusedBackgroundColor={backgroundColor}
      />
    </box>
  );
};
