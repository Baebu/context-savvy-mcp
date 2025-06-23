// src/infrastructure/di/container-initializer.ts - Updated with Intelligent Search Tools
import type { Container } from 'inversify';
import type { IToolRegistry } from '../../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../../core/interfaces/prompt-registry.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { DatabaseAdapter } from '../adapters/database.adapter.js';

// Tools
import { ReadFileTool, ListDirectoryTool, WriteFileTool } from '../../application/tools/file-operations.tool.js';

// Enhanced File Operations Tools
import {
  SearchFilesTool,
  FindFilesTool,
  ContentEditFileTool,
  MoveFileTool,
  RecycleFileTool,
  RestoreFromRecycleTool,
  ListRecycleBinTool,
  EmptyRecycleBinTool
} from '../../application/tools/enhanced-file-operations.tool.js';

// Backup Management Tools
import {
  ListBackupsTool,
  BackupStatsTool,
  RestoreBackupTool,
  ViewBackupTool,
  CleanupBackupsTool
} from '../../application/tools/backup-management.tool.js';

// Other Tools
import { ExecuteCommandTool } from '../../application/tools/command-execution.tool.js';

// Database operation tools (now consolidated and enhanced)
import {
  StoreContextTool, // Now represents the enhanced version
  GetContextTool
} from '../../application/tools/database-operations.tool.js'; // Consolidated path

import {
  CreateSmartPathTool,
  ExecuteSmartPathTool,
  ListSmartPathsTool
} from '../../application/tools/smart-path.tool.js';

import { ParseFileTool } from '../../application/tools/file-parsing.tool.js';
import { SecurityDiagnosticsTool } from '../../application/tools/security-diagnostics.tool.js';
import { ProcessManagementTool } from '../../application/tools/process-management.tool.js';

// New Consolidated Tools
import { GetSystemHealthTool } from '../../application/tools/system-health.tool.js';
import { GetProjectOverviewTool } from '../../application/tools/project-overview.tool.js';

// Workspace Tools
import {
  CreateWorkspaceTool,
  ListWorkspacesTool,
  SwitchWorkspaceTool,
  SyncWorkspaceTool,
  TrackFileTool,
  DeleteWorkspaceTool,
  ExportWorkspaceTemplateTool
} from '../../application/tools/workspace-management.tools.js';

// Project Creation and Management Tools
import { CreateProjectTool, ListProjectsTool } from '../../application/tools/project-creation.tool.js';
import {
  InitProjectsDirectoryTool,
  GetProjectsConfigTool,
  UpdateProjectsConfigTool
} from '../../application/tools/projects-config.tool.js';

// Semantic Tools
import {
  SemanticSearchTool,
  FindRelatedContextTool,
  CreateContextRelationshipTool,
  UpdateEmbeddingsTool
} from '../../application/tools/semantic-search.tool.js';

// Intelligent Search Tools (Phase 1 - Token Efficiency)
import { CompactSearchTool, ExpandResultTool, PrecisionEditTool } from '../../application/tools/compact-search.tool.js';

// Phase 3: Automatic State Management Tools
import {
  FindActiveTasksTool,
  TaskCompletionDetectionTool,
  TaskGenealogyTool,
  UpdateTaskProgressTool
} from '../../application/tools/task-state-management.tool.js';

// Enhanced Task Management Tools
import {
  CreateTaskTool,
  ListTasksTool,
  UpdateTaskTool,
  CompleteTaskTool,
  TaskTemplatesTool
} from '../../application/tools/task-management-v2.tool.js';
import {
  PanicStorageTool,
  MinimalHandoffTool,
  RecoverFromPanicTool,
  BackupRedundancyTool
} from '../../application/tools/emergency-protocols.tool.js';

// Phase 4: Intelligent Batching Tools
import {
  BatchContextOperationsTool,
  WorkflowExecutorTool,
  CascadeStorageTool,
  BulkRelationshipsTool,
  BatchingStatsTool
} from '../../application/tools/intelligent-batching.tool.js';
import {
  SmartPathEvolutionTool,
  AdaptiveSmartPathsTool,
  WorkflowTemplatesTool
} from '../../application/tools/smart-path-evolution.tool.js';

