import { create } from "zustand";
import { Project } from "../types/project";

type PortalUiState = {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
};

export const usePortalUiStore = create<PortalUiState>((set) => ({
  selectedProject: null,
  setSelectedProject: (project) => set({ selectedProject: project }),
}));
