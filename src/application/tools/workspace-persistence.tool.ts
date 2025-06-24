// src/application/tools/workspace-persistence.tool.ts
import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { WorkspacePersistenceService } from '../services/workspace-persistence.service.js';
import type { StartupSequenceService } from '../services/startup-sequence.service.js';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

// Schema definitions
const executeStartupRecoverySchema = z.object({}).describe('Execute startup recovery sequence');

const getWorkspaceRegistrySchema = z.object({}).describe('Get workspace registry');

const updateDirectoryAccessSchema = z.object({
  path: z.string().describe('Directory path to track')
});

const createDirectoryBookmarkSchema = z.object({
  path: z.string().describe('Directory path to bookmark'),
  manual: z.boolean().optional().describe('Whether this is a manual bookmark')
});

const getDirectoryBookmarksSchema = z.object({}).describe('Get directory bookmarks');

const discoverDirectoriesFromContextSchema = z.object({}).describe('Discover directories from context');

const getPersistenceConfigSchema = z.object({}).describe('Get persistence configuration');

// Execute Startup Recovery Tool
@injectable()
export class ExecuteStartupRecoveryTool implements IMCPTool<z.infer<typeof executeStartupRecoverySchema>> {
  name = 'execute_startup_recovery';
  description = 'Execute startup recovery sequence to restore workspace access after reboot';
  schema = executeStartupRecoverySchema;
  constructor(@inject('StartupSequenceService') private readonly startupService: StartupSequenceService) {}

  async execute(params: z.infer<typeof executeStartupRecoverySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const results = await this.startupService.executeStartupRecovery();

      const responseData = {
        message: 'Startup recovery sequence completed',
        results,
        summary: {
          totalSteps: results.length,
          successfulSteps: results.filter(r => r.success).length,
          failedSteps: results.filter(r => !r.success).length
        }
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Startup recovery failed');
      return {
        content: [
          {
            type: 'text',
            text: `Startup recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Get Workspace Registry Tool
@injectable()
export class GetWorkspaceRegistryTool implements IMCPTool<z.infer<typeof getWorkspaceRegistrySchema>> {
  name = 'get_workspace_registry';
  description = 'Get registry of recent workspaces and their access patterns';
  schema = getWorkspaceRegistrySchema;

  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  async execute(params: z.infer<typeof getWorkspaceRegistrySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const registry = await this.persistence.getWorkspaceRegistry();

      const responseData = {
        workspaces: registry,
        count: registry.length,
        message: `Found ${registry.length} workspaces in registry`
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get workspace registry');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get workspace registry: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Update Directory Access Tool
@injectable()
export class UpdateDirectoryAccessTool implements IMCPTool<z.infer<typeof updateDirectoryAccessSchema>> {
  name = 'update_directory_access';
  description = 'Track directory usage and expand safe zones';
  schema = updateDirectoryAccessSchema;

  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  async execute(params: z.infer<typeof updateDirectoryAccessSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      if (!params.path) {
        return {
          content: [
            {
              type: 'text',
              text: 'Path parameter is required'
            }
          ]
        };
      }

      await this.persistence.updateDirectoryAccess(params.path);

      const responseData = {
        message: `Updated directory access tracking for: ${params.path}`,
        path: params.path
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to update directory access');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update directory access: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Create Directory Bookmark Tool
@injectable()
export class CreateDirectoryBookmarkTool implements IMCPTool<z.infer<typeof createDirectoryBookmarkSchema>> {
  name = 'create_directory_bookmark';
  description = 'Create a bookmark for frequently accessed directory';
  schema = createDirectoryBookmarkSchema;

  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  async execute(params: z.infer<typeof createDirectoryBookmarkSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      if (!params.path) {
        return {
          content: [
            {
              type: 'text',
              text: 'Path parameter is required'
            }
          ]
        };
      }

      const id = await this.persistence.createDirectoryBookmark(params.path, params.manual || false);

      const responseData = {
        message: `Created directory bookmark: ${params.path}`,
        id,
        path: params.path,
        manual: params.manual || false
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create directory bookmark');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create directory bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Get Directory Bookmarks Tool
@injectable()
export class GetDirectoryBookmarksTool implements IMCPTool<z.infer<typeof getDirectoryBookmarksSchema>> {
  name = 'get_directory_bookmarks';
  description = 'Get list of bookmarked directories';
  schema = getDirectoryBookmarksSchema;

  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  async execute(params: z.infer<typeof getDirectoryBookmarksSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const bookmarks = await this.persistence.getDirectoryBookmarks();

      const responseData = {
        bookmarks,
        count: bookmarks.length,
        message: `Found ${bookmarks.length} directory bookmarks`
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get directory bookmarks');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get directory bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Discover Directories from Context Tool
@injectable()
export class DiscoverDirectoriesFromContextTool
  implements IMCPTool<z.infer<typeof discoverDirectoriesFromContextSchema>>
{
  name = 'discover_directories_from_context';
  description = 'Discover directories mentioned in context history';
  schema = discoverDirectoriesFromContextSchema;

  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  async execute(
    params: z.infer<typeof discoverDirectoriesFromContextSchema>,
    context: ToolContext
  ): Promise<ToolResult> {
    try {
      const directories = await this.persistence.discoverDirectoriesFromContext();

      const responseData = {
        directories,
        count: directories.length,
        message: `Discovered ${directories.length} directories from context`
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to discover directories from context');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to discover directories from context: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Get Persistence Config Tool
@injectable()
export class GetPersistenceConfigTool implements IMCPTool<z.infer<typeof getPersistenceConfigSchema>> {
  name = 'get_persistence_config';
  description = 'Get current workspace persistence configuration';
  schema = getPersistenceConfigSchema;

  async execute(params: z.infer<typeof getPersistenceConfigSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // This would typically read from config service
      const config = {
        enabled: true,
        autoRecovery: {
          enabled: true,
          autoExpandSafeZones: true,
          maxRecentDirectories: 20
        },
        startup: {
          sequence: ['expand_safe_zones_from_registry', 'auto_discover_directories', 'restore_last_workspace']
        }
      };

      const responseData = {
        config,
        message: 'Retrieved workspace persistence configuration'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to get persistence config');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get persistence config: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Export all tools
export const workspacePersistenceTools = [
  ExecuteStartupRecoveryTool,
  GetWorkspaceRegistryTool,
  UpdateDirectoryAccessTool,
  CreateDirectoryBookmarkTool,
  GetDirectoryBookmarksTool,
  DiscoverDirectoriesFromContextTool,
  GetPersistenceConfigTool
];