// Phase 5: Advanced Discovery Tools
// Phase 6: Knowledge Management Tools - Currently not registered
// import {
//   VersionCacheManagementTool,
//   KnowledgeFreshnessCheckTool,
//   DependencyTrackingTool,
//   UpdateNotificationsTool,
//   FileChangeContextTool,
//   AutoContextOnFileOpsTool,
//   FileHistoryContextTool
// } from '../../application/tools/knowledge-management.tool.js';

// Phase 7: Advanced Features Tools
import {
  CompressionAlgorithmsTool,
  TokenBudgetOptimizationTool,
  ContextDeduplicationTool,
  ArchiveOldContextsTool,
  ContextTemplatesLibraryTool,
  AdaptiveWorkflowCreationTool,
  AutoSmartPathCreationTool
} from '../../application/tools/advanced-features.tool.js';

// Phase 8: Integration Testing Tool
import { IntegrationTestTool } from '../../application/tools/integration-test.tool.js';

// Autonomous Control Tools
import {
  EnableAutonomousMonitoringTool,
  DisableAutonomousMonitoringTool,
  GetAutonomousStatusTool,
  TriggerMaintenanceTool
} from '../../application/tools/autonomous-control.tool.js';

// Workspace Persistence Tools
import { workspacePersistenceTools } from '../../application/tools/workspace-persistence.tool.js';

// Removed: EnhancedStoreContextTool and EnhancedQueryContextTool imports

// Resources
import { ProjectFilesResource } from '../../application/resources/project-files.resource.js';

// Prompts
import { ContextSummaryPrompt } from '../../application/prompts/context-summary.prompt.js';

import { logger } from '../../utils/logger.js';

export class ContainerInitializer {
  static async initialize(container: Container): Promise<void> {
    logger.info('Initializing container with intelligent search and enhanced process management...');

    // Ensure Database Migrations are applied first
    const databaseHandler = container.get<IDatabaseHandler>('DatabaseHandler') as DatabaseAdapter;
    if (typeof databaseHandler.applyInitialMigrations === 'function') {
      await databaseHandler.applyInitialMigrations();
    } else {
      logger.warn(
        'DatabaseAdapter does not have applyInitialMigrations method. Skipping automatic semantic migration during DI initialization.'
      );
    }

    // Initialize semantic services
    await this.initializeSemanticServices(container);

    // Initialize and register tools
    await this.initializeTools(container);

    // Initialize and register resources
    await this.initializeResources(container);

    // Initialize and register prompts
    await this.initializePrompts(container);

    logger.info('Container initialization complete with intelligent search and enhanced process management');
  }

  private static async initializeSemanticServices(container: Container): Promise<void> {
    try {
      logger.info('Initializing semantic services...');
      const embeddingService = container.get<IEmbeddingService>('EmbeddingService');
      await embeddingService.initialize();
      logger.info('Semantic services initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize semantic services');
      // Don't throw - allow server to start without semantic features
    }
  }

