"use client";

import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  LoadingOverlay,
  Menu,
  Modal,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { ComponentPropsWithoutRef, Fragment, forwardRef, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppFrame } from "../../../../src/components/app-frame";
import { ProfileMenu } from "../../../../src/components/profile-menu";
import { ApiError, apiFetch } from "../../../../src/lib/api-client";
import { toastError, toastSuccess } from "../../../../src/lib/toast";
import { Project } from "../../../../src/types/project";

type CurrentUser = {
  sub: string;
  email: string;
  role: string;
};

type PortalUser = {
  id: string;
  email: string;
  displayName: string;
};

type ProjectMember = {
  id: string;
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  globalRole: string | null;
};

type ProjectOverview = {
  project: Project;
  members: ProjectMember[];
};

type GitRepo = {
  id: string;
  projectId: string;
  repoName: string;
  namespacePath: string;
  cloneUrl: string | null;
  webUrl: string | null;
  createdAt: string;
};

type WorkspaceSession = {
  id: string;
  repoId: string;
  runtime: string;
  repoName: string;
  endpointUrl: string;
  status: string;
  createdAt: string;
};

type WorkspaceEndpointHealth = {
  ready: boolean;
  statusCode: number | null;
  checkedUrl: string;
};

type WorkspaceModalState = {
  repo: GitRepo;
  workspace?: WorkspaceSession;
} | null;

type AgentDeployment = {
  id: string;
  repoId: string;
  agentName: string;
  description: string;
  dockerfilePath: string;
  litellmModel: string;
  ecrRepository: string;
  imageUrl: string;
  endpointUrl: string;
  status: string;
  lastMessage: string | null;
  createdAt: string;
};

type McpDeployment = {
  id: string;
  repoId: string;
  mcpName: string;
  description: string;
  dockerfilePath: string;
  useLlm: string;
  litellmModel: string;
  ecrRepository: string;
  imageUrl: string;
  endpointUrl: string;
  status: string;
  lastMessage: string | null;
  createdAt: string;
};

type LiteLlmAccessModel = {
  modelName: string;
  isDefault: boolean;
  source?: string;
};

type MyLiteLlmAccess = {
  litellmBaseUrl: string;
  personalKey: string | null;
  availableModels: LiteLlmAccessModel[];
};

type McpServerCard = {
  name: string;
  description: string;
  endpointUrl: string;
  protocolVersion: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
};

type CatalogModel = {
  id: string;
  modelName: string;
  isDefault: boolean;
};

type PlaygroundMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
};

type McpInspectorConnectionType = "streamable-http" | "sse";

type ExternalAgentCard = {
  name?: string;
  description?: string;
  url?: string;
  version?: string;
  [key: string]: unknown;
};

type ProjectSection = "Info" | "Repo" | "Agent" | "MCP" | "MCP Inspector" | "Playground";

const menuItems: Array<{ label: ProjectSection; slug: "" | "info" | "repo" | "agent" | "mcp" | "mcp-inspector" | "playground" }> = [
  { label: "Info", slug: "info" },
  { label: "Repo", slug: "repo" },
  { label: "Agent", slug: "agent" },
  { label: "MCP", slug: "mcp" },
  { label: "MCP Inspector", slug: "mcp-inspector" },
  { label: "Playground", slug: "playground" },
];
const runtimeOptions = [
  { value: "NODE22", label: "NODE22" },
  { value: "NODE23", label: "NODE23" },
  { value: "NODE24", label: "NODE24" },
  { value: "PYTHON3.8", label: "PYTHON3.8" },
];
const workspaceHealthcheckIntervalMs = 2000;
const workspaceHealthcheckMaxAttempts = 30;

type SectionMenuButtonProps = ComponentPropsWithoutRef<typeof ActionIcon> & {
  label: string;
};

