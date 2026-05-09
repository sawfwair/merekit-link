export type CommandRisk = 'read' | 'write' | 'destructive' | 'external';
export type CommandAuth = 'none' | 'session' | 'workspace' | 'token';
export type FlagValue = string | boolean;
export type Flags = Record<string, FlagValue>;
export type JsonRecord = Record<string, unknown>;

export type ManifestCommand = {
	id: string;
	path: string[];
	summary: string;
	auth: CommandAuth;
	risk: CommandRisk;
	supportsJson: boolean;
	supportsData: boolean;
	requiresYes: boolean;
	requiresConfirm: boolean;
	positionals: string[];
	flags: string[];
	auditDefault?: boolean;
};

export type AppCommandManifest = {
	schemaVersion: 1;
	app: string;
	namespace: string;
	aliases: string[];
	auth: { kind: 'none' };
	baseUrlEnv: string[];
	sessionPath: null;
	globalFlags: string[];
	commands: ManifestCommand[];
};

export type PluginDefinition = {
	kinds: readonly string[];
	writes: readonly string[];
};

export type IntegrationConfig = {
	plugin: string;
	workspace?: string;
	baseUrl?: string;
	tokenEnv?: string;
};

export type SurfaceConfig = {
	integration: string;
	plugin?: string;
	kind: string;
	id: string;
	name?: string;
	optional?: true;
	policy?: {
		writes: string[];
	};
};

export type ProjectConfig = {
	name: string;
	aliases: string[];
	surfaces: Record<string, SurfaceConfig>;
};

export type EntityConfig = {
	name: string;
	aliases: string[];
	projects: Record<string, ProjectConfig>;
};

export type LinkConfig = {
	from: string;
	to: string;
	label?: string;
};

export type LinkConfigFile = {
	schemaVersion: 1;
	integrations: Record<string, IntegrationConfig>;
	entities: Record<string, EntityConfig>;
	links: LinkConfig[];
};

export type ProjectContext = {
	entity: EntityConfig & { key: string };
	project: ProjectConfig & { key: string };
	surfaces: Record<string, SurfaceConfig>;
	integrations: Record<string, IntegrationConfig>;
	surface?: SurfaceConfig;
};

export type LoadedConfig = {
	path: string;
	config: LinkConfigFile;
};

export type SyncProjectTarget = {
	key: string;
	entityKey: string;
	projectKey: string;
	entity: EntityConfig;
	project: ProjectConfig;
};

export type MereProjectRecord = JsonRecord & {
	id?: unknown;
	title?: unknown;
	client?: unknown;
	attributes?: unknown;
	dateStart?: unknown;
};

export type ProjectsSyncProjectPlan = {
	key: string;
	entity: string;
	project: string;
	title: string;
	client: string;
	action: 'upsert';
	existingId: string | null;
	payload: JsonRecord;
};

export type ProjectsSyncLinkPlan = {
	projectKey: string;
	role: string;
	label: string;
	url: string;
	kind: string;
	payload: JsonRecord;
};

export type ProjectsSyncPlan = {
	apply: boolean;
	workspace: string;
	policySurface: string;
	projectCount: number;
	linkCount: number;
	projects: ProjectsSyncProjectPlan[];
	links: ProjectsSyncLinkPlan[];
};

export type WorkspaceSnapshotApp = {
	app?: string;
	namespace?: string;
	ok?: boolean;
};

export type WorkspaceSnapshot = {
	workspace?: string;
	apps: WorkspaceSnapshotApp[];
};