  private static async initializeTools(container: Container): Promise<void> {
    const toolRegistry = container.get<IToolRegistry>('ToolRegistry');

    // File operations (consent removed)
    toolRegistry.register(new ReadFileTool());
    toolRegistry.register(new WriteFileTool());
    toolRegistry.register(new ListDirectoryTool());

    // Enhanced file operations (consolidated)
    toolRegistry.register(container.get<SearchFilesTool>(SearchFilesTool));
    toolRegistry.register(container.get<FindFilesTool>(FindFilesTool));
    toolRegistry.register(container.get<ContentEditFileTool>(ContentEditFileTool));

    // New file operations (move and recycle system)
    toolRegistry.register(container.get<MoveFileTool>(MoveFileTool));
    toolRegistry.register(container.get<RecycleFileTool>(RecycleFileTool));
    toolRegistry.register(container.get<RestoreFromRecycleTool>(RestoreFromRecycleTool));
    toolRegistry.register(container.get<ListRecycleBinTool>(ListRecycleBinTool));
    toolRegistry.register(container.get<EmptyRecycleBinTool>(EmptyRecycleBinTool));

    // Backup management tools (NEW)
    toolRegistry.register(container.get<ListBackupsTool>(ListBackupsTool));
    toolRegistry.register(container.get<BackupStatsTool>(BackupStatsTool));
    toolRegistry.register(container.get<RestoreBackupTool>(RestoreBackupTool));
    toolRegistry.register(container.get<ViewBackupTool>(ViewBackupTool));
    toolRegistry.register(container.get<CleanupBackupsTool>(CleanupBackupsTool));

    // Command execution (consent removed)
    toolRegistry.register(new ExecuteCommandTool());

    // Process management (NEW)
    toolRegistry.register(container.get<ProcessManagementTool>(ProcessManagementTool));

    // Database operations (consolidated and enhanced by default)
    toolRegistry.register(container.get<StoreContextTool>(StoreContextTool)); // Use container.get for injectable classes
    toolRegistry.register(new GetContextTool()); // GetContextTool has no injected dependencies in its constructor, so 'new' is fine

    // Removed: QueryContextTool (consolidated into semantic search), EnhancedStoreContextTool and EnhancedQueryContextTool registrations

    // Semantic search tools
    toolRegistry.register(container.get<SemanticSearchTool>(SemanticSearchTool));
    toolRegistry.register(container.get<FindRelatedContextTool>(FindRelatedContextTool));
    toolRegistry.register(container.get<CreateContextRelationshipTool>(CreateContextRelationshipTool));
    toolRegistry.register(container.get<UpdateEmbeddingsTool>(UpdateEmbeddingsTool));

    // Intelligent Search Tools (Phase 1 - Token Efficiency) - NEW!
    toolRegistry.register(container.get<CompactSearchTool>(CompactSearchTool));
    toolRegistry.register(container.get<ExpandResultTool>(ExpandResultTool));
    toolRegistry.register(container.get<PrecisionEditTool>(PrecisionEditTool));
    logger.info('✅ Intelligent Search Tools registered (90% token reduction enabled)');

    // Phase 3: Automatic State Management Tools
    toolRegistry.register(container.get<FindActiveTasksTool>(FindActiveTasksTool));
    toolRegistry.register(container.get<TaskCompletionDetectionTool>(TaskCompletionDetectionTool));
    toolRegistry.register(container.get<TaskGenealogyTool>(TaskGenealogyTool));
    toolRegistry.register(container.get<UpdateTaskProgressTool>(UpdateTaskProgressTool));

    // Enhanced Task Management Tools (NEW)
    toolRegistry.register(container.get<CreateTaskTool>(CreateTaskTool));
    toolRegistry.register(container.get<ListTasksTool>(ListTasksTool));
    toolRegistry.register(container.get<UpdateTaskTool>(UpdateTaskTool));
    toolRegistry.register(container.get<CompleteTaskTool>(CompleteTaskTool));
    toolRegistry.register(container.get<TaskTemplatesTool>(TaskTemplatesTool));

    // Emergency Protocol Tools
    toolRegistry.register(container.get<PanicStorageTool>(PanicStorageTool));
    toolRegistry.register(container.get<MinimalHandoffTool>(MinimalHandoffTool));
    toolRegistry.register(container.get<RecoverFromPanicTool>(RecoverFromPanicTool));
    toolRegistry.register(container.get<BackupRedundancyTool>(BackupRedundancyTool));

    // Phase 4: Intelligent Batching Tools
    toolRegistry.register(container.get<BatchContextOperationsTool>(BatchContextOperationsTool));
    toolRegistry.register(container.get<WorkflowExecutorTool>(WorkflowExecutorTool));
    toolRegistry.register(container.get<CascadeStorageTool>(CascadeStorageTool));
    toolRegistry.register(container.get<BulkRelationshipsTool>(BulkRelationshipsTool));
    toolRegistry.register(container.get<BatchingStatsTool>(BatchingStatsTool));

    // Smart Path Evolution Tools
    toolRegistry.register(container.get<SmartPathEvolutionTool>(SmartPathEvolutionTool));
    toolRegistry.register(container.get<AdaptiveSmartPathsTool>(AdaptiveSmartPathsTool));
    toolRegistry.register(container.get<WorkflowTemplatesTool>(WorkflowTemplatesTool));
    // SemanticStatsTool removed - functionality consolidated into system-health.tool.ts

    // Smart path operations
    toolRegistry.register(new CreateSmartPathTool());
    toolRegistry.register(new ExecuteSmartPathTool());
    toolRegistry.register(new ListSmartPathsTool());

    // Workspace management
    toolRegistry.register(new CreateWorkspaceTool());
    toolRegistry.register(new ListWorkspacesTool());

    // Phase 7: Advanced Features Tools (Compression & Optimization + Advanced Templates)
    toolRegistry.register(container.get<CompressionAlgorithmsTool>(CompressionAlgorithmsTool));
    toolRegistry.register(container.get<TokenBudgetOptimizationTool>(TokenBudgetOptimizationTool));
    toolRegistry.register(container.get<ContextDeduplicationTool>(ContextDeduplicationTool));
    toolRegistry.register(container.get<ArchiveOldContextsTool>(ArchiveOldContextsTool));
    toolRegistry.register(container.get<ContextTemplatesLibraryTool>(ContextTemplatesLibraryTool));
    toolRegistry.register(container.get<AdaptiveWorkflowCreationTool>(AdaptiveWorkflowCreationTool));
    toolRegistry.register(container.get<AutoSmartPathCreationTool>(AutoSmartPathCreationTool));

    // Phase 8: Integration Testing Tool
    toolRegistry.register(container.get<IntegrationTestTool>(IntegrationTestTool));

    // Autonomous Control Tools
    toolRegistry.register(container.get<EnableAutonomousMonitoringTool>(EnableAutonomousMonitoringTool));
    toolRegistry.register(container.get<DisableAutonomousMonitoringTool>(DisableAutonomousMonitoringTool));
    toolRegistry.register(container.get<GetAutonomousStatusTool>(GetAutonomousStatusTool));
    toolRegistry.register(container.get<TriggerMaintenanceTool>(TriggerMaintenanceTool));

    // Workspace Persistence Tools
    workspacePersistenceTools.forEach(ToolClass => {
      toolRegistry.register(container.get<any>(ToolClass));
    });

    toolRegistry.register(new SwitchWorkspaceTool());
    toolRegistry.register(new SyncWorkspaceTool());
    toolRegistry.register(new TrackFileTool());
    toolRegistry.register(new DeleteWorkspaceTool());
    toolRegistry.register(new ExportWorkspaceTemplateTool());

    // Project creation and management
    toolRegistry.register(container.get<CreateProjectTool>(CreateProjectTool));
    toolRegistry.register(container.get<ListProjectsTool>(ListProjectsTool));
    toolRegistry.register(container.get<InitProjectsDirectoryTool>(InitProjectsDirectoryTool));
    toolRegistry.register(container.get<GetProjectsConfigTool>(GetProjectsConfigTool));
    toolRegistry.register(container.get<UpdateProjectsConfigTool>(UpdateProjectsConfigTool));
    // GetWorkspaceStatsTool removed - functionality consolidated into system-health.tool.ts

    // File parsing
    toolRegistry.register(container.get<ParseFileTool>(ParseFileTool));

    // System monitoring (consolidated)
    toolRegistry.register(new SecurityDiagnosticsTool()); // Now includes enhanced security functionality
    toolRegistry.register(container.get<GetSystemHealthTool>(GetSystemHealthTool)); // Consolidated system health tool
    toolRegistry.register(container.get<GetProjectOverviewTool>(GetProjectOverviewTool)); // New project overview tool
    // GetMetricsTool, DatabaseHealthTool, EnhancedSecurityDiagnosticsTool - functionality consolidated into system-health.tool.ts

    try {
      const allTools = await toolRegistry.getAllTools();
      logger.info(
        `✅ Registered ${allTools.length} tools including intelligent search and process management capabilities`
      );
    } catch (error) {
      logger.warn({ error }, 'Could not get tool count, but registration completed');
    }
  }

  private static async initializeResources(container: Container): Promise<void> {
    const resourceRegistry = container.get<IResourceRegistry>('ResourceRegistry');

    // Project files
    resourceRegistry.register(container.get<ProjectFilesResource>(ProjectFilesResource));

    try {
      const allResources = await resourceRegistry.getAllResources();
      logger.info(`Registered ${allResources.length} resources`);
    } catch (error) {
      logger.warn({ error }, 'Could not get resource count, but registration completed');
    }
  }

  private static async initializePrompts(container: Container): Promise<void> {
    const promptRegistry = container.get<IPromptRegistry>('PromptRegistry');

    // Context summary
    promptRegistry.register(new ContextSummaryPrompt());

    try {
      const allPrompts = await promptRegistry.getAllPrompts();
      logger.info(`Registered ${allPrompts.length} prompts`);
    } catch (error) {
      logger.warn({ error }, 'Could not get prompt count, but registration completed');
    }
  }
}
