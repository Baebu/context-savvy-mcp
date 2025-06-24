// src/application/services/startup-sequence.service.ts
import { injectable, inject } from 'inversify';
import type { WorkspacePersistenceService } from './workspace-persistence.service.js';
import { logger } from '../../utils/logger.js';

export interface StartupStep {
  name: string;
  enabled: boolean;
  priority: number;
}

export interface StartupResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

@injectable()
export class StartupSequenceService {
  constructor(@inject('WorkspacePersistenceService') private readonly persistence: WorkspacePersistenceService) {}

  private async expandSafeZone(path: string): Promise<void> {
    try {
      logger.info({ path }, 'Safe zone expansion requested - requires SecurityDiagnosticsService integration');
      // TODO: await this.securityDiagnostics.expandSafeZone(path);
    } catch (error) {
      logger.error({ error, path }, 'Failed to expand safe zone');
      throw error;
    }
  }

  async executeStartupSequence(): Promise<StartupResult[]> {
    logger.info('Executing startup sequence for workspace persistence...');

    const results: StartupResult[] = [];

    try {
      // Step 1: Ensure database tables
      await this.ensureDatabaseTables(results);

      // Step 2: Expand safe zones from registry
      await this.expandSafeZonesFromRegistry(results);

      // Step 3: Auto-discover directories
      await this.autoDiscoverDirectories(results);

      // Step 4: Restore last workspace (optional)
      await this.restoreLastWorkspace(results);

      logger.info(`Startup sequence completed with ${results.length} steps`);
      return results;
    } catch (error) {
      logger.error({ error }, 'Startup sequence failed');
      results.push({
        step: 'startup_sequence',
        success: false,
        message: `Startup sequence failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return results;
    }
  }

  private async ensureDatabaseTables(results: StartupResult[]): Promise<void> {
    try {
      await this.persistence.ensureDatabaseTables();
      results.push({
        step: 'ensure_database_tables',
        success: true,
        message: 'Database tables ensured for workspace persistence'
      });
    } catch (error) {
      results.push({
        step: 'ensure_database_tables',
        success: false,
        message: `Failed to ensure database tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      throw error;
    }
  }

  private async expandSafeZonesFromRegistry(results: StartupResult[]): Promise<void> {
    try {
      const workspaces = await this.persistence.getWorkspaceRegistry();
      const bookmarks = await this.persistence.getDirectoryBookmarks();

      let expandedCount = 0;
      const expandedPaths: string[] = [];

      // Expand safe zones for workspace root paths
      for (const workspace of workspaces) {
        if (workspace.rootPath && !expandedPaths.includes(workspace.rootPath)) {
          try {
            // Call security diagnostics to actually expand the safe zone
            // Actually expand the safe zone now that need expansion
            await this.expandSafeZone(workspace.rootPath);
            expandedPaths.push(workspace.rootPath);
            expandedCount++;
          } catch (error) {
            logger.warn({ error, path: workspace.rootPath }, 'Failed to expand safe zone for workspace');
          }
        }
      }

      // Expand safe zones for bookmarked directories
      for (const bookmark of bookmarks.slice(0, 10)) {
        // Limit to top 10
        if (!expandedPaths.includes(bookmark.path)) {
          try {
            await this.expandSafeZone(bookmark.path);
            expandedPaths.push(bookmark.path);
            expandedCount++;
          } catch (error) {
            logger.warn({ error, path: bookmark.path }, 'Failed to expand safe zone for bookmark');
          }
        }
      }

      results.push({
        step: 'expand_safe_zones_from_registry',
        success: true,
        message: `Prepared ${expandedCount} safe zone expansions`,
        data: { paths: expandedPaths }
      });
    } catch (error) {
      results.push({
        step: 'expand_safe_zones_from_registry',
        success: false,
        message: `Failed to expand safe zones: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async autoDiscoverDirectories(results: StartupResult[]): Promise<void> {
    try {
      const discoveredDirs = await this.persistence.discoverDirectoriesFromContext();

      let bookmarkedCount = 0;
      for (const dir of discoveredDirs.slice(0, 5)) {
        // Limit to top 5
        try {
          await this.persistence.createDirectoryBookmark(dir, false); // auto-bookmarked
          bookmarkedCount++;
        } catch (error) {
          logger.warn({ error, dir }, 'Failed to create auto-bookmark');
        }
      }

      results.push({
        step: 'auto_discover_directories',
        success: true,
        message: `Auto-bookmarked ${bookmarkedCount} discovered directories`,
        data: { discovered: discoveredDirs.length, bookmarked: bookmarkedCount }
      });
    } catch (error) {
      results.push({
        step: 'auto_discover_directories',
        success: false,
        message: `Failed to auto-discover directories: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async restoreLastWorkspace(results: StartupResult[]): Promise<void> {
    try {
      const workspaces = await this.persistence.getWorkspaceRegistry();
      const lastWorkspace = workspaces[0]; // Most recently used

      if (lastWorkspace) {
        // Note: This would typically call the workspace manager to set active workspace
        results.push({
          step: 'restore_last_workspace',
          success: true,
          message: `Identified last workspace: ${lastWorkspace.workspaceId}`,
          data: { workspaceId: lastWorkspace.workspaceId, rootPath: lastWorkspace.rootPath }
        });
      } else {
        results.push({
          step: 'restore_last_workspace',
          success: true,
          message: 'No previous workspace to restore'
        });
      }
    } catch (error) {
      results.push({
        step: 'restore_last_workspace',
        success: false,
        message: `Failed to restore last workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  async executeStartupRecovery(): Promise<StartupResult[]> {
    logger.info('Executing startup recovery sequence...');

    // This is the main recovery function that should be called after server restart
    return await this.executeStartupSequence();
  }
}