function renderInlineMarkdown(text: string): ReactNode[] {
  const segments = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  return segments.map((segment, index) => {
    const match = /^\*\*(.*?)\*\*$/.exec(segment);
    if (match) {
      return <strong key={`${segment}-${index}`}>{match[1]}</strong>;
    }
    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  });
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && /^\|?[\s:|-]+\|?$/.test(trimmed);
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownContent(content: string): ReactNode {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push(<Divider key={`divider-${key++}`} my="xs" />);
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const order = Math.min(6, headingMatch[1].length + 1) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push(
        <Title key={`heading-${key++}`} order={order}>
          {renderInlineMarkdown(headingMatch[2])}
        </Title>,
      );
      index += 1;
      continue;
    }

    const nextLine = lines[index + 1]?.trim() ?? "";
    if (trimmed.includes("|") && isMarkdownTableSeparator(nextLine)) {
      const headerCells = splitMarkdownTableRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine || !rowLine.includes("|")) {
          break;
        }
        rows.push(splitMarkdownTableRow(rowLine));
        index += 1;
      }
      blocks.push(
        <Table.ScrollContainer key={`table-${key++}`} minWidth={420}>
          <Table withTableBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {headerCells.map((cell, cellIndex) => (
                  <Table.Th key={`header-${cellIndex}`}>{renderInlineMarkdown(cell)}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row, rowIndex) => (
                <Table.Tr key={`row-${rowIndex}`}>
                  {headerCells.map((_, cellIndex) => (
                    <Table.Td key={`cell-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(row[cellIndex] ?? "")}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <Stack key={`list-${key++}`} gap={4}>
          {items.map((item, itemIndex) => (
            <Text key={`item-${itemIndex}`} size="sm">
              {"- "}
              {renderInlineMarkdown(item)}
            </Text>
          ))}
        </Stack>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      const candidateNext = lines[index + 1]?.trim() ?? "";
      if (!candidate) {
        break;
      }
      if (/^(#{1,6})\s+/.test(candidate) || /^---+$/.test(candidate)) {
        break;
      }
      if (/^[-*]\s+/.test(candidate)) {
        break;
      }
      if (candidate.includes("|") && isMarkdownTableSeparator(candidateNext)) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }
    blocks.push(
      <Text key={`paragraph-${key++}`} size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {renderInlineMarkdown(paragraphLines.join("\n"))}
      </Text>,
    );
  }

  return <Stack gap="sm">{blocks}</Stack>;
}

const SectionMenuButton = forwardRef<HTMLButtonElement, SectionMenuButtonProps>(function SectionMenuButton(
  { label, ...props },
  ref,
) {
  return (
    <ActionIcon ref={ref} variant="default" color="gray" radius="xl" size="lg" aria-label={label} {...props}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="3.5" r="1.5" fill="currentColor" />
        <circle cx="9" cy="9" r="1.5" fill="currentColor" />
        <circle cx="9" cy="14.5" r="1.5" fill="currentColor" />
      </svg>
    </ActionIcon>
  );
});

function getSectionFromPathname(pathname: string): ProjectSection {
  if (pathname.endsWith("/repo")) {
    return "Repo";
  }
  if (pathname.endsWith("/agent")) {
    return "Agent";
  }
  if (pathname.endsWith("/mcp")) {
    return "MCP";
  }
  if (pathname.endsWith("/mcp-inspector")) {
    return "MCP Inspector";
  }
  if (pathname.endsWith("/playground")) {
    return "Playground";
  }
  return "Info";
}

function getDeploymentMessageColor(status: string): string {
  if (status === "failed") {
    return "red";
  }
  if (status === "pending_approval") {
    return "yellow";
  }
  return "dimmed";
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params?.projectId ?? "";
  const activeMenu = getSectionFromPathname(pathname);

  const [authChecking, setAuthChecking] = useState(true);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [stoppingWorkspaceId, setStoppingWorkspaceId] = useState<string | null>(null);
  const [restartingWorkspaceId, setRestartingWorkspaceId] = useState<string | null>(null);
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(null);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState<WorkspaceSession | null>(null);
  const [updatingMembers, setUpdatingMembers] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<PortalUser[]>([]);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSession[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [workspaceRuntime, setWorkspaceRuntime] = useState<string | null>("NODE22");
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceModalState>(null);
  const [agents, setAgents] = useState<AgentDeployment[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentRepoId, setAgentRepoId] = useState<string | null>(null);
  const [agentDockerfilePath, setAgentDockerfilePath] = useState("./Dockerfile");
  const [agentModelName, setAgentModelName] = useState<string | null>(null);
  const [deployingAgent, setDeployingAgent] = useState(false);
  const [stoppingAgentId, setStoppingAgentId] = useState<string | null>(null);
  const [restartingAgentId, setRestartingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [agentStatusFilter, setAgentStatusFilter] = useState<string | null>("all");
  const [agentRepoFilter, setAgentRepoFilter] = useState<string | null>("all");
  const [logsTarget, setLogsTarget] = useState<AgentDeployment | null>(null);
  const [agentLogs, setAgentLogs] = useState("");
  const [loadingAgentLogs, setLoadingAgentLogs] = useState(false);
  const agentLogsViewportRef = useRef<HTMLDivElement | null>(null);
  const [mcps, setMcps] = useState<McpDeployment[]>([]);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpRepoId, setMcpRepoId] = useState<string | null>(null);
  const [mcpDockerfilePath, setMcpDockerfilePath] = useState("./Dockerfile");
  const [mcpUseLlm, setMcpUseLlm] = useState(false);
  const [mcpModelName, setMcpModelName] = useState<string | null>(null);
  const [deployingMcp, setDeployingMcp] = useState(false);
  const [stoppingMcpId, setStoppingMcpId] = useState<string | null>(null);
  const [restartingMcpId, setRestartingMcpId] = useState<string | null>(null);
  const [deletingMcpId, setDeletingMcpId] = useState<string | null>(null);
  const [mcpSearchQuery, setMcpSearchQuery] = useState("");
  const [mcpStatusFilter, setMcpStatusFilter] = useState<string | null>("all");
  const [mcpRepoFilter, setMcpRepoFilter] = useState<string | null>("all");
  const [mcpLogsTarget, setMcpLogsTarget] = useState<McpDeployment | null>(null);
  const [mcpLogs, setMcpLogs] = useState("");
  const [loadingMcpLogs, setLoadingMcpLogs] = useState(false);
  const mcpLogsViewportRef = useRef<HTMLDivElement | null>(null);
  const [playgroundMode, setPlaygroundMode] = useState<"deployed" | "dev">("deployed");
  const [playgroundTargetType, setPlaygroundTargetType] = useState<"agent" | "mcp">("agent");
  const [selectedPlaygroundAgentId, setSelectedPlaygroundAgentId] = useState<string | null>(null);
  const [selectedPlaygroundMcpId, setSelectedPlaygroundMcpId] = useState<string | null>(null);
  const [playgroundInput, setPlaygroundInput] = useState("");
  const [playgroundMessages, setPlaygroundMessages] = useState<Record<string, PlaygroundMessage[]>>({});
  const [mcpPlaygroundMessages, setMcpPlaygroundMessages] = useState<Record<string, PlaygroundMessage[]>>({});
  const [playgroundContextIds, setPlaygroundContextIds] = useState<Record<string, string | null>>({});
  const [sendingPlaygroundMessage, setSendingPlaygroundMessage] = useState(false);
  const [devA2AUrl, setDevA2AUrl] = useState("");
  const [connectingDevAgent, setConnectingDevAgent] = useState(false);
  const [devAgentCard, setDevAgentCard] = useState<ExternalAgentCard | null>(null);
  const [devAgentCardUrl, setDevAgentCardUrl] = useState("");
  const [devPlaygroundMessages, setDevPlaygroundMessages] = useState<PlaygroundMessage[]>([]);
  const [devPlaygroundContextId, setDevPlaygroundContextId] = useState<string | null>(null);
  const [selectedMcpPlaygroundModel, setSelectedMcpPlaygroundModel] = useState<string | null>(null);
  const [selectedPlaygroundMcpCard, setSelectedPlaygroundMcpCard] = useState<McpServerCard | null>(null);
  const [loadingSelectedMcpCard, setLoadingSelectedMcpCard] = useState(false);
  const devPlaygroundViewportRef = useRef<HTMLDivElement | null>(null);
  const deployedPlaygroundViewportRef = useRef<HTMLDivElement | null>(null);
  const [inspectorConnectionType, setInspectorConnectionType] = useState<McpInspectorConnectionType>("streamable-http");
  const [inspectorUrl, setInspectorUrl] = useState("");
  const [connectingInspector, setConnectingInspector] = useState(false);
  const [inspectorCard, setInspectorCard] = useState<McpServerCard | null>(null);
  const [inspectorConnectedUrl, setInspectorConnectedUrl] = useState("");
  const [selectedInspectorToolName, setSelectedInspectorToolName] = useState<string | null>(null);
  const [inspectorToolArgs, setInspectorToolArgs] = useState("{}");
  const [callingInspectorTool, setCallingInspectorTool] = useState(false);
  const [inspectorToolResult, setInspectorToolResult] = useState("");
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [llmAccess, setLlmAccess] = useState<MyLiteLlmAccess | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>("member");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberEditMode, setMemberEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingProject, setSavingProject] = useState(false);

  const repoWorkspaces = useMemo(() => {
    const map = new Map<string, WorkspaceSession>();
    for (const workspace of workspaces) {
      map.set(workspace.repoId, workspace);
    }
    return map;
  }, [workspaces]);

  const isManager = useMemo(() => {
    if (!currentUser) {
      return false;
    }
    return members.some((member) => member.userId === currentUser.sub && member.role === "manager");
  }, [currentUser, members]);

  const managerCount = useMemo(() => members.filter((member) => member.role === "manager").length, [members]);

  const runningWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.status === "running"),
    [workspaces],
  );

  const runningWorkspaceCpu = runningWorkspaces.length;
  const runningWorkspaceMemoryGi = runningWorkspaces.length * 2;
  const repoOptions = useMemo(
    () => repos.map((repo) => ({ value: repo.id, label: repo.repoName })),
    [repos],
  );
  const runningAgents = useMemo(
    () => agents.filter((agent) => agent.status === "running"),
    [agents],
  );
  const runningMcps = useMemo(
    () => mcps.filter((mcp) => mcp.status === "running"),
    [mcps],
  );
  const activeServingAgents = useMemo(
    () => agents.filter((agent) => ["running", "deploying"].includes(agent.status)),
    [agents],
  );
  const activeServingMcps = useMemo(
    () => mcps.filter((mcp) => ["running", "deploying"].includes(mcp.status)),
    [mcps],
  );
  const maxServingAgents = 2;
  const hasServingCapacity = activeServingAgents.length < maxServingAgents;
  const maxServingMcps = 2;
  const hasMcpServingCapacity = activeServingMcps.length < maxServingMcps;
  const agentModelOptions = useMemo(
    () =>
      catalogModels.map((model) => ({
        value: model.modelName,
        label: model.isDefault ? `${model.modelName} (Default)` : model.modelName,
      })),
    [catalogModels],
  );
  const selectedAgentModel = useMemo(
    () => catalogModels.find((model) => model.modelName === agentModelName) ?? null,
    [agentModelName, catalogModels],
  );
  const selectedMcpModel = useMemo(
    () => catalogModels.find((model) => model.modelName === mcpModelName) ?? null,
    [catalogModels, mcpModelName],
  );
  const agentStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(agents.map((agent) => agent.status))).map((status) => ({
        value: status,
        label: status,
      })),
    ],
    [agents],
  );
  const agentRepoFilterOptions = useMemo(
    () => [{ value: "all", label: "All repositories" }, ...repoOptions],
    [repoOptions],
  );
  const filteredAgents = useMemo(() => {
    const normalizedQuery = agentSearchQuery.trim().toLowerCase();

    return agents.filter((agent) => {
      const repoName = repos.find((repo) => repo.id === agent.repoId)?.repoName ?? "";
      const matchesQuery =
        !normalizedQuery ||
        agent.agentName.toLowerCase().includes(normalizedQuery) ||
        agent.description.toLowerCase().includes(normalizedQuery);
      const matchesStatus = agentStatusFilter === "all" || agent.status === agentStatusFilter;
      const matchesRepo = agentRepoFilter === "all" || agent.repoId === agentRepoFilter;

      return matchesQuery && matchesStatus && matchesRepo && (normalizedQuery ? repoName.toLowerCase().includes(normalizedQuery) || matchesQuery : true);
    });
  }, [agentRepoFilter, agentSearchQuery, agentStatusFilter, agents, repos]);
  const mcpStatusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...Array.from(new Set(mcps.map((mcp) => mcp.status))).map((status) => ({
        value: status,
        label: status,
      })),
    ],
    [mcps],
  );
  const mcpRepoFilterOptions = useMemo(
    () => [{ value: "all", label: "All repositories" }, ...repoOptions],
    [repoOptions],
  );
  const filteredMcps = useMemo(() => {
    const normalizedQuery = mcpSearchQuery.trim().toLowerCase();

    return mcps.filter((mcp) => {
      const repoName = repos.find((repo) => repo.id === mcp.repoId)?.repoName ?? "";
      const matchesQuery =
        !normalizedQuery ||
        mcp.mcpName.toLowerCase().includes(normalizedQuery) ||
        mcp.description.toLowerCase().includes(normalizedQuery);
      const matchesStatus = mcpStatusFilter === "all" || mcp.status === mcpStatusFilter;
      const matchesRepo = mcpRepoFilter === "all" || mcp.repoId === mcpRepoFilter;

      return matchesQuery && matchesStatus && matchesRepo && (normalizedQuery ? repoName.toLowerCase().includes(normalizedQuery) || matchesQuery : true);
    });
  }, [mcpRepoFilter, mcpSearchQuery, mcpStatusFilter, mcps, repos]);
  const selectedPlaygroundAgent = useMemo(
    () => runningAgents.find((agent) => agent.id === selectedPlaygroundAgentId) ?? null,
    [runningAgents, selectedPlaygroundAgentId],
  );
  const selectedPlaygroundMcp = useMemo(
    () => runningMcps.find((mcp) => mcp.id === selectedPlaygroundMcpId) ?? null,
    [runningMcps, selectedPlaygroundMcpId],
  );
  const currentPlaygroundMessages = useMemo(
    () => (selectedPlaygroundAgentId ? playgroundMessages[selectedPlaygroundAgentId] ?? [] : []),
    [playgroundMessages, selectedPlaygroundAgentId],
  );
  const currentMcpPlaygroundMessages = useMemo(() => (selectedPlaygroundMcpId ? mcpPlaygroundMessages[selectedPlaygroundMcpId] ?? [] : []), [mcpPlaygroundMessages, selectedPlaygroundMcpId]);
  const mcpPlaygroundModelOptions = useMemo(
    () => llmAccess?.availableModels.map((model) => ({ value: model.modelName, label: model.modelName })) ?? [],
    [llmAccess],
  );
  const inspectorToolOptions = useMemo(
    () => inspectorCard?.tools.map((tool) => ({ value: tool.name, label: tool.name })) ?? [],
    [inspectorCard],
  );
  const selectedInspectorTool = useMemo(
    () => inspectorCard?.tools.find((tool) => tool.name === selectedInspectorToolName) ?? null,
    [inspectorCard, selectedInspectorToolName],
  );

  const loadProject = async (targetProjectId: string) => {
    const loadedProject = await apiFetch<Project>(`projects/${targetProjectId}`);
    setProject(loadedProject);
    setEditName(loadedProject.name);
    setEditDescription(loadedProject.description);
    return loadedProject;
  };

  const loadInfoData = async (targetProjectId: string) => {
    const overview = await apiFetch<ProjectOverview>(`projects/${targetProjectId}/overview`);
    setProject(overview.project);
    setEditName(overview.project.name);
    setEditDescription(overview.project.description);
    setMembers(overview.members);
    return overview;
  };

  const loadRepos = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    setLoadingRepos(true);
    try {
      const [, repoRows, workspaceRows] = await Promise.all([
        apiFetch(`gitlab/projects/${activeProject.id}/group`, { method: "POST" }),
        apiFetch<GitRepo[]>(`gitlab/projects/${activeProject.id}/repos`),
        apiFetch<WorkspaceSession[]>(`workspaces/project/${activeProject.id}`),
      ]);
      setRepos(repoRows);
      setWorkspaces(workspaceRows);
    } catch {
      toastError("Failed to load repositories.");
    } finally {
      setLoadingRepos(false);
    }
  };

  const loadAgents = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    try {
      const agentRows = await apiFetch<AgentDeployment[]>(`agents/project/${activeProject.id}`);
      setAgents(agentRows);
    } catch {
      toastError("Failed to load agents.");
    }
  };

  const loadMcps = async (targetProject?: Project | null) => {
    const activeProject = targetProject ?? project;
    if (!activeProject) {
      return;
    }

    try {
      const mcpRows = await apiFetch<McpDeployment[]>(`mcps/project/${activeProject.id}`);
      setMcps(mcpRows);
    } catch {
      toastError("Failed to load MCP deployments.");
    }
  };

  const loadCatalogModels = async (targetProjectId: string) => {
    try {
      const models = await apiFetch<CatalogModel[]>(`llm/projects/${targetProjectId}/catalog-models`);
      setCatalogModels(models);
      setAgentModelName((current) =>
        current && models.some((model) => model.modelName === current)
          ? current
          : models.find((model) => model.isDefault)?.modelName ?? models[0]?.modelName ?? null,
      );
      setMcpModelName((current) =>
        current && models.some((model) => model.modelName === current)
          ? current
          : models.find((model) => model.isDefault)?.modelName ?? models[0]?.modelName ?? null,
      );
    } catch {
      toastError("Failed to load LiteLLM models.");
    }
  };

  const loadCurrentLlmAccess = async () => {
    try {
      const access = await apiFetch<MyLiteLlmAccess>("llm/me/access");
      setLlmAccess(access);
      setSelectedMcpPlaygroundModel((current) =>
        current && access.availableModels.some((model) => model.modelName === current)
          ? current
          : access.availableModels[0]?.modelName ?? null,
      );
    } catch {
      setLlmAccess(null);
    }
  };

  const loadAvailableUsers = async (targetProjectId: string) => {
    try {
      const users = await apiFetch<PortalUser[]>(`projects/${targetProjectId}/available-users`);
      setAvailableUsers(users);
    } catch {
      setAvailableUsers([]);
    }
  };

  const loadSectionData = async (targetProjectId: string) => {
    switch (activeMenu) {
      case "Info": {
        const overview = await loadInfoData(targetProjectId);
        await loadRepos(overview.project);
        return overview.project;
      }
      case "Repo": {
        const loadedProject = await loadProject(targetProjectId);
        await loadRepos(loadedProject);
        return loadedProject;
      }
      case "Agent": {
        const loadedProject = await loadProject(targetProjectId);
        await Promise.all([loadRepos(loadedProject), loadAgents(loadedProject), loadCatalogModels(targetProjectId)]);
        return loadedProject;
      }
      case "MCP": {
        const loadedProject = await loadProject(targetProjectId);
        await Promise.all([loadRepos(loadedProject), loadMcps(loadedProject), loadCatalogModels(targetProjectId)]);
        return loadedProject;
      }
      case "MCP Inspector": {
        const loadedProject = await loadProject(targetProjectId);
        await loadMcps(loadedProject);
        return loadedProject;
      }
      case "Playground": {
        const loadedProject = await loadProject(targetProjectId);
        await Promise.all([loadAgents(loadedProject), loadMcps(loadedProject), loadCurrentLlmAccess()]);
        return loadedProject;
      }
      default:
        return loadProject(targetProjectId);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<CurrentUser>("auth/me");
        setCurrentUser(me);
        await loadSectionData(projectId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace(`/login?next=${pathname}`);
          return;
        }
        toastError("Failed to load project.");
      } finally {
        setAuthChecking(false);
        setLoadingProject(false);
      }
    };

    if (projectId) {
      void load();
    }
  }, [activeMenu, pathname, projectId, router]);

  useEffect(() => {
    if (activeMenu === "Info" && projectId && isManager) {
      void loadAvailableUsers(projectId);
      return;
    }

    setAvailableUsers([]);
  }, [activeMenu, isManager, projectId]);

  useEffect(() => {
    if (!runningAgents.length) {
      if (playgroundMode === "deployed" && playgroundTargetType === "agent") {
        setSelectedPlaygroundAgentId(null);
      }
      return;
    }

    if (
      playgroundMode === "deployed" &&
      playgroundTargetType === "agent" &&
      (!selectedPlaygroundAgentId || !runningAgents.some((agent) => agent.id === selectedPlaygroundAgentId))
    ) {
      setSelectedPlaygroundAgentId(runningAgents[0].id);
    }
  }, [playgroundMode, playgroundTargetType, runningAgents, selectedPlaygroundAgentId]);

  useEffect(() => {
    if (!runningMcps.length) {
      if (playgroundMode === "deployed" && playgroundTargetType === "mcp") {
        setSelectedPlaygroundMcpId(null);
      }
      return;
    }

    if (
      playgroundMode === "deployed" &&
      playgroundTargetType === "mcp" &&
      (!selectedPlaygroundMcpId || !runningMcps.some((mcp) => mcp.id === selectedPlaygroundMcpId))
    ) {
      setSelectedPlaygroundMcpId(runningMcps[0].id);
    }
  }, [playgroundMode, playgroundTargetType, runningMcps, selectedPlaygroundMcpId]);

  useEffect(() => {
    if (playgroundMode !== "deployed" || playgroundTargetType !== "mcp" || !selectedPlaygroundMcpId) {
      setSelectedPlaygroundMcpCard(null);
      return;
    }

    const load = async () => {
      setLoadingSelectedMcpCard(true);
      try {
        const card = await apiFetch<McpServerCard>(`mcps/${selectedPlaygroundMcpId}/card`);
        setSelectedPlaygroundMcpCard(card);
      } catch {
        setSelectedPlaygroundMcpCard(null);
        toastError("Failed to load MCP card.");
      } finally {
        setLoadingSelectedMcpCard(false);
      }
    };

    void load();
  }, [playgroundMode, playgroundTargetType, selectedPlaygroundMcpId]);

  useEffect(() => {
    if (!inspectorCard?.tools.length) {
      setSelectedInspectorToolName(null);
      return;
    }

    if (!selectedInspectorToolName || !inspectorCard.tools.some((tool) => tool.name === selectedInspectorToolName)) {
      setSelectedInspectorToolName(inspectorCard.tools[0].name);
    }
  }, [inspectorCard, selectedInspectorToolName]);

  useEffect(() => {
    if (!selectedInspectorTool) {
      setInspectorToolArgs("{}");
      return;
    }
    setInspectorToolArgs(JSON.stringify(selectedInspectorTool.inputSchema ?? {}, null, 2));
  }, [selectedInspectorTool]);

  useEffect(() => {
    setInspectorCard(null);
    setInspectorConnectedUrl("");
    setInspectorToolResult("");
  }, [inspectorConnectionType]);

  const refreshWorkspace = async (workspaceId: string) => {
    const latest = await apiFetch<WorkspaceSession>(`workspaces/${workspaceId}`);
    setWorkspaces((prev) => [latest, ...prev.filter((item) => item.id !== latest.id)]);
    return latest;
  };

  const stopOtherWorkspacesInState = (activeWorkspaceId?: string) => {
    setWorkspaces((prev) =>
      prev.map((item) =>
        item.id !== activeWorkspaceId && item.status !== "stopped"
          ? { ...item, status: "stopped" }
          : item,
      ),
    );
  };

  const upsertWorkspaceInState = (workspace: WorkspaceSession) => {
    setWorkspaces((prev) => [workspace, ...prev.filter((item) => item.id !== workspace.id)]);
  };

  const openWorkspaceWhenReady = async (workspace: WorkspaceSession) => {
    setOpeningWorkspaceId(workspace.id);
    try {
      for (let attempt = 0; attempt < workspaceHealthcheckMaxAttempts; attempt += 1) {
        const [latest, health] = await Promise.all([
          refreshWorkspace(workspace.id),
          apiFetch<WorkspaceEndpointHealth>(`workspaces/${workspace.id}/endpoint-health`),
        ]);

        if (health.ready) {
          window.open(latest.endpointUrl, "_blank", "noopener,noreferrer");
          return;
        }

        if (attempt < workspaceHealthcheckMaxAttempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, workspaceHealthcheckIntervalMs));
        }
      }

      toastError("Workspace is still starting. Try opening it again in a moment.");
    } catch {
      toastError("Failed to verify workspace readiness.");
    } finally {
      setOpeningWorkspaceId((current) => (current === workspace.id ? null : current));
    }
  };

  const createRepo = async () => {
    if (!project) {
      return;
    }
    if (!newRepoName.trim()) {
      toastError("Enter a repository name.");
      return;
    }

    setCreatingRepo(true);
    try {
      await apiFetch<GitRepo>(`gitlab/projects/${project.id}/repos`, {
        method: "POST",
        body: JSON.stringify({ repoName: newRepoName.trim() }),
      });
      setNewRepoName("");
      await loadRepos();
      toastSuccess("Repository created.");
    } catch {
      toastError("Failed to create repository.");
    } finally {
      setCreatingRepo(false);
    }
  };

  const deployAgent = async () => {
    if (!project || !agentName.trim() || !agentRepoId || !agentModelName) {
      toastError("Fill in agent name, repo, and model.");
      return;
    }

    setDeployingAgent(true);
    try {
      const created = await apiFetch<AgentDeployment>("agents", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          repoId: agentRepoId,
          agentName: agentName.trim(),
          description: agentDescription.trim(),
          dockerfilePath: agentDockerfilePath.trim() || "./Dockerfile",
          litellmModel: agentModelName,
        }),
      });
      setAgents((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setAgentModalOpen(false);
      setAgentName("");
      setAgentDescription("");
      setAgentRepoId(null);
      setAgentDockerfilePath("./Dockerfile");
      setAgentModelName(catalogModels.find((model) => model.isDefault)?.modelName ?? catalogModels[0]?.modelName ?? null);
      toastSuccess(
        selectedAgentModel?.isDefault
          ? "Agent build and deployment requested."
          : "Agent build requested. Deployment will continue after admin approval.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toastError("Serving capacity limit reached. Stop an active agent before deploying another one.");
      } else {
        toastError("Failed to deploy agent.");
      }
    } finally {
      setDeployingAgent(false);
    }
  };

  const deployMcp = async () => {
    if (!project || !mcpName.trim() || !mcpRepoId || (mcpUseLlm && !mcpModelName)) {
      toastError("Fill in MCP name, repo, and model when LLM is enabled.");
      return;
    }

    setDeployingMcp(true);
    try {
      const created = await apiFetch<McpDeployment>("mcps", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          repoId: mcpRepoId,
          mcpName: mcpName.trim(),
          description: mcpDescription.trim(),
          dockerfilePath: mcpDockerfilePath.trim() || "./Dockerfile",
          useLlm: mcpUseLlm,
          litellmModel: mcpUseLlm ? mcpModelName : undefined,
        }),
      });
      setMcps((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setMcpModalOpen(false);
      setMcpName("");
      setMcpDescription("");
      setMcpRepoId(null);
      setMcpDockerfilePath("./Dockerfile");
      setMcpUseLlm(false);
      setMcpModelName(catalogModels.find((model) => model.isDefault)?.modelName ?? catalogModels[0]?.modelName ?? null);
      toastSuccess(
        mcpUseLlm && !selectedMcpModel?.isDefault
          ? "MCP build requested. Deployment will continue after admin approval."
          : "MCP build and deployment requested.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toastError("Serving capacity limit reached. Stop an active MCP server before deploying another one.");
      } else {
        toastError("Failed to deploy MCP.");
      }
    } finally {
      setDeployingMcp(false);
    }
  };

  const loadAgentLogs = async (agent: AgentDeployment) => {
    setLogsTarget(agent);
    setLoadingAgentLogs(true);
    try {
      const result = await apiFetch<{ logs: string }>(`agents/${agent.id}/logs`);
      setAgentLogs(result.logs);
    } catch {
      setAgentLogs("");
      toastError("Failed to load agent logs.");
    } finally {
      setLoadingAgentLogs(false);
    }
  };

  const loadMcpLogs = async (mcp: McpDeployment) => {
    setMcpLogsTarget(mcp);
    setLoadingMcpLogs(true);
    try {
      const result = await apiFetch<{ logs: string }>(`mcps/${mcp.id}/logs`);
      setMcpLogs(result.logs);
    } catch {
      setMcpLogs("");
      toastError("Failed to load MCP logs.");
    } finally {
      setLoadingMcpLogs(false);
    }
  };

  const stopAgent = async (agent: AgentDeployment) => {
    setStoppingAgentId(agent.id);
    try {
      const updated = await apiFetch<AgentDeployment>(`agents/${agent.id}/stop`, { method: "POST" });
      setAgents((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
      toastSuccess("Agent stopped.");
    } catch {
      toastError("Failed to stop agent.");
    } finally {
      setStoppingAgentId(null);
    }
  };

  const restartAgent = async (agent: AgentDeployment) => {
    setRestartingAgentId(agent.id);
    try {
      const updated = await apiFetch<AgentDeployment>(`agents/${agent.id}/restart`, { method: "POST" });
      setAgents((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
      toastSuccess("Agent restart requested.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toastError("No serving slot available for this project.");
      } else {
        toastError("Failed to restart agent.");
      }
    } finally {
      setRestartingAgentId(null);
    }
  };

  const deleteAgent = async (agent: AgentDeployment) => {
    setDeletingAgentId(agent.id);
    try {
      await apiFetch(`agents/${agent.id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((item) => item.id !== agent.id));
      toastSuccess("Agent deleted.");
    } catch {
      toastError("Failed to delete agent.");
    } finally {
      setDeletingAgentId(null);
    }
  };

  const stopMcp = async (mcp: McpDeployment) => {
    setStoppingMcpId(mcp.id);
    try {
      const updated = await apiFetch<McpDeployment>(`mcps/${mcp.id}/stop`, { method: "POST" });
      setMcps((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
      toastSuccess("MCP stopped.");
    } catch {
      toastError("Failed to stop MCP.");
    } finally {
      setStoppingMcpId(null);
    }
  };

  const restartMcp = async (mcp: McpDeployment) => {
    setRestartingMcpId(mcp.id);
    try {
      const updated = await apiFetch<McpDeployment>(`mcps/${mcp.id}/restart`, { method: "POST" });
      setMcps((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
      toastSuccess("MCP restart requested.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toastError("Serving capacity limit reached. Stop an active MCP server before restarting another one.");
      } else {
        toastError("Failed to restart MCP.");
      }
    } finally {
      setRestartingMcpId(null);
    }
  };

  const deleteMcp = async (mcp: McpDeployment) => {
    setDeletingMcpId(mcp.id);
    try {
      await apiFetch(`mcps/${mcp.id}`, { method: "DELETE" });
      setMcps((prev) => prev.filter((item) => item.id !== mcp.id));
      toastSuccess("MCP deleted.");
    } catch {
      toastError("Failed to delete MCP.");
    } finally {
      setDeletingMcpId(null);
    }
  };

  useEffect(() => {
    if (!logsTarget) {
      return;
    }

    void loadAgentLogs(logsTarget);
    const timer = window.setInterval(() => {
      void loadAgentLogs(logsTarget);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [logsTarget]);

  useEffect(() => {
    if (!mcpLogsTarget) {
      return;
    }

    void loadMcpLogs(mcpLogsTarget);
    const timer = window.setInterval(() => {
      void loadMcpLogs(mcpLogsTarget);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [mcpLogsTarget]);

  useEffect(() => {
    if (!logsTarget || !agentLogsViewportRef.current) {
      return;
    }

    agentLogsViewportRef.current.scrollTo({
      top: agentLogsViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [agentLogs, logsTarget]);

  useEffect(() => {
    if (!devPlaygroundViewportRef.current) {
      return;
    }

    devPlaygroundViewportRef.current.scrollTo({
      top: devPlaygroundViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [devPlaygroundMessages]);

  useEffect(() => {
    if (!deployedPlaygroundViewportRef.current) {
      return;
    }

    deployedPlaygroundViewportRef.current.scrollTo({
      top: deployedPlaygroundViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [currentMcpPlaygroundMessages, currentPlaygroundMessages]);

  useEffect(() => {
    if (!mcpLogsTarget || !mcpLogsViewportRef.current) {
      return;
    }

    mcpLogsViewportRef.current.scrollTo({
      top: mcpLogsViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [mcpLogs, mcpLogsTarget]);

  const copyText = async (value: string, successMessage: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error("Clipboard unavailable");
      }
      toastSuccess(successMessage);
    } catch {
      toastError("Failed to copy.");
    }
  };

  const sendPlaygroundMessage = async () => {
    if (!playgroundInput.trim()) {
      return;
    }

    const userMessage: PlaygroundMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: playgroundInput.trim(),
    };
    let nextMessages: PlaygroundMessage[] = [];

    if (playgroundMode === "dev" && playgroundTargetType === "agent") {
      if (!devA2AUrl.trim() || !devAgentCard) {
        toastError("Connect an A2A URL first.");
        return;
      }
      nextMessages = [...devPlaygroundMessages, userMessage];
      setDevPlaygroundMessages(nextMessages);
    } else if (playgroundTargetType === "agent") {
      if (!selectedPlaygroundAgent) {
        return;
      }
      const agentId = selectedPlaygroundAgent.id;
      nextMessages = [...(playgroundMessages[agentId] ?? []), userMessage];
      setPlaygroundMessages((prev) => ({
        ...prev,
        [agentId]: nextMessages,
      }));
    } else {
      if (!selectedPlaygroundMcp || !selectedMcpPlaygroundModel) {
        toastError("Select an MCP server and a model first.");
        return;
      }
      const mcpId = selectedPlaygroundMcp.id;
      nextMessages = [...(mcpPlaygroundMessages[mcpId] ?? []), userMessage];
      setMcpPlaygroundMessages((prev) => ({
        ...prev,
        [mcpId]: nextMessages,
      }));
    }
    setPlaygroundInput("");
    setSendingPlaygroundMessage(true);

    try {
      const result =
        playgroundMode === "dev" && playgroundTargetType === "agent"
          ? await apiFetch<{ reply: string; endpoint: string; contextId: string | null }>("agents/playground/chat", {
              method: "POST",
              body: JSON.stringify({
                url: devA2AUrl.trim(),
                message: userMessage.content,
                contextId: devPlaygroundContextId,
              }),
            })
            : playgroundTargetType === "agent"
              ? await apiFetch<{ reply: string; endpoint: string; contextId: string | null }>(`agents/${selectedPlaygroundAgent!.id}/chat`, {
                  method: "POST",
                  body: JSON.stringify({
                    message: userMessage.content,
                    contextId: playgroundContextIds[selectedPlaygroundAgent!.id] ?? null,
                  }),
                })
              : await apiFetch<{ reply: string; serverCard: McpServerCard }>(`mcps/${selectedPlaygroundMcp!.id}/chat`, {
                  method: "POST",
                  body: JSON.stringify({
                    modelName: selectedMcpPlaygroundModel,
                    messages: nextMessages.map((message) => ({
                      role: message.role === "agent" ? "assistant" : "user",
                      content: message.content,
                    })),
                  }),
                });
      const agentMessage: PlaygroundMessage = {
        id: `${Date.now()}-agent`,
        role: "agent",
        content: result.reply,
      };
      if (playgroundMode === "dev" && playgroundTargetType === "agent") {
        setDevPlaygroundContextId((result as { contextId: string | null }).contextId ?? null);
        setDevPlaygroundMessages((prev) => [...prev, agentMessage]);
      } else if (playgroundTargetType === "agent") {
        const agentId = selectedPlaygroundAgent!.id;
        setPlaygroundContextIds((prev) => ({
          ...prev,
          [agentId]: (result as { contextId: string | null }).contextId ?? prev[agentId] ?? null,
        }));
        setPlaygroundMessages((prev) => ({
          ...prev,
          [agentId]: [...(prev[agentId] ?? []), agentMessage],
        }));
      } else {
        const mcpId = selectedPlaygroundMcp!.id;
        setSelectedPlaygroundMcpCard((result as { serverCard: McpServerCard }).serverCard);
        setMcpPlaygroundMessages((prev) => ({
          ...prev,
          [mcpId]: [...(prev[mcpId] ?? []), agentMessage],
        }));
      }
    } catch {
      toastError(playgroundTargetType === "mcp" ? "Failed to test MCP server." : "Failed to chat with agent.");
    } finally {
      setSendingPlaygroundMessage(false);
    }
  };

  const connectDevAgent = async () => {
    if (!devA2AUrl.trim()) {
      toastError("Enter an A2A URL.");
      return;
    }

    setConnectingDevAgent(true);
    try {
      const result = await apiFetch<{ normalizedUrl: string; agentCardUrl: string; agentCard: ExternalAgentCard }>("agents/playground/inspect", {
        method: "POST",
        body: JSON.stringify({ url: devA2AUrl.trim() }),
      });
      setPlaygroundMode("dev");
      setPlaygroundTargetType("agent");
      setDevA2AUrl(result.normalizedUrl);
      setDevAgentCardUrl(result.agentCardUrl);
      setDevAgentCard(result.agentCard);
      setDevPlaygroundMessages([]);
      setDevPlaygroundContextId(null);
      toastSuccess("A2A agent connected.");
    } catch {
      toastError("Failed to connect to the A2A URL.");
    } finally {
      setConnectingDevAgent(false);
    }
  };

  const connectInspector = async () => {
    if (!inspectorUrl.trim()) {
      toastError("Enter an MCP endpoint URL.");
      return;
    }

    setConnectingInspector(true);
    try {
      const result = await apiFetch<{ normalizedUrl: string; serverCard: McpServerCard }>("mcps/inspector/inspect", {
        method: "POST",
        body: JSON.stringify({
          transportType: inspectorConnectionType,
          url: inspectorUrl.trim(),
        }),
      });
      const serverCard = result.serverCard;
      const normalizedUrl = result.normalizedUrl;
      setInspectorConnectedUrl(normalizedUrl);
      setInspectorCard(serverCard);
      setSelectedInspectorToolName(serverCard.tools[0]?.name ?? null);
      setInspectorToolArgs(serverCard.tools[0] ? JSON.stringify(serverCard.tools[0].inputSchema ?? {}, null, 2) : "{}");
      setInspectorToolResult("");
      toastSuccess("MCP Inspector connected.");
    } catch {
      toastError("Failed to connect MCP Inspector.");
    } finally {
      setConnectingInspector(false);
    }
  };

  const callInspectorTool = async () => {
    if (!inspectorCard || !selectedInspectorTool) {
      toastError("Connect to an MCP server and choose a tool first.");
      return;
    }

    let parsedArgs: Record<string, unknown> = {};
    try {
      const value = inspectorToolArgs.trim();
      parsedArgs = value ? (JSON.parse(value) as Record<string, unknown>) : {};
    } catch {
      toastError("Tool arguments must be valid JSON.");
      return;
    }

    setCallingInspectorTool(true);
    try {
      const result = await apiFetch<{ normalizedUrl: string; result: string; serverCard: McpServerCard }>("mcps/inspector/tools/call", {
        method: "POST",
        body: JSON.stringify({
          transportType: inspectorConnectionType,
          url: inspectorConnectedUrl || inspectorUrl.trim(),
          toolName: selectedInspectorTool.name,
          toolArgs: parsedArgs,
        }),
      });

      setInspectorToolResult(result.result);
      setInspectorCard(result.serverCard);
      setInspectorConnectedUrl(typeof result.normalizedUrl === "string" ? result.normalizedUrl : "");
      toastSuccess("Tool executed.");
    } catch {
      toastError("Failed to call the MCP tool.");
    } finally {
      setCallingInspectorTool(false);
    }
  };

  const openWorkspaceModal = (repo: GitRepo, workspace?: WorkspaceSession) => {
    setWorkspaceRuntime(workspace?.runtime ?? "NODE22");
    setWorkspaceModal({ repo, workspace });
  };

  const handleWorkspaceSubmit = async () => {
    if (!project || !workspaceModal || !workspaceRuntime) {
      return;
    }

    setCreatingWorkspace(true);
    try {
      if (workspaceModal.workspace) {
        stopOtherWorkspacesInState(workspaceModal.workspace.id);
        upsertWorkspaceInState({ ...workspaceModal.workspace, runtime: workspaceRuntime, status: "provisioning" });
        const updated = await apiFetch<WorkspaceSession>(`workspaces/${workspaceModal.workspace.id}`, {
          method: "PATCH",
          body: JSON.stringify({ runtime: workspaceRuntime }),
        });
        upsertWorkspaceInState(updated);
        setWorkspaceModal(null);
        toastSuccess("Workspace restart requested.");
        await openWorkspaceWhenReady(updated);
      } else {
        stopOtherWorkspacesInState();
        const created = await apiFetch<WorkspaceSession>("workspaces", {
          method: "POST",
          body: JSON.stringify({
            projectId: project.id,
            repoId: workspaceModal.repo.id,
            runtime: workspaceRuntime,
          }),
        });
        upsertWorkspaceInState(created);
        setWorkspaceModal(null);
        toastSuccess("Workspace provisioning started.");
        await openWorkspaceWhenReady(created);
      }
    } catch {
      await loadRepos();
      toastError("Failed to provision VS Code workspace.");
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const deleteWorkspace = async (workspace: WorkspaceSession) => {
    setDeletingWorkspaceId(workspace.id);
    try {
      await apiFetch<{ id: string }>(`workspaces/${workspace.id}`, { method: "DELETE" });
      setWorkspaces((prev) => prev.filter((item) => item.id !== workspace.id));
      setWorkspaceDeleteTarget(null);
      toastSuccess("Workspace deleted.");
    } catch {
      toastError("Failed to delete workspace.");
    } finally {
      setDeletingWorkspaceId(null);
    }
  };

  const stopWorkspace = async (workspace: WorkspaceSession) => {
    setStoppingWorkspaceId(workspace.id);
    try {
      const stopped = await apiFetch<WorkspaceSession>(`workspaces/${workspace.id}/stop`, { method: "POST" });
      setWorkspaces((prev) => [stopped, ...prev.filter((item) => item.id !== stopped.id)]);
      toastSuccess("Workspace stopped.");
    } catch {
      toastError("Failed to stop workspace.");
    } finally {
      setStoppingWorkspaceId(null);
    }
  };

  const restartWorkspace = async (workspace: WorkspaceSession) => {
    setRestartingWorkspaceId(workspace.id);
    try {
      stopOtherWorkspacesInState(workspace.id);
      upsertWorkspaceInState({ ...workspace, status: "provisioning" });
      const restarted = await apiFetch<WorkspaceSession>(`workspaces/${workspace.id}/restart`, { method: "POST" });
      upsertWorkspaceInState(restarted);
      toastSuccess("Workspace restart requested.");
      await openWorkspaceWhenReady(restarted);
    } catch {
      await loadRepos();
      toastError("Failed to restart workspace.");
    } finally {
      setRestartingWorkspaceId(null);
    }
  };

  const addMember = async () => {
    if (!project || !selectedUserId || !selectedRole) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      });
      setSelectedUserId(null);
      setSelectedRole("member");
      await loadInfoData(project.id);
      await loadAvailableUsers(project.id);
      toastSuccess("Member added.");
    } catch {
      toastError("Failed to add member.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!project) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      });
      await loadInfoData(project.id);
      toastSuccess("Member role updated.");
    } catch {
      toastError("Failed to update member role.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!project) {
      return;
    }

    setUpdatingMembers(true);
    try {
      await apiFetch(`projects/${project.id}/members/${userId}`, { method: "DELETE" });
      await loadInfoData(project.id);
      await loadAvailableUsers(project.id);
      toastSuccess("Member removed.");
    } catch {
      toastError("Failed to remove member.");
    } finally {
      setUpdatingMembers(false);
    }
  };

  const deleteProject = async () => {
    if (!project) {
      return;
    }

    setDeletingProject(true);
    try {
      await apiFetch(`projects/${project.id}`, { method: "DELETE" });
      toastSuccess("Project deleted.");
      router.push("/portal");
    } catch {
      toastError("Failed to delete project.");
    } finally {
      setDeletingProject(false);
      setDeleteModalOpen(false);
    }
  };

  const updateProject = async () => {
    if (!project) {
      return;
    }

    setSavingProject(true);
    try {
      const updated = await apiFetch<Project>(`projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim(),
        }),
      });
      setProject(updated);
      setEditProjectOpen(false);
      toastSuccess("Project updated.");
    } catch {
      toastError("Failed to update project.");
    } finally {
      setSavingProject(false);
    }
  };

  const breadcrumbs = (
    <Breadcrumbs separator=">">
      <Text component={Link} href="/portal" inherit>
        User Portal
      </Text>
      <Text component={Link} href={`/portal/projects/${projectId}/info`} inherit>
        {project?.name ?? "Project"}
      </Text>
      <Text inherit>{activeMenu}</Text>
    </Breadcrumbs>
  );

  const navbar = (
    <Stack gap="xs">
      {menuItems.map((item) => (
        <NavLink
          key={item.label}
          component={Link}
          href={item.slug ? `/portal/projects/${projectId}/${item.slug}` : `/portal/projects/${projectId}/info`}
          active={activeMenu === item.label}
          label={item.label}
          variant="filled"
        />
      ))}
    </Stack>
  );

  return (
    <AppFrame title={breadcrumbs} headerActions={<ProfileMenu />} navbar={navbar} navbarWidth={280}>
      <Stack
        pos="relative"
        style={{
          minHeight: "calc(100dvh - 96px)",
          height: activeMenu === "Playground" || activeMenu === "MCP Inspector" ? "calc(100dvh - 96px)" : undefined,
          overflow: activeMenu === "Playground" || activeMenu === "MCP Inspector" ? "hidden" : undefined,
        }}
      >
        <LoadingOverlay visible={authChecking || loadingProject} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />

        {activeMenu === "Info" ? (
          <Stack>
            <Paper withBorder p="xl" radius="lg">
              <Stack gap="lg">
                <Stack gap={6}>
                  <Group justify="space-between" align="start">
                    <div>
                      <Title order={2}>{project?.name ?? "-"}</Title>
                    </div>
                    <Group gap="sm" align="center">
                      <Badge color="cyan" variant="light" size="lg">
                        Active
                      </Badge>
                      {isManager ? (
                        <Menu position="bottom-end" shadow="md">
                          <Menu.Target>
                            <SectionMenuButton label="Project actions" />
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => setEditProjectOpen(true)}>Edit Project</Menu.Item>
                            <Menu.Item color="red" onClick={() => setDeleteModalOpen(true)}>
                              Delete Project
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      ) : null}
                    </Group>
                  </Group>
                  <Text size="md" c="dimmed">
                    {project?.description || "No description"}
                  </Text>
                </Stack>

                <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Project ID
                    </Text>
                    <Text mt="sm" fw={600}>
                      {project?.id ?? "-"}
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Created
                    </Text>
                    <Text mt="sm" fw={600}>
                      {project ? new Date(project.createdAt).toLocaleString() : "-"}
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Git / Repos
                    </Text>
                    <Text mt="sm" fw={600}>
                      {repos.length} repos
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Running VS Code
                    </Text>
                    <Text mt="sm" fw={600}>
                      {runningWorkspaces.length} sessions
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      VS Code Usage
                    </Text>
                    <Text mt="sm" fw={600}>
                      CPU {runningWorkspaceCpu} / MEM {runningWorkspaceMemoryGi} Gi
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      Agents
                    </Text>
                    <Text mt="sm" fw={600}>
                      {runningAgents.length} running / {agents.length} deployed
                    </Text>
                  </Card>
                  <Card withBorder radius="md" padding="lg">
                    <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                      MCP Servers
                    </Text>
                    <Text mt="sm" fw={600}>
                      {runningMcps.length} running / {mcps.length} deployed
                    </Text>
                  </Card>
                </SimpleGrid>
              </Stack>
            </Paper>

            <Paper withBorder p="xl" radius="lg">
              <Stack>
                <Group justify="space-between" align="center">
                  <div>
                    <Title order={4}>Project Members</Title>
                    <Text size="sm" c="dimmed">
                      Manage portal users who can access this project.
                    </Text>
                  </div>
                  <Group gap="sm">
                    <Badge variant="light">{members.length} members</Badge>
                    {isManager ? (
                      <Menu position="bottom-end" shadow="md">
                        <Menu.Target>
                          <SectionMenuButton label="Member actions" />
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => setMemberModalOpen(true)}>Add Member</Menu.Item>
                          <Menu.Item onClick={() => setMemberEditMode((prev) => !prev)}>
                            {memberEditMode ? "Finish Member Edit" : "Manage Members"}
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    ) : null}
                  </Group>
                </Group>

                <Table withTableBorder highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Role</Table.Th>
                      {isManager ? <Table.Th /> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {members.map((member) => {
                      const cannotRemoveSelf = member.userId === currentUser?.sub && member.role === "manager" && managerCount <= 1;

                      return (
                        <Table.Tr key={member.id}>
                          <Table.Td>{member.displayName ?? member.userId}</Table.Td>
                          <Table.Td>{member.email ?? "-"}</Table.Td>
                          <Table.Td>
                            {memberEditMode && isManager ? (
                              <Select
                                data={[
                                  { value: "member", label: "member" },
                                  { value: "manager", label: "manager" },
                                ]}
                                value={member.role}
                                onChange={(value) => {
                                  if (value && value !== member.role) {
                                    void updateMemberRole(member.userId, value);
                                  }
                                }}
                                allowDeselect={false}
                              />
                            ) : (
                              <Badge variant="light">{member.role}</Badge>
                            )}
                          </Table.Td>
                          {isManager && memberEditMode ? (
                            <Table.Td>
                              <Button
                                size="xs"
                                color="red"
                                variant="subtle"
                                disabled={cannotRemoveSelf || updatingMembers}
                                onClick={() => void removeMember(member.userId)}
                              >
                                Remove
                              </Button>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Paper>
          </Stack>
        ) : null}

        {activeMenu === "Repo" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Stack>
                <Group justify="space-between" align="end">
                  <Title order={4}>Repositories</Title>
                  <Button variant="light" loading={loadingRepos} onClick={() => void loadRepos()}>
                    Refresh
                  </Button>
                </Group>

                <Group align="end">
                  <TextInput
                    style={{ flex: 1 }}
                    label="New Repo"
                    placeholder="api-server"
                    value={newRepoName}
                    onChange={(event) => setNewRepoName(event.currentTarget.value)}
                  />
                  <Button loading={creatingRepo} onClick={() => void createRepo()}>
                    Create Repo
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {repos.length === 0 ? (
              <Paper withBorder p="md" radius="md">
                <Text size="sm" c="dimmed">
                  No repositories yet.
                </Text>
              </Paper>
            ) : (
              repos.map((repo) => {
                const workspace = repoWorkspaces.get(repo.id);

                return (
                  <Card key={repo.id} withBorder radius="md" padding="lg">
                    <Stack>
                      <Group justify="space-between" align="start">
                        <Stack gap={2}>
                          <Text fw={700}>{repo.repoName}</Text>
                        </Stack>
                      </Group>

                      <Divider />

                      <Stack gap={6}>
                        {!workspace ? (
                          <Group justify="space-between" align="center">
                            <Text size="sm" c="dimmed">
                              No workspace created for this repo yet.
                            </Text>
                            <Button size="xs" onClick={() => openWorkspaceModal(repo)}>
                              Create
                            </Button>
                          </Group>
                        ) : (
                          <Group justify="space-between" align="center">
                            <Group gap="xs">
                              <Badge color="teal" variant="light">
                                {workspace.runtime}
                              </Badge>
                              <Badge variant="light">{workspace.status}</Badge>
                            </Group>
                            <Group gap="xs">
                              <Button
                                size="xs"
                                variant="default"
                                disabled={!["running", "stopped"].includes(workspace.status)}
                                loading={restartingWorkspaceId === workspace.id || openingWorkspaceId === workspace.id}
                                onClick={() =>
                                  workspace.status === "stopped"
                                    ? void restartWorkspace(workspace)
                                    : void openWorkspaceWhenReady(workspace)
                                }
                              >
                                {workspace.status === "stopped" ? "Restart" : "Open"}
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                color="yellow"
                                loading={stoppingWorkspaceId === workspace.id}
                                disabled={workspace.status !== "running"}
                                onClick={() => void stopWorkspace(workspace)}
                              >
                                Stop
                              </Button>
                              <Button size="xs" variant="light" onClick={() => openWorkspaceModal(repo, workspace)}>
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                color="red"
                                variant="light"
                                loading={deletingWorkspaceId === workspace.id}
                                onClick={() => setWorkspaceDeleteTarget(workspace)}
                              >
                                Delete
                              </Button>
                            </Group>
                          </Group>
                        )}
                      </Stack>
                    </Stack>
                  </Card>
                );
              })
            )}
          </Stack>
        ) : null}

        {activeMenu === "Agent" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4}>Agents</Title>
                  <Text size="sm" c="dimmed">
                    Build, deploy, and inspect project agents.
                  </Text>
                </div>
                <Group gap="sm">
                  <Badge variant="light">{activeServingAgents.length}/{maxServingAgents} serving</Badge>
                  <Button variant="light" onClick={() => void loadAgents()}>
                    Refresh
                  </Button>
                  <Tooltip
                    label="Serving capacity limit reached. Stop an active agent before deploying another one."
                    disabled={hasServingCapacity}
                  >
                    <span>
                      <Button onClick={() => setAgentModalOpen(true)} disabled={!hasServingCapacity}>
                        Deploy
                      </Button>
                    </span>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label="Agent name / description"
                  placeholder="Search agents"
                  value={agentSearchQuery}
                  onChange={(event) => setAgentSearchQuery(event.currentTarget.value)}
                />
                <Select
                  label="Agent status"
                  data={agentStatusOptions}
                  value={agentStatusFilter}
                  onChange={setAgentStatusFilter}
                />
                <Select label="Repo" data={agentRepoFilterOptions} value={agentRepoFilter} onChange={setAgentRepoFilter} searchable />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Agent</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Repo</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Endpoint</Table.Th>
                    <Table.Th>Logs</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredAgents.length ? (
                    filteredAgents.map((agent) => (
                      <Table.Tr key={agent.id}>
                        <Table.Td>
                          <Text>{agent.agentName}</Text>
                        </Table.Td>
                        <Table.Td>{agent.description || "-"}</Table.Td>
                        <Table.Td>{repos.find((repo) => repo.id === agent.repoId)?.repoName ?? agent.repoId}</Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <div>
                              <Badge variant="light" color={agent.status === "failed" ? "red" : undefined}>
                                {agent.status}
                              </Badge>
                            </div>
                            {agent.lastMessage ? (
                              <Text size="xs" c={getDeploymentMessageColor(agent.status)} style={{ whiteSpace: "pre-wrap" }}>
                                {agent.lastMessage}
                              </Text>
                            ) : null}
                          </Stack>
                        </Table.Td>
                        <Table.Td>{new Date(agent.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="light" onClick={() => void copyText(agent.endpointUrl, "Endpoint copied.")}>
                            Copy
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            color={agent.status === "failed" ? "red" : undefined}
                            onClick={() => void loadAgentLogs(agent)}
                          >
                            Logs
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {agent.status === "stopped" ? (
                              <Button
                                size="xs"
                                variant="default"
                                loading={restartingAgentId === agent.id}
                                onClick={() => void restartAgent(agent)}
                              >
                                Restart
                              </Button>
                            ) : null}
                            {["running", "deploying"].includes(agent.status) ? (
                              <Button
                                size="xs"
                                color="yellow"
                                variant="light"
                                loading={stoppingAgentId === agent.id}
                                onClick={() => void stopAgent(agent)}
                              >
                                Stop
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              loading={deletingAgentId === agent.id}
                              onClick={() => void deleteAgent(agent)}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Text size="sm" c="dimmed">
                          {agents.length ? "No agents match the current filters." : "No agents deployed yet."}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        ) : null}

        {activeMenu === "MCP" ? (
          <Stack>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4}>MCP Servers</Title>
                  <Text size="sm" c="dimmed">
                    Build, deploy, and inspect project MCP servers.
                  </Text>
                </div>
                <Group gap="sm">
                  <Badge variant="light">{activeServingMcps.length}/{maxServingMcps} serving</Badge>
                  <Button variant="light" onClick={() => void loadMcps()}>
                    Refresh
                  </Button>
                  <Tooltip
                    label="Serving capacity limit reached. Stop an active MCP server before deploying another one."
                    disabled={hasMcpServingCapacity}
                  >
                    <div>
                      <Button onClick={() => setMcpModalOpen(true)} disabled={!hasMcpServingCapacity}>
                        Deploy
                      </Button>
                    </div>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TextInput
                  label="MCP name / description"
                  placeholder="Search MCP deployments"
                  value={mcpSearchQuery}
                  onChange={(event) => setMcpSearchQuery(event.currentTarget.value)}
                />
                <Select
                  label="MCP status"
                  data={mcpStatusOptions}
                  value={mcpStatusFilter}
                  onChange={setMcpStatusFilter}
                />
                <Select label="Repo" data={mcpRepoFilterOptions} value={mcpRepoFilter} onChange={setMcpRepoFilter} searchable />
              </SimpleGrid>
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Table withTableBorder highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>MCP</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Repo</Table.Th>
                    <Table.Th>LLM</Table.Th>
                    <Table.Th>Model</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Endpoint</Table.Th>
                    <Table.Th>Logs</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredMcps.length ? (
                    filteredMcps.map((mcp) => (
                      <Table.Tr key={mcp.id}>
                        <Table.Td>
                          <Text>{mcp.mcpName}</Text>
                        </Table.Td>
                        <Table.Td>{mcp.description || "-"}</Table.Td>
                        <Table.Td>{repos.find((repo) => repo.id === mcp.repoId)?.repoName ?? mcp.repoId}</Table.Td>
                        <Table.Td>{mcp.useLlm === "Y" ? "Enabled" : "Disabled"}</Table.Td>
                        <Table.Td>{mcp.litellmModel || "-"}</Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            <div>
                              <Badge variant="light" color={mcp.status === "failed" ? "red" : undefined}>
                                {mcp.status}
                              </Badge>
                            </div>
                            {mcp.lastMessage ? (
                              <Text size="xs" c={getDeploymentMessageColor(mcp.status)} style={{ whiteSpace: "pre-wrap" }}>
                                {mcp.lastMessage}
                              </Text>
                            ) : null}
                          </Stack>
                        </Table.Td>
                        <Table.Td>{new Date(mcp.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="light" onClick={() => void copyText(mcp.endpointUrl, "Endpoint copied.")}>
                            Copy
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            color={mcp.status === "failed" ? "red" : undefined}
                            onClick={() => void loadMcpLogs(mcp)}
                          >
                            Logs
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {mcp.status === "stopped" ? (
                              <Button
                                size="xs"
                                variant="default"
                                loading={restartingMcpId === mcp.id}
                                onClick={() => void restartMcp(mcp)}
                              >
                                Restart
                              </Button>
                            ) : null}
                            {["running", "deploying"].includes(mcp.status) ? (
                              <Button
                                size="xs"
                                color="yellow"
                                variant="light"
                                loading={stoppingMcpId === mcp.id}
                                onClick={() => void stopMcp(mcp)}
                              >
                                Stop
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              loading={deletingMcpId === mcp.id}
                              onClick={() => void deleteMcp(mcp)}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={10}>
                        <Text size="sm" c="dimmed">
                          {mcps.length ? "No MCP deployments match the current filters." : "No MCP deployments yet."}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        ) : null}

        {activeMenu === "MCP Inspector" ? (
          <Stack style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4}>MCP Inspector</Title>
                  <Text size="sm" c="dimmed">
                    Inspect remote MCP servers, review tool schemas, and invoke tools directly.
                  </Text>
                </div>
                <Button variant="light" onClick={() => void loadMcps()}>
                  Refresh MCPs
                </Button>
              </Group>
            </Paper>

            <SimpleGrid
              cols={{ base: 1, xl: 3 }}
              spacing="md"
              style={{ alignItems: "stretch", flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}
            >
              <Paper withBorder p="md" radius="md" style={{ minHeight: 0, overflow: "auto" }}>
                <Stack>
                  <Select
                    label="Connection Type"
                    data={[
                      { value: "streamable-http", label: "Streamable HTTP" },
                      { value: "sse", label: "SSE" },
                    ]}
                    value={inspectorConnectionType}
                    onChange={(value) => setInspectorConnectionType((value as McpInspectorConnectionType) ?? "streamable-http")}
                  />

                  <TextInput
                    label="Endpoint URL"
                    placeholder={inspectorConnectionType === "sse" ? "https://example.com/sse" : "https://example.com/mcp"}
                    value={inspectorUrl}
                    onChange={(event) => setInspectorUrl(event.currentTarget.value)}
                  />

                  <Group justify="space-between" align="center">
                    <Badge variant="light">{inspectorConnectionType === "sse" ? "SSE" : "Streamable HTTP"}</Badge>
                    <Button loading={connectingInspector} onClick={() => void connectInspector()}>
                      Connect
                    </Button>
                  </Group>

                  <Divider />

                  <Stack gap={6}>
                    <Text fw={600}>Connection Notes</Text>
                    <Text size="sm" c="dimmed">
                      Connect to an external MCP endpoint like MCP Inspector using streamable HTTP or SSE.
                    </Text>
                    <Text size="sm" c="dimmed">SSE mode expects an MCP SSE endpoint that advertises its message endpoint.</Text>
                  </Stack>
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <Stack style={{ minHeight: 0, flex: 1 }}>
                  <Group justify="space-between" align="center">
                    <div>
                      <Title order={5}>Server Card</Title>
                      <Text size="sm" c="dimmed">
                        {inspectorConnectedUrl || "Connect to load MCP metadata."}
                      </Text>
                    </div>
                    {inspectorCard ? <Badge variant="light">{inspectorCard.protocolVersion}</Badge> : null}
                  </Group>

                  {inspectorCard ? (
                    <>
                      <Paper withBorder p="sm" radius="md">
                        <Stack gap={4}>
                          <Text fw={600}>{inspectorCard.name}</Text>
                          <Text size="sm" c="dimmed">
                            {inspectorCard.description || "No description"}
                          </Text>
                          <Text size="sm">Endpoint: {inspectorCard.endpointUrl}</Text>
                          <Text size="sm">Tools: {inspectorCard.tools.length}</Text>
                        </Stack>
                      </Paper>

                      <ScrollArea style={{ flex: 1 }}>
                        <Stack gap="sm" pr="xs">
                          {inspectorCard.tools.length ? (
                            inspectorCard.tools.map((tool) => (
                              <Card
                                key={tool.name}
                                withBorder
                                radius="md"
                                padding="md"
                                style={{
                                  cursor: "pointer",
                                  borderColor: selectedInspectorToolName === tool.name ? "var(--mantine-color-blue-6)" : undefined,
                                }}
                                onClick={() => setSelectedInspectorToolName(tool.name)}
                              >
                                <Stack gap={4}>
                                  <Group justify="space-between" align="center">
                                    <Text fw={600}>{tool.name}</Text>
                                    <Badge variant="light">Tool</Badge>
                                  </Group>
                                  <Text size="sm" c="dimmed">
                                    {tool.description || "No description"}
                                  </Text>
                                </Stack>
                              </Card>
                            ))
                          ) : (
                            <Text size="sm" c="dimmed">
                              This MCP server did not expose any tools.
                            </Text>
                          )}
                        </Stack>
                      </ScrollArea>
                    </>
                  ) : (
                    <Stack justify="center" align="center" style={{ flex: 1 }}>
                      <Text size="sm" c="dimmed">
                        Connect to a target to inspect its server card.
                      </Text>
                    </Stack>
                  )}
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <Stack style={{ minHeight: 0, flex: 1 }}>
                  <Group justify="space-between" align="center">
                    <div>
                      <Title order={5}>Tool Runner</Title>
                      <Text size="sm" c="dimmed">
                        Choose a tool, adjust JSON arguments, and invoke it directly.
                      </Text>
                    </div>
                    {selectedInspectorTool ? <Badge variant="light">{selectedInspectorTool.name}</Badge> : null}
                  </Group>

                  <Select
                    label="Tool"
                    placeholder="Choose a tool"
                    data={inspectorToolOptions}
                    value={selectedInspectorToolName}
                    onChange={setSelectedInspectorToolName}
                    disabled={!inspectorCard?.tools.length}
                    searchable
                  />

                  {selectedInspectorTool ? (
                    <Text size="sm" c="dimmed">
                      {selectedInspectorTool.description || "No tool description"}
                    </Text>
                  ) : null}

                  <Textarea
                    label="Arguments JSON"
                    minRows={10}
                    autosize
                    maxRows={18}
                    value={inspectorToolArgs}
                    onChange={(event) => setInspectorToolArgs(event.currentTarget.value)}
                    placeholder='{"key":"value"}'
                    disabled={!selectedInspectorTool}
                  />

                  <Group justify="end">
                    <Button loading={callingInspectorTool} onClick={() => void callInspectorTool()} disabled={!selectedInspectorTool}>
                      Run Tool
                    </Button>
                  </Group>

                  <Textarea
                    label="Result"
                    minRows={12}
                    autosize
                    maxRows={22}
                    value={inspectorToolResult}
                    readOnly
                    placeholder="Tool result will appear here."
                    style={{ flex: 1 }}
                  />
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        ) : null}

        {activeMenu === "Playground" ? (
          <Stack style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <div>
                    <Title order={4}>Playground</Title>
                    <Text size="sm" c="dimmed">
                      Test deployed Agents and MCP servers from one place.
                    </Text>
                  </div>
                  <Button
                    variant="light"
                    onClick={() => {
                      void Promise.all([loadAgents(), loadMcps(), loadCurrentLlmAccess()]);
                    }}
                  >
                    Refresh Targets
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <SimpleGrid
              cols={{ base: 1, xl: 3 }}
              spacing="md"
              style={{ alignItems: "stretch", flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}
            >
              <Stack style={{ minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
                <Card
                  withBorder
                  radius="md"
                  padding="lg"
                  style={{
                    cursor: "pointer",
                    borderColor:
                      playgroundMode === "dev" && playgroundTargetType === "agent" ? "var(--mantine-color-blue-6)" : undefined,
                  }}
                  onClick={() => {
                    setPlaygroundMode("dev");
                    setPlaygroundTargetType("agent");
                  }}
                >
                  <Stack gap={6}>
                    <Group justify="space-between" align="center">
                      <Text>Dev Agent</Text>
                      <Badge variant="light">A2A</Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Connect any external A2A URL and validate the agent card.
                    </Text>
                  </Stack>
                </Card>

                {runningAgents.length ? (
                  runningAgents.map((agent) => (
                    <Card
                      key={agent.id}
                      withBorder
                      radius="md"
                      padding="lg"
                      style={{
                        cursor: "pointer",
                        borderColor:
                          playgroundMode === "deployed" && playgroundTargetType === "agent" && selectedPlaygroundAgentId === agent.id
                            ? "var(--mantine-color-blue-6)"
                            : undefined,
                      }}
                      onClick={() => {
                        setPlaygroundMode("deployed");
                        setPlaygroundTargetType("agent");
                        setSelectedPlaygroundAgentId(agent.id);
                      }}
                    >
                      <Stack gap={6}>
                        <Group justify="space-between" align="center">
                          <Text>{agent.agentName}</Text>
                          <Badge variant="light">{agent.status}</Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {agent.description || "No description"}
                        </Text>
                        <Text size="sm">{agent.id}</Text>
                      </Stack>
                    </Card>
                  ))
                ) : (
                  <Paper withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed">
                      No running agents available.
                    </Text>
                  </Paper>
                )}

                {runningMcps.length ? (
                  runningMcps.map((mcp) => (
                    <Card
                      key={mcp.id}
                      withBorder
                      radius="md"
                      padding="lg"
                      style={{
                        cursor: "pointer",
                        borderColor:
                          playgroundMode === "deployed" && playgroundTargetType === "mcp" && selectedPlaygroundMcpId === mcp.id
                            ? "var(--mantine-color-blue-6)"
                            : undefined,
                      }}
                      onClick={() => {
                        setPlaygroundMode("deployed");
                        setPlaygroundTargetType("mcp");
                        setSelectedPlaygroundMcpId(mcp.id);
                      }}
                    >
                      <Stack gap={6}>
                        <Group justify="space-between" align="center">
                          <Text>{mcp.mcpName}</Text>
                          <Badge variant="light">{mcp.status}</Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {mcp.description || "No description"}
                        </Text>
                        <Text size="sm">{mcp.id}</Text>
                      </Stack>
                    </Card>
                  ))
                ) : (
                  <Paper withBorder p="md" radius="md">
                    <Text size="sm" c="dimmed">
                      No running MCP servers available.
                    </Text>
                  </Paper>
                )}
              </Stack>

              <Paper
                withBorder
                p="md"
                radius="md"
                style={{ gridColumn: "span 2", display: "flex", minHeight: 0, height: "100%", overflow: "hidden" }}
              >
                {playgroundMode === "dev" && playgroundTargetType === "agent" ? (
                  <Stack style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <Group justify="space-between" align="center">
                      <div>
                        <Title order={4}>Dev A2A Test</Title>
                        <Text size="sm" c="dimmed">
                          Connect to an external A2A endpoint, inspect its agent card, and run a live chat test.
                        </Text>
                      </div>
                      <Badge variant="light">A2A</Badge>
                    </Group>

                    <Group align="end">
                      <TextInput
                        label="A2A URL"
                        placeholder="https://example.com"
                        value={devA2AUrl}
                        onChange={(event) => setDevA2AUrl(event.currentTarget.value)}
                        style={{ flex: 1 }}
                      />
                      <Button loading={connectingDevAgent} onClick={() => void connectDevAgent()}>
                        Connect
                      </Button>
                    </Group>

                    {devAgentCard ? (
                      <Paper withBorder p="md" radius="md">
                        <Stack gap={6}>
                          <Text>{typeof devAgentCard.name === "string" && devAgentCard.name ? devAgentCard.name : "External Agent"}</Text>
                          <Text size="sm" c="dimmed">
                            {typeof devAgentCard.description === "string" && devAgentCard.description
                              ? devAgentCard.description
                              : "No description"}
                          </Text>
                          <Text size="sm">Agent Card: {devAgentCardUrl}</Text>
                        </Stack>
                      </Paper>
                    ) : null}

                    <Paper withBorder p="md" radius="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                      <div ref={devPlaygroundViewportRef} style={{ height: "100%", overflowY: "auto", paddingRight: 4 }}>
                      <Stack gap="sm">
                        {devPlaygroundMessages.length ? (
                          devPlaygroundMessages.map((message) => (
                            <Paper
                              key={message.id}
                              p="sm"
                              radius="md"
                              withBorder
                              style={{
                                marginLeft: message.role === "user" ? "auto" : undefined,
                                maxWidth: "85%",
                                background: message.role === "user" ? "rgba(12, 74, 110, 0.08)" : undefined,
                              }}
                            >
                              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                {message.role === "user"
                                  ? "You"
                                  : typeof devAgentCard?.name === "string" && devAgentCard.name
                                    ? devAgentCard.name
                                    : "Agent"}
                              </Text>
                              {message.role === "user" ? (
                                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                                  {message.content}
                                </Text>
                              ) : (
                                renderMarkdownContent(message.content)
                              )}
                            </Paper>
                          ))
                        ) : (
                          <Text size="sm" c="dimmed">
                            Connect an A2A URL and start a conversation.
                          </Text>
                        )}
                      </Stack>
                      </div>
                    </Paper>

                    <Textarea
                      label="Message"
                      minRows={4}
                      autosize
                      maxRows={10}
                      value={playgroundInput}
                      onChange={(event) => setPlaygroundInput(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.ctrlKey && event.key === "Enter") {
                          event.preventDefault();
                          void sendPlaygroundMessage();
                        }
                      }}
                      placeholder="Ask this agent something..."
                      description="Press Ctrl+Enter to send."
                    />
                    <Group justify="end">
                      <Button loading={sendingPlaygroundMessage} onClick={() => void sendPlaygroundMessage()}>
                        Send
                      </Button>
                    </Group>
                  </Stack>
                ) : playgroundMode === "deployed" && playgroundTargetType === "agent" && selectedPlaygroundAgent ? (
                  <Stack style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <Group justify="space-between" align="center">
                      <div>
                        <Title order={4}>{selectedPlaygroundAgent.agentName}</Title>
                        <Text size="sm" c="dimmed">
                          {selectedPlaygroundAgent.endpointUrl}
                        </Text>
                      </div>
                      <Badge variant="light">A2A</Badge>
                    </Group>

                    <Paper withBorder p="md" radius="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                      <div ref={deployedPlaygroundViewportRef} style={{ height: "100%", overflowY: "auto", paddingRight: 4 }}>
                      <Stack gap="sm">
                        {currentPlaygroundMessages.length ? (
                          currentPlaygroundMessages.map((message) => (
                            <Paper
                              key={message.id}
                              p="sm"
                              radius="md"
                              withBorder
                              style={{
                                marginLeft: message.role === "user" ? "auto" : undefined,
                                maxWidth: "85%",
                                background: message.role === "user" ? "rgba(12, 74, 110, 0.08)" : undefined,
                              }}
                            >
                              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                {message.role === "user" ? "You" : selectedPlaygroundAgent.agentName}
                              </Text>
                              {message.role === "user" ? (
                                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                                  {message.content}
                                </Text>
                              ) : (
                                renderMarkdownContent(message.content)
                              )}
                            </Paper>
                          ))
                        ) : (
                          <Text size="sm" c="dimmed">
                            Start a conversation with this agent.
                          </Text>
                        )}
                      </Stack>
                      </div>
                    </Paper>

                    <Textarea
                      label="Message"
                      minRows={4}
                      autosize
                      maxRows={10}
                      value={playgroundInput}
                      onChange={(event) => setPlaygroundInput(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.ctrlKey && event.key === "Enter") {
                          event.preventDefault();
                          void sendPlaygroundMessage();
                        }
                      }}
                      placeholder="Ask this agent something..."
                      description="Press Ctrl+Enter to send."
                    />
                    <Group justify="end">
                      <Button loading={sendingPlaygroundMessage} onClick={() => void sendPlaygroundMessage()}>
                        Send
                      </Button>
                    </Group>
                  </Stack>
                ) : playgroundMode === "deployed" && playgroundTargetType === "mcp" && selectedPlaygroundMcp ? (
                  <Stack style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <Group justify="space-between" align="center">
                      <div>
                        <Title order={4}>{selectedPlaygroundMcp.mcpName}</Title>
                        <Text size="sm" c="dimmed">
                          {selectedPlaygroundMcp.endpointUrl}
                        </Text>
                      </div>
                      <Badge variant="light">MCP</Badge>
                    </Group>

                    <Paper withBorder p="md" radius="md" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                      <LoadingOverlay visible={loadingSelectedMcpCard} overlayProps={{ radius: "sm", blur: 1 }} />
                      <div ref={deployedPlaygroundViewportRef} style={{ height: "100%", overflowY: "auto", paddingRight: 4 }}>
                        <Stack gap="sm">
                          {currentMcpPlaygroundMessages.length ? (
                            currentMcpPlaygroundMessages.map((message) => (
                              <Paper
                                key={message.id}
                                p="sm"
                                radius="md"
                                withBorder
                                style={{
                                  marginLeft: message.role === "user" ? "auto" : undefined,
                                  maxWidth: "85%",
                                  background: message.role === "user" ? "rgba(12, 74, 110, 0.08)" : undefined,
                                }}
                              >
                                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                  {message.role === "user" ? "You" : selectedPlaygroundMcp.mcpName}
                                </Text>
                                {message.role === "user" ? (
                                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                                    {message.content}
                                  </Text>
                                ) : (
                                  renderMarkdownContent(message.content)
                                )}
                              </Paper>
                            ))
                          ) : (
                            <Text size="sm" c="dimmed">
                              Start a tool-calling test with this MCP server.
                            </Text>
                          )}
                        </Stack>
                      </div>
                    </Paper>

                    <Stack gap={4}>
                      <Group justify="space-between" align="flex-end" wrap="nowrap">
                        <Stack gap={0}>
                          <Text size="sm" fw={500}>
                            Message
                          </Text>
                          <Text size="xs" c="dimmed">
                            Press Ctrl+Enter to send.
                          </Text>
                        </Stack>
                        <Select
                          data={mcpPlaygroundModelOptions}
                          value={selectedMcpPlaygroundModel}
                          onChange={setSelectedMcpPlaygroundModel}
                          searchable
                          placeholder="Model"
                          style={{ width: 260 }}
                        />
                      </Group>
                      <Textarea
                        minRows={4}
                        autosize
                        maxRows={10}
                        value={playgroundInput}
                        onChange={(event) => setPlaygroundInput(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.ctrlKey && event.key === "Enter") {
                            event.preventDefault();
                            void sendPlaygroundMessage();
                          }
                        }}
                        placeholder="Ask this MCP server to use its tools..."
                      />
                    </Stack>
                    <Group justify="end">
                      <Button loading={sendingPlaygroundMessage} onClick={() => void sendPlaygroundMessage()}>
                        Send
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <Stack justify="center" align="center" style={{ flex: 1, minHeight: 0 }}>
                    <Text size="sm" c="dimmed">
                      Select a target on the left to start testing.
                    </Text>
                  </Stack>
                )}
              </Paper>
            </SimpleGrid>
          </Stack>
        ) : null}

      </Stack>

      <Modal opened={agentModalOpen} onClose={() => setAgentModalOpen(false)} title="Deploy Agent" centered>
        <Stack>
          <TextInput label="Agent Name" value={agentName} onChange={(event) => setAgentName(event.currentTarget.value)} />
          <TextInput
            label="Agent Description"
            value={agentDescription}
            onChange={(event) => setAgentDescription(event.currentTarget.value)}
          />
          <Select label="Repository" data={repoOptions} value={agentRepoId} onChange={setAgentRepoId} searchable />
          <Select label="LITELLM_MODEL" data={agentModelOptions} value={agentModelName} onChange={setAgentModelName} searchable />
          {selectedAgentModel ? (
            <Text size="sm" c={selectedAgentModel.isDefault ? "dimmed" : "orange"}>
              {selectedAgentModel.isDefault
                ? "Default model: build succeeds and deployment starts immediately."
                : "Non-default model: build runs first, then admin approval is required before deployment."}
            </Text>
          ) : null}
          <TextInput
            label="Dockerfile Path"
            value={agentDockerfilePath}
            onChange={(event) => setAgentDockerfilePath(event.currentTarget.value)}
          />
          <Button loading={deployingAgent} disabled={!hasServingCapacity} onClick={() => void deployAgent()}>
            Deploy Agent
          </Button>
        </Stack>
      </Modal>

      <Modal opened={mcpModalOpen} onClose={() => setMcpModalOpen(false)} title="Deploy MCP" centered>
        <Stack>
          <TextInput label="MCP Name" value={mcpName} onChange={(event) => setMcpName(event.currentTarget.value)} />
          <TextInput
            label="MCP Description"
            value={mcpDescription}
            onChange={(event) => setMcpDescription(event.currentTarget.value)}
          />
          <Select label="Repository" data={repoOptions} value={mcpRepoId} onChange={setMcpRepoId} searchable />
          <Checkbox
            label="Use internal LLM"
            checked={mcpUseLlm}
            onChange={(event) => setMcpUseLlm(event.currentTarget.checked)}
          />
          {mcpUseLlm ? (
            <>
              <Select label="LITELLM_MODEL" data={agentModelOptions} value={mcpModelName} onChange={setMcpModelName} searchable />
              {selectedMcpModel ? (
                <Text size="sm" c={selectedMcpModel.isDefault ? "dimmed" : "orange"}>
                  {selectedMcpModel.isDefault
                    ? "Default model: build succeeds and deployment starts immediately."
                    : "Non-default model: build runs first, then admin approval is required before deployment."}
                </Text>
              ) : null}
            </>
          ) : null}
          <TextInput
            label="Dockerfile Path"
            value={mcpDockerfilePath}
            onChange={(event) => setMcpDockerfilePath(event.currentTarget.value)}
          />
          <Button loading={deployingMcp} disabled={!hasMcpServingCapacity} onClick={() => void deployMcp()}>
            Deploy MCP
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={logsTarget !== null}
        onClose={() => setLogsTarget(null)}
        title={logsTarget ? `${logsTarget.agentName} logs` : "Agent logs"}
        size="90%"
        centered
      >
        <Stack>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              Logs refresh automatically every 3 seconds.
            </Text>
            <Badge variant="light" color={loadingAgentLogs ? "blue" : "gray"}>
              {loadingAgentLogs ? "Syncing" : "Live"}
            </Badge>
          </Group>
          <Paper withBorder p="md">
            <ScrollArea viewportRef={agentLogsViewportRef} h={680} offsetScrollbars>
              <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {agentLogs || "No logs yet."}
              </Text>
            </ScrollArea>
          </Paper>
        </Stack>
      </Modal>

      <Modal
        opened={mcpLogsTarget !== null}
        onClose={() => setMcpLogsTarget(null)}
        title={mcpLogsTarget ? `${mcpLogsTarget.mcpName} logs` : "MCP logs"}
        size="90%"
        centered
      >
        <Stack>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              Logs refresh automatically every 3 seconds.
            </Text>
            <Badge variant="light" color={loadingMcpLogs ? "blue" : "gray"}>
              {loadingMcpLogs ? "Syncing" : "Live"}
            </Badge>
          </Group>
          <Paper withBorder p="md">
            <ScrollArea viewportRef={mcpLogsViewportRef} h={680} offsetScrollbars>
              <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {mcpLogs || "No logs yet."}
              </Text>
            </ScrollArea>
          </Paper>
        </Stack>
      </Modal>

      <Modal
        opened={workspaceModal !== null}
        onClose={() => setWorkspaceModal(null)}
        title={workspaceModal?.workspace ? "Edit VS Code Workspace" : "Create VS Code Workspace"}
        centered
      >
        <Stack>
          <Text size="sm">
            Repo: <strong>{workspaceModal?.repo.repoName}</strong>
          </Text>
          <Select
            label="Runtime"
            data={runtimeOptions}
            value={workspaceRuntime}
            onChange={setWorkspaceRuntime}
            allowDeselect={false}
          />
          <Button loading={creatingWorkspace} onClick={() => void handleWorkspaceSubmit()}>
            {workspaceModal?.workspace ? "Save and Open" : "Create and Open"}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={workspaceDeleteTarget !== null}
        onClose={() => setWorkspaceDeleteTarget(null)}
        title="Delete Workspace"
        centered
      >
        <Stack>
          <Text size="sm">
            Delete workspace for <strong>{workspaceDeleteTarget?.repoName}</strong>? This removes the current VS Code
            workspace and its persistent volume.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setWorkspaceDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={workspaceDeleteTarget ? deletingWorkspaceId === workspaceDeleteTarget.id : false}
              onClick={() => (workspaceDeleteTarget ? void deleteWorkspace(workspaceDeleteTarget) : undefined)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Project" centered>
        <Stack>
          <Text size="sm">
            Delete <strong>{project?.name}</strong>? This cannot be undone.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={deletingProject} onClick={() => void deleteProject()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={editProjectOpen} onClose={() => setEditProjectOpen(false)} title="Edit Project" centered>
        <Stack>
          <TextInput label="Project Name" value={editName} onChange={(event) => setEditName(event.currentTarget.value)} />
          <TextInput
            label="Project Description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.currentTarget.value)}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setEditProjectOpen(false)}>
              Cancel
            </Button>
            <Button loading={savingProject} onClick={() => void updateProject()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={memberModalOpen} onClose={() => setMemberModalOpen(false)} title="Add Project Member" centered>
        <Stack>
          <Select
            label="Portal User"
            placeholder="Select user"
            data={availableUsers.map((user) => ({
              value: user.id,
              label: `${user.displayName} (${user.email})`,
            }))}
            value={selectedUserId}
            onChange={setSelectedUserId}
            searchable
          />
          <Select
            label="Role"
            data={[
              { value: "member", label: "member" },
              { value: "manager", label: "manager" },
            ]}
            value={selectedRole}
            onChange={setSelectedRole}
            allowDeselect={false}
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setMemberModalOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updatingMembers}
              onClick={async () => {
                await addMember();
                setMemberModalOpen(false);
              }}
            >
              Add Member
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppFrame>
  );
}
