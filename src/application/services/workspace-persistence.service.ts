// src/application/services/workspace-persistence.service.ts
import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { logger } from '../../utils/logger.js';

export interface WorkspaceAccessInfo {
  workspaceId: string;
  lastAccessed: string;
  accessCount: number;
  rootPath: string;
  safeZonePattern?: string;
}

export interface DirectoryBookmark {
  id: string;
  path: string;
  accessCount: number;
  lastAccessed: string;
  autoBookmarked: boolean;
  safeZonePattern?: string;
}

@injectable()
export class WorkspacePersistenceService {
  constructor(@inject('DatabaseHandler') private readonly database: IDatabaseHandler) {}

  async updateWorkspaceAccess(workspaceId: string): Promise<void> {
    try {
      // Update workspace usage tracking
      await this.database.executeCommand(
        `UPDATE workspace_metadata
         SET usage_count = COALESCE(usage_count, 0) + 1,
             last_accessed = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [workspaceId]
      );

      // Update session tracking
      const sessionId = await this.getCurrentSessionId();
      if (sessionId) {
        await this.database.executeCommand(
          `UPDATE sessions
           SET active_workspace_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [workspaceId, sessionId]
        );
      }

      logger.debug(`Updated workspace access tracking for: ${workspaceId}`);
    } catch (error) {
      logger.error({ error, workspaceId }, 'Failed to update workspace access');
      throw error;
    }
  }

  async getWorkspaceRegistry(): Promise<WorkspaceAccessInfo[]> {
    try {
      const workspaces = (await this.database.executeQuery(
        `SELECT id, name, root_path, usage_count, last_accessed, auto_safe_zones
         FROM workspace_metadata
         WHERE usage_count > 0
         ORDER BY usage_count DESC, last_accessed DESC
         LIMIT 20`,
        []
      )) as any[];

      return workspaces.map((ws: any) => ({
        workspaceId: ws.id,
        lastAccessed: ws.last_accessed,
        accessCount: ws.usage_count || 0,
        rootPath: ws.root_path,
        safeZonePattern: ws.auto_safe_zones
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get workspace registry');
      return [];
    }
  }

  async updateDirectoryAccess(path: string): Promise<void> {
    try {
      // Create or update bookmark
      await this.database.executeCommand(
        `INSERT INTO directory_bookmarks (id, path, access_count, last_accessed, auto_bookmarked)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP, TRUE)
         ON CONFLICT(path) DO UPDATE SET
           access_count = access_count + 1,
           last_accessed = CURRENT_TIMESTAMP`,
        [this.generateId(), path]
      );

      logger.debug(`Updated directory access tracking for: ${path}`);
    } catch (error) {
      logger.error({ error, path }, 'Failed to update directory access');
    }
  }

  async createDirectoryBookmark(path: string, manual = false): Promise<string> {
    try {
      const id = this.generateId();
      await this.database.executeCommand(
        `INSERT INTO directory_bookmarks (id, path, access_count, last_accessed, auto_bookmarked)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(path) DO UPDATE SET
           auto_bookmarked = CASE WHEN ? = FALSE THEN FALSE ELSE auto_bookmarked END`,
        [id, path, !manual, !manual]
      );

      logger.info(`Created directory bookmark: ${path}`);
      return id;
    } catch (error) {
      logger.error({ error, path }, 'Failed to create directory bookmark');
      throw error;
    }
  }

  async getDirectoryBookmarks(): Promise<DirectoryBookmark[]> {
    try {
      const bookmarks = (await this.database.executeQuery(
        `SELECT * FROM directory_bookmarks
         ORDER BY access_count DESC, last_accessed DESC
         LIMIT 50`,
        []
      )) as any[];

      return bookmarks.map((bm: any) => ({
        id: bm.id,
        path: bm.path,
        accessCount: bm.access_count,
        lastAccessed: bm.last_accessed,
        autoBookmarked: Boolean(bm.auto_bookmarked),
        safeZonePattern: bm.safe_zone_pattern
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get directory bookmarks');
      return [];
    }
  }

  async discoverDirectoriesFromContext(): Promise<string[]> {
    try {
      // Search for directory patterns in context keys and values
      const contexts = (await this.database.executeQuery(
        `SELECT DISTINCT key, value FROM contexts
         WHERE (key LIKE '%path%' OR key LIKE '%dir%' OR key LIKE '%workspace%'
                OR value LIKE '%:\\%' OR value LIKE '%/%')
         AND created_at > datetime('now', '-30 days')
         LIMIT 100`,
        []
      )) as any[];

      const directories = new Set<string>();

      for (const ctx of contexts) {
        // Extract potential directory paths
        const text = `${ctx.key} ${ctx.value}`;
        const pathMatches = text.match(/[A-Za-z]:[\\\/][^\\\/\s"']+/g) || [];
        const unixMatches = text.match(/\/[^\s"']+/g) || [];

        [...pathMatches, ...unixMatches].forEach(path => {
          if (path.length > 5 && !path.includes('\\n') && !path.includes('\\t')) {
            directories.add(path.replace(/['"]/g, ''));
          }
        });
      }

      return Array.from(directories).slice(0, 20);
    } catch (error) {
      logger.error({ error }, 'Failed to discover directories from context');
      return [];
    }
  }

  private async getCurrentSessionId(): Promise<string | null> {
    try {
      const session = (await this.database.getSingle(
        `SELECT id FROM sessions
         WHERE created_at > datetime('now', '-1 day')
         ORDER BY created_at DESC
         LIMIT 1`,
        []
      )) as any;
      return session?.id || null;
    } catch (error) {
      logger.error({ error }, 'Failed to get current session ID');
      return null;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async ensureDatabaseTables(): Promise<void> {
    try {
      // Extend sessions table
      await this.database
        .executeCommand(
          `
        ALTER TABLE sessions ADD COLUMN active_workspace_id TEXT;
      `,
          []
        )
        .catch(() => {}); // Ignore if column exists

      await this.database
        .executeCommand(
          `
        ALTER TABLE sessions ADD COLUMN recent_files TEXT;
      `,
          []
        )
        .catch(() => {}); // Ignore if column exists

      await this.database
        .executeCommand(
          `
        ALTER TABLE sessions ADD COLUMN context_keys TEXT;
      `,
          []
        )
        .catch(() => {}); // Ignore if column exists

      // Extend workspace_metadata table
      await this.database
        .executeCommand(
          `
        ALTER TABLE workspace_metadata ADD COLUMN usage_count INTEGER DEFAULT 0;
      `,
          []
        )
        .catch(() => {}); // Ignore if column exists

      await this.database
        .executeCommand(
          `
        ALTER TABLE workspace_metadata ADD COLUMN auto_safe_zones TEXT;
      `,
          []
        )
        .catch(() => {}); // Ignore if column exists

      // Create directory_bookmarks table
      await this.database.executeCommand(
        `
        CREATE TABLE IF NOT EXISTS directory_bookmarks (
          id TEXT PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          access_count INTEGER DEFAULT 0,
          last_accessed TEXT DEFAULT CURRENT_TIMESTAMP,
          auto_bookmarked BOOLEAN DEFAULT FALSE,
          safe_zone_pattern TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `,
        []
      );

      logger.info('Workspace persistence database tables ensured');
    } catch (error) {
      logger.error({ error }, 'Failed to ensure workspace persistence database tables');
      throw error;
    }
  }
}
