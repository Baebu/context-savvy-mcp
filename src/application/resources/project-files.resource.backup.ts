// Enhanced Project Files Resource with Proper Path Resolution
// File: src/application/resources/project-files.resource.ts

import { injectable, inject } from 'inversify';
import type { MCPResource } from '@core/interfaces/resource-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import path from 'node:path';

@injectable()
export class ProjectFilesResource implements MCPResource {
  name = 'project-files';
  template = 'file:///{path}';
  description = 'Access project files with automatic discovery and proper path resolution';

  constructor(
    @inject('FilesystemHandler') private filesystem: IFilesystemHandler,
    @inject('SecurityValidator') private securityValidator: ISecurityValidator
  ) {}

  async read(uri: string, params?: Record<string, unknown>) {
    try {
      const filePath = this.parseAndResolveUri(uri);
      
      // Validate access before proceeding
      await this.validateAccess(filePath);

      if (filePath.endsWith('/') || filePath.endsWith('\\')) {
        // Directory listing
        return await this.handleDirectoryRequest(uri, filePath, params);
      } else {
        // File content
        return await this.handleFileRequest(uri, filePath, params);
      }
    } catch (error) {
      return this.handleError(uri, error);
    }
  }

  private parseAndResolveUri(uri: string): string {
    try {
      // Handle URL decoding first
      const decodedUri = decodeURIComponent(uri);
      
      // Check for template issues
      if (decodedUri.includes('{') && decodedUri.includes('}')) {
        throw new Error(`Template not resolved in URI: ${uri}. Expected resolved path, got template.`);
      }
      
      // Parse the URI
      const urlParts = new URL(decodedUri);
      let filePath = urlParts.pathname;
      
      // Handle Windows path normalization
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      
      // Ensure we have an absolute path
      if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(filePath);
      }
      
      // Normalize path separators
      return path.normalize(filePath);
    } catch (error) {
      throw new Error(`Failed to parse URI '${uri}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateAccess(filePath: string): Promise<void> {
    try {
      const isAllowed = await this.securityValidator.validatePath(filePath);
      if (!isAllowed) {
        throw new Error(`Access denied: Path '${filePath}' not within any configured safe zone or their subdirectories (RECURSIVE mode).`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Security validation failed for path '${filePath}': ${error}`);
    }
  }

  private async handleDirectoryRequest(uri: string, filePath: string, params?: Record<string, unknown>) {
    const entries = await this.filesystem.listDirectory(filePath, {
      includeMetadata: true,
      limit: (params?.limit as number) || 100
    });

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            path: filePath,
            type: 'directory',
            entries: entries
          }, null, 2)
        }
      ]
    };
  }

  private async handleFileRequest(uri: string, filePath: string, params?: Record<string, unknown>) {
    const content = await this.filesystem.readFileWithTruncation(filePath, (params?.maxSize as number) || 1048576);

    return {
      contents: [
        {
          uri,
          mimeType: this.getMimeType(filePath),
          text: content.content
        }
      ]
    };
  }

  private handleError(uri: string, error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Generate helpful error message
    let helpfulMessage = `Error reading ${uri}: ${errorMessage}`;
    
    if (errorMessage.includes('template')) {
      helpfulMessage += '\n\nThis appears to be a template resolution issue. The URI should contain a resolved path, not a template like {path}.';
    }
    
    if (errorMessage.includes('safe zone')) {
      helpfulMessage += '\n\nThis is a security validation issue. The requested path is not within configured safe zones.';
      helpfulMessage += '\nTip: Use the security_diagnostics tool with action "test-path" to check if a path is allowed.';
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: helpfulMessage
        }
      ]
    };
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.cpp': 'text/x-c++',
      '.c': 'text/x-c',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.cs': 'text/x-csharp',
      '.php': 'text/x-php',
      '.rb': 'text/x-ruby',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.xml': 'application/xml',
      '.svg': 'image/svg+xml'
    };
    return mimeTypes[ext] || 'text/plain';
  }
}
