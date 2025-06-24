// Enhanced File Operations Tool with Advanced Editing Capabilities - ENHANCED VERSION
// File: src/application/tools/enhanced-file-operations.tool.ts
// Fixes: Regex state management, multi-line patterns, enhanced error messages

import { injectable } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';
import { RollingBackupManager } from '../../utils/backup-manager.js';

// Schema for ContentEditFileTool
const contentEditFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  find: z.string().describe('Text or regex pattern to find'),
  replace: z.string().describe('Content to replace found instances with'),
  searchType: z.enum(['text', 'regex']).optional().default('text').describe('Type of search to perform'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search'),
  allOccurrences: z.boolean().optional().default(true).describe('Replace all occurrences (false for first only)'),
  createBackup: z.boolean().optional().default(true).describe('Create backup before editing'),
  preview: z.boolean().optional().default(false).describe('Preview changes without applying'),
  multiline: z.boolean().optional().default(false).describe('Enable multiline mode for regex patterns')
});

@injectable()
export class ContentEditFileTool implements IMCPTool {
  name = 'content_edit_file';
  description = 'Find and replace content in a file using text or regex patterns with enhanced multi-line support';
  schema = contentEditFileSchema;

  async execute(params: z.infer<typeof contentEditFileSchema>, context: ToolContext): Promise<ToolResult> {
    const filesystem = context.container.get<IFilesystemHandler>('FilesystemHandler');

    try {
      const fileContent = await filesystem.readFileWithTruncation(params.path, 10485760); // 10MB limit
      const originalContent = fileContent.content;
      let newContent = originalContent;
      let replacementsMade = 0;

      // Enhanced regex pattern creation with proper flag handling
      const { regex, debugInfo } = this.createRegexPattern(params);
      
      context.logger.debug(`Content edit pattern: ${debugInfo.pattern}, flags: ${debugInfo.flags}`);

      // Perform replacement with enhanced error tracking
      const replacementResult = this.performReplacement(originalContent, regex, params.replace, params.allOccurrences);
      newContent = replacementResult.content;
      replacementsMade = replacementResult.count;

      if (params.preview) {
        return this.generateEnhancedPreview(
          originalContent, 
          newContent, 
          params.find, 
          params.replace, 
          replacementsMade,
          debugInfo
        );
      }

      if (replacementsMade === 0) {
        return this.createDetailedErrorResponse(params, originalContent, debugInfo);
      }

      // Create backup if requested
      if (params.createBackup) {
        const backupManager = new RollingBackupManager({
          maxBackupsPerDay: 15,
          keepDays: 14
        });
        const backupPath = await backupManager.createRollingBackup(params.path, originalContent, 'content-edit');
        const relativePath = path.relative(process.cwd(), backupPath);
        context.logger.info(`Organized backup created: ${relativePath}`);
      }

      // Write the modified content
      await filesystem.writeFile(params.path, newContent);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Content edited successfully in ${params.path}\n` +
                  `🔍 Pattern: '${params.find}' (${params.searchType})\n` +
                  `📝 Replacement: '${params.replace}'\n` +
                  `🎯 Matches found: ${replacementsMade}\n` +
                  `📊 Search mode: ${debugInfo.flags ? `flags: ${debugInfo.flags}` : 'text'}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to edit file content');
      
      // Enhanced error reporting
      const errorDetails = this.analyzeError(error, params);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to edit file content\n\n` +
                  `📁 File: ${params.path}\n` +
                  `🔍 Pattern: '${params.find}' (${params.searchType})\n` +
                  `⚠️  Error: ${errorDetails.message}\n` +
                  `💡 Suggestion: ${errorDetails.suggestion}`
          }
        ]
      };
    }
  }

  private createRegexPattern(params: z.infer<typeof contentEditFileSchema>): { regex: RegExp; debugInfo: any } {
    let flags = '';
    let pattern = params.find;
    
    // Build flags based on parameters
    if (params.allOccurrences) flags += 'g';
    if (!params.caseSensitive) flags += 'i';
    if (params.multiline) flags += 'm';
    
    // For complex multi-line patterns, add 's' flag (dot matches newlines)
    if (params.searchType === 'regex' && (pattern.includes('\\n') || pattern.includes('\\r') || pattern.includes('.'))) {
      flags += 's';
    }

    if (params.searchType === 'regex') {
      try {
        // Validate regex pattern before creating
        new RegExp(pattern); // Test compilation
        const regex = new RegExp(pattern, flags);
        return {
          regex,
          debugInfo: {
            pattern,
            flags,
            type: 'regex',
            multilineEnabled: params.multiline || flags.includes('s')
          }
        };
      } catch (regexError) {
        throw new Error(`Invalid regex pattern '${pattern}': ${regexError instanceof Error ? regexError.message : 'Invalid regex syntax'}`);
      }
    } else {
      // Escape special regex characters for text search
      const escapedPattern = this.escapeRegex(pattern);
      const regex = new RegExp(escapedPattern, flags);
      return {
        regex,
        debugInfo: {
          pattern: escapedPattern,
          originalPattern: pattern,
          flags,
          type: 'text'
        }
      };
    }
  }

  private performReplacement(content: string, regex: RegExp, replacement: string, allOccurrences: boolean): { content: string; count: number } {
    let count = 0;
    
    // Reset lastIndex to prevent state issues with global regexes
    regex.lastIndex = 0;
    
    const newContent = content.replace(regex, (match, ...args) => {
      count++;
      
      // For non-global regex, stop after first replacement
      if (!allOccurrences && count > 1) {
        return match; // Return original match to stop replacing
      }
      
      // Handle replacement groups if present
      return replacement;
    });

    return { content: newContent, count };
  }

  private createDetailedErrorResponse(
    params: z.infer<typeof contentEditFileSchema>, 
    content: string, 
    debugInfo: any
  ): ToolResult {
    const contentSample = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    const lines = content.split('\n');
    
    // Try to find similar patterns
    const suggestions = this.generatePatternSuggestions(params.find, content, params.searchType);
    
    return {
      content: [
        {
          type: 'text',
          text: `🔍 No matches found for pattern: '${params.find}'\n\n` +
                `📁 File: ${params.path}\n` +
                `📊 File stats: ${lines.length} lines, ${content.length} characters\n` +
                `🔧 Search type: ${params.searchType}\n` +
                `🏷️  Pattern used: ${debugInfo.pattern}\n` +
                `🚩 Flags: ${debugInfo.flags || 'none'}\n` +
                `📝 Content sample: ${contentSample}\n\n` +
                `💡 Suggestions:\n${suggestions.join('\n')}\n\n` +
                `🔧 Debug tips:\n` +
                `• Use searchType: "text" for literal string matching\n` +
                `• Use searchType: "regex" for pattern matching\n` +
                `• Set multiline: true for multi-line patterns\n` +
                `• Set caseSensitive: false for case-insensitive search`
        }
      ]
    };
  }

  private generatePatternSuggestions(pattern: string, content: string, searchType: string): string[] {
    const suggestions: string[] = [];
    
    if (searchType === 'regex') {
      // Check if pattern might need escaping
      if (/[.*+?^${}()|[\]\\]/.test(pattern)) {
        suggestions.push(`• Try text search instead of regex for literal matching`);
      }
      
      // Check if multiline flag might be needed
      if (pattern.includes('\\n') || pattern.includes('^') || pattern.includes('$')) {
        suggestions.push(`• Try setting multiline: true for line-based patterns`);
      }
    } else {
      // For text search, look for partial matches
      const words = pattern.split(/\s+/);
      const foundWords = words.filter(word => content.toLowerCase().includes(word.toLowerCase()));
      
      if (foundWords.length > 0) {
        suggestions.push(`• Found partial matches for: ${foundWords.join(', ')}`);
      }
      
      if (foundWords.length < words.length) {
        suggestions.push(`• Missing words: ${words.filter(w => !foundWords.includes(w)).join(', ')}`);
      }
    }
    
    // Check for case sensitivity issues
    if (content.toLowerCase().includes(pattern.toLowerCase()) && !content.includes(pattern)) {
      suggestions.push(`• Pattern found with different case - try caseSensitive: false`);
    }
    
    if (suggestions.length === 0) {
      suggestions.push(`• Pattern not found in file content`);
      suggestions.push(`• Check spelling and whitespace carefully`);
      suggestions.push(`• Use preview: true to test patterns safely`);
    }
    
    return suggestions;
  }

  private analyzeError(error: any, params: z.infer<typeof contentEditFileSchema>): { message: string; suggestion: string } {
    const message = error instanceof Error ? error.message : 'Unknown error';
    let suggestion = 'Check file path and permissions';
    
    if (message.includes('Invalid regex')) {
      suggestion = 'Fix regex syntax or use searchType: "text" for literal matching';
    } else if (message.includes('ENOENT')) {
      suggestion = 'File not found - verify the path exists';
    } else if (message.includes('EACCES')) {
      suggestion = 'Permission denied - check file permissions';
    } else if (message.includes('too large')) {
      suggestion = 'File too large - consider splitting into smaller files';
    }
    
    return { message, suggestion };
  }

  private generateEnhancedPreview(
    originalContent: string,
    newContent: string,
    findPattern: string,
    replaceContent: string,
    replacementsMade: number,
    debugInfo: any
  ): ToolResult {
    let preview = `🔍 Preview of content edit operation:\n\n`;
    preview += `📁 Pattern: '${findPattern}' (${debugInfo.type})\n`;
    preview += `📝 Replace with: '${replaceContent}'\n`;
    preview += `🎯 Estimated replacements: ${replacementsMade}\n`;
    preview += `🔧 Regex flags: ${debugInfo.flags || 'none'}\n\n`;

    if (replacementsMade === 0) {
      preview += `❌ No matches found\n`;
      preview += `💡 Try adjusting the pattern or search parameters\n`;
      return { content: [{ type: 'text', text: preview }] };
    }

    const originalLines = originalContent.split('\n');
    const newLines = newContent.split('\n');

    // Enhanced diff preview
    const diffLines: string[] = [];
    let changesShown = 0;
    const maxChangesToShow = 10;

    for (let i = 0; i < Math.max(originalLines.length, newLines.length) && changesShown < maxChangesToShow; i++) {
      const origLine = originalLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (origLine !== newLine) {
        diffLines.push(`Line ${i + 1}:`);
        diffLines.push(`- ${origLine}`);
        diffLines.push(`+ ${newLine}`);
        diffLines.push('');
        changesShown++;
      }
    }

    preview += `--- Changes Preview (showing ${Math.min(changesShown, maxChangesToShow)} changes) ---\n`;
    preview += diffLines.join('\n');
    
    if (replacementsMade > maxChangesToShow) {
      preview += `\n... and ${replacementsMade - maxChangesToShow} more changes\n`;
    }
    
    preview += `--- End Preview ---\n`;

    return { content: [{ type: 'text', text: preview }] };
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Schema for SearchFilesTool with enhanced parameters
const searchFilesSchema = z.object({
  directory: z.string().describe('Directory to search in'),
  pattern: z.string().describe('Text pattern or regex to search for'),
  searchType: z.enum(['text', 'regex']).optional().default('text').describe('Type of search to perform'),
  filePattern: z.string().optional().describe('File pattern to include (glob pattern)'),
  excludePattern: z.string().optional().describe('File pattern to exclude (glob pattern)'),
  maxDepth: z.number().optional().default(10).describe('Maximum directory depth'),
  maxResults: z.number().optional().default(100).describe('Maximum number of results'),
  contextLines: z.number().optional().default(2).describe('Number of context lines around matches'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive search'),
  multiline: z.boolean().optional().default(false).describe('Enable multiline mode for regex patterns'),
  timeout: z.number().optional().default(30000).describe('Search timeout in milliseconds')
});

@injectable()
export class SearchFilesTool implements IMCPTool {
  name = 'search_files';
  description = 'Search for text or patterns across multiple files with enhanced regex support and debugging';
  schema = searchFilesSchema;

  async execute(params: z.infer<typeof searchFilesSchema>, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      // Build file list using glob pattern
      const includePattern = params.filePattern || '**/*';
      const searchPath = path.join(params.directory, includePattern);

      const globOptions: any = {
        nodir: true,
        maxDepth: params.maxDepth
      };

      if (params.excludePattern) {
        globOptions.ignore = [params.excludePattern];
      }

      const files = await glob(searchPath, globOptions);
      
      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'No files found',
                searchPath,
                suggestion: 'Check directory path and file patterns',
                filesFound: 0
              }, null, 2)
            }
          ]
        };
      }

      // Create enhanced regex pattern
      const { searchRegex, debugInfo } = this.createSearchRegex(params);
      
      context.logger.debug(`Search pattern: ${debugInfo.pattern}, flags: ${debugInfo.flags}`);

      const results: Array<{
        file: string;
        matches: Array<{
          line: number;
          content: string;
          context: { before: string[]; after: string[] };
        }>;
      }> = [];

      let totalMatches = 0;
      let filesProcessed = 0;
      const skippedFiles: string[] = [];

      // Process files with timeout protection
      for (const filePath of files) {
        if (Date.now() - startTime > params.timeout!) {
          context.logger.warn(`Search timeout reached after ${params.timeout}ms`);
          break;
        }

        if (totalMatches >= params.maxResults!) break;

        try {
          const fileResult = await this.searchInFile(filePath, searchRegex, params, context);
          filesProcessed++;
          
          if (fileResult.matches.length > 0) {
            results.push({
              file: path.relative(params.directory, filePath),
              matches: fileResult.matches
            });
            totalMatches += fileResult.matches.length;
          }
          
          // Reset regex state for next file to prevent false negatives
          searchRegex.lastIndex = 0;
          
        } catch (err) {
          skippedFiles.push(filePath);
          context.logger.debug(`Skipping file ${filePath}: ${err}`);
        }
      }

      const responseData = {
        searchPattern: params.pattern,
        searchType: params.searchType,
        directory: params.directory,
        filesSearched: filesProcessed,
        filesSkipped: skippedFiles.length,
        filesWithMatches: results.length,
        totalMatches,
        results: results.slice(0, 50),
        truncated: results.length > 50,
        debugInfo: {
          ...debugInfo,
          processingTime: Date.now() - startTime,
          filesFound: files.length,
          skippedFiles: skippedFiles.length > 0 ? skippedFiles.slice(0, 5) : undefined
        },
        searchMetadata: {
          maxDepth: params.maxDepth,
          caseSensitive: params.caseSensitive,
          contextLines: params.contextLines,
          multiline: params.multiline,
          timeout: params.timeout,
          timestamp: new Date().toISOString()
        }
      };

      // Enhanced success message - add suggestions if no matches found
      if (totalMatches === 0) {
        (responseData as any).suggestions = this.generateSearchSuggestions(params, files.length, skippedFiles.length);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
      
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to search files');
      
      const errorAnalysis = this.analyzeSearchError(error, params);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Search failed',
              message: error instanceof Error ? error.message : 'Unknown error',
              analysis: errorAnalysis,
              params: {
                directory: params.directory,
                pattern: params.pattern,
                searchType: params.searchType
              }
            }, null, 2)
          }
        ]
      };
    }
  }

  private createSearchRegex(params: z.infer<typeof searchFilesSchema>): { searchRegex: RegExp; debugInfo: any } {
    let flags = 'g'; // Always global for finding all matches
    let pattern = params.pattern;
    
    if (!params.caseSensitive) flags += 'i';
    if (params.multiline) flags += 'm';
    
    // For multi-line regex patterns, enable dot-all mode
    if (params.searchType === 'regex' && (pattern.includes('\\n') || pattern.includes('\\r') || pattern.includes('\\s') || pattern.includes('.'))) {
      flags += 's';
    }

    if (params.searchType === 'regex') {
      try {
        // Validate regex
        new RegExp(pattern);
        const searchRegex = new RegExp(pattern, flags);
        return {
          searchRegex,
          debugInfo: {
            pattern,
            flags,
            type: 'regex',
            multilineEnabled: params.multiline || flags.includes('s')
          }
        };
      } catch (regexError) {
        throw new Error(`Invalid regex pattern '${pattern}': ${regexError instanceof Error ? regexError.message : 'Invalid regex syntax'}`);
      }
    } else {
      const escapedPattern = this.escapeRegex(pattern);
      const searchRegex = new RegExp(escapedPattern, flags);
      return {
        searchRegex,
        debugInfo: {
          pattern: escapedPattern,
          originalPattern: pattern,
          flags,
          type: 'text'
        }
      };
    }
  }

  private async searchInFile(
    filePath: string, 
    searchRegex: RegExp, 
    params: z.infer<typeof searchFilesSchema>,
    context: ToolContext
  ): Promise<{ matches: any[] }> {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const fileMatches: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      
      // Reset regex state before each line to prevent issues
      searchRegex.lastIndex = 0;
      
      // Test if line matches
      if (searchRegex.test(line)) {
        const contextBefore = lines.slice(Math.max(0, i - params.contextLines!), i);
        const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 1 + params.contextLines!));

        fileMatches.push({
          line: i + 1,
          content: line,
          context: {
            before: contextBefore,
            after: contextAfter
          }
        });

        // Reset regex state after successful match
        searchRegex.lastIndex = 0;
      }
    }

    return { matches: fileMatches };
  }

  private generateSearchSuggestions(params: z.infer<typeof searchFilesSchema>, filesFound: number, skippedFiles: number): string[] {
    const suggestions: string[] = [];
    
    if (filesFound === 0) {
      suggestions.push('No files found matching the file pattern');
      suggestions.push('Check directory path and filePattern/excludePattern settings');
    } else {
      suggestions.push(`Searched ${filesFound} files, found 0 matches`);
      
      if (params.searchType === 'regex') {
        suggestions.push('Try searchType: "text" for literal string matching');
        suggestions.push('Check regex syntax and escaping');
        suggestions.push('Try multiline: true for patterns spanning multiple lines');
      } else {
        suggestions.push('Try caseSensitive: false for case-insensitive search');
        suggestions.push('Check spelling and whitespace in search pattern');
      }
      
      if (skippedFiles > 0) {
        suggestions.push(`${skippedFiles} files were skipped (binary files or read errors)`);
      }
    }
    
    return suggestions;
  }

  private analyzeSearchError(error: any, params: z.infer<typeof searchFilesSchema>): any {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    if (message.includes('Invalid regex')) {
      return {
        issue: 'Regex syntax error',
        suggestion: 'Fix regex pattern or use searchType: "text"'
      };
    } else if (message.includes('ENOENT')) {
      return {
        issue: 'Directory not found',
        suggestion: 'Check if directory path exists'
      };
    } else if (message.includes('EACCES')) {
      return {
        issue: 'Permission denied',
        suggestion: 'Check directory permissions'
      };
    }
    
    return {
      issue: 'Unknown error',
      suggestion: 'Check parameters and try again'
    };
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Re-export existing tools for completeness
export { ReadFileTool, WriteFileTool, ListDirectoryTool } from './file-operations.tool.js';

// Keep all existing file management tools unchanged from the original file
const findFilesSchema = z.object({
  directory: z.string().describe('Directory to search in'),
  namePattern: z.string().describe('File name pattern (supports wildcards)'),
  searchType: z.enum(['glob', 'regex']).optional().default('glob').describe('Type of pattern matching'),
  maxDepth: z.number().optional().default(10).describe('Maximum directory depth'),
  maxResults: z.number().optional().default(1000).describe('Maximum number of results'),
  includeDirectories: z.boolean().optional().default(false).describe('Include directories in results'),
  caseSensitive: z.boolean().optional().default(false).describe('Case sensitive matching'),
  sortBy: z.enum(['name', 'size', 'modified']).optional().default('name').describe('Sort results by')
});

@injectable()
export class FindFilesTool implements IMCPTool {
  name = 'find_files';
  description = 'Find files by name or pattern in a directory tree';
  schema = findFilesSchema;

  async execute(params: z.infer<typeof findFilesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      let files: string[] = [];

      if (params.searchType === 'glob') {
        // Use glob for pattern matching
        const searchPath = path.join(params.directory, '**', params.namePattern);
        const globOptions: any = {
          nodir: !params.includeDirectories,
          maxDepth: params.maxDepth
        };

        files = await glob(searchPath, globOptions);
      } else {
        // Use regex for pattern matching
        const regex = new RegExp(params.namePattern, params.caseSensitive ? '' : 'i');
        const searchPath = path.join(params.directory, '**/*');
        const globOptions: any = {
          nodir: !params.includeDirectories,
          maxDepth: params.maxDepth
        };

        const allFiles = await glob(searchPath, globOptions);

        files = allFiles.filter(file => {
          const basename = path.basename(file);
          return regex.test(basename);
        });
      }

      // Get file stats for sorting and metadata
      const fileInfos = await Promise.all(
        files.slice(0, params.maxResults!).map(async file => {
          try {
            const stats = await fs.stat(file);
            return {
              path: path.relative(params.directory, file),
              absolutePath: file,
              name: path.basename(file),
              size: stats.size,
              isDirectory: stats.isDirectory(),
              modified: stats.mtime,
              permissions: stats.mode.toString(8)
            };
          } catch (err) {
            return {
              path: path.relative(params.directory, file),
              absolutePath: file,
              name: path.basename(file),
              size: 0,
              isDirectory: false,
              modified: new Date(0),
              permissions: '000000',
              error: 'Could not read file stats'
            };
          }
        })
      );

      // Sort results
      fileInfos.sort((a, b) => {
        switch (params.sortBy) {
          case 'size':
            return b.size - a.size;
          case 'modified':
            return b.modified.getTime() - a.modified.getTime();
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });

      const responseData = {
        searchPattern: params.namePattern,
        searchType: params.searchType,
        directory: params.directory,
        filesFound: files.length,
        results: fileInfos,
        truncated: files.length > params.maxResults!,
        searchMetadata: {
          maxDepth: params.maxDepth,
          includeDirectories: params.includeDirectories,
          caseSensitive: params.caseSensitive,
          sortBy: params.sortBy,
          timestamp: new Date().toISOString()
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
      context.logger.error({ error, params }, 'Failed to find files');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find files: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// All remaining file management tools remain unchanged for backward compatibility
const moveFileSchema = z.object({
  sourcePath: z.string().describe('Source file path to move'),
  destinationPath: z.string().describe('Destination path for the file'),
  overwrite: z.boolean().optional().default(false).describe('Overwrite destination if it exists'),
  createDirectories: z.boolean().optional().default(true).describe('Create destination directories if needed')
});

@injectable()
export class MoveFileTool implements IMCPTool {
  name = 'move_file';
  description = 'Move a file from one location to another with safety checks';
  schema = moveFileSchema;

  async execute(params: z.infer<typeof moveFileSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const sourceStats = await fs.stat(params.sourcePath);
      if (!sourceStats.isFile()) {
        return {
          content: [{ type: 'text', text: `Source path ${params.sourcePath} is not a file` }]
        };
      }

      const destDir = path.dirname(params.destinationPath);
      if (params.createDirectories) {
        await fs.mkdir(destDir, { recursive: true });
      }

      try {
        await fs.access(params.destinationPath);
        if (!params.overwrite) {
          return {
            content: [
              {
                type: 'text',
                text: `Destination ${params.destinationPath} already exists. Use overwrite=true to replace.`
              }
            ]
          };
        }
      } catch {
        // Destination doesn't exist, which is fine
      }

      await fs.rename(params.sourcePath, params.destinationPath);

      return {
        content: [
          {
            type: 'text',
            text: `File moved successfully from ${params.sourcePath} to ${params.destinationPath}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to move file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

const recycleFileSchema = z.object({
  filePath: z.string().describe('Path to the file to recycle'),
  reason: z.string().optional().describe('Reason for recycling (for tracking)')
});

@injectable()
export class RecycleFileTool implements IMCPTool {
  name = 'recycle_file';
  description = 'Move a file to recycle bin for safe deletion';
  schema = recycleFileSchema;

  async execute(params: z.infer<typeof recycleFileSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');
      await fs.mkdir(recycleDir, { recursive: true });

      const fileName = path.basename(params.filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const recycledName = `${timestamp}_${fileName}`;
      const recycledPath = path.join(recycleDir, recycledName);

      const metadata = {
        originalPath: params.filePath,
        recycledAt: new Date().toISOString(),
        reason: params.reason || 'User requested',
        size: (await fs.stat(params.filePath)).size
      };

      await fs.writeFile(`${recycledPath}.meta`, JSON.stringify(metadata, null, 2));
      await fs.rename(params.filePath, recycledPath);

      return {
        content: [
          {
            type: 'text',
            text: `File recycled: ${params.filePath} → ${recycledName}\nReason: ${params.reason || 'User requested'}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to recycle file');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to recycle file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

const restoreFromRecycleSchema = z.object({
  recycledFileName: z.string().describe('Name of the recycled file to restore'),
  customPath: z.string().optional().describe('Custom restore path (default: original location)')
});

@injectable()
export class RestoreFromRecycleTool implements IMCPTool {
  name = 'restore_from_recycle';
  description = 'Restore a file from the recycle bin to its original location or a custom path';
  schema = restoreFromRecycleSchema;

  async execute(params: z.infer<typeof restoreFromRecycleSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');
      const recycledPath = path.join(recycleDir, params.recycledFileName);
      const metaPath = `${recycledPath}.meta`;

      const metaContent = await fs.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent);

      const restorePath = params.customPath || metadata.originalPath;
      const restoreDir = path.dirname(restorePath);

      await fs.mkdir(restoreDir, { recursive: true });

      try {
        await fs.access(restorePath);
        return {
          content: [
            {
              type: 'text',
              text: `Cannot restore: ${restorePath} already exists. Please specify a different customPath.`
            }
          ]
        };
      } catch {
        // File doesn't exist, proceed with restore
      }

      await fs.rename(recycledPath, restorePath);
      await fs.unlink(metaPath);

      return {
        content: [
          {
            type: 'text',
            text: `File restored successfully: ${params.recycledFileName} → ${restorePath}\nOriginal path: ${metadata.originalPath}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to restore file from recycle');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to restore file: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

const listRecycleBinSchema = z.object({
  showDetails: z.boolean().optional().default(false).describe('Show detailed metadata for each file')
});

@injectable()
export class ListRecycleBinTool implements IMCPTool {
  name = 'list_recycle_bin';
  description = 'List files in the recycle bin with metadata';
  schema = listRecycleBinSchema;

  async execute(params: z.infer<typeof listRecycleBinSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const recycleDir = path.join(process.cwd(), '.recycle');

      try {
        await fs.access(recycleDir);
      } catch {
        return {
          content: [{ type: 'text', text: 'Recycle bin is empty (directory does not exist)' }]
        };
      }

      const files = await fs.readdir(recycleDir);
      const recycledFiles = files.filter(f => !f.endsWith('.meta'));

      if (recycledFiles.length === 0) {
        return {
          content: [{ type: 'text', text: 'Recycle bin is empty' }]
        };
      }

      const fileInfos = await Promise.all(
        recycledFiles.map(async fileName => {
          const metaPath = path.join(recycleDir, `${fileName}.meta`);
          try {
            const metaContent = await fs.readFile(metaPath, 'utf8');
            const metadata = JSON.parse(metaContent);
            const stats = await fs.stat(path.join(recycleDir, fileName));

            return {
              fileName,
              originalPath: metadata.originalPath,
              recycledAt: metadata.recycledAt,
              reason: metadata.reason,
              size: stats.size,
              metadata: params.showDetails ? metadata : undefined
            };
          } catch {
            return {
              fileName,
              originalPath: 'Unknown',
              recycledAt: 'Unknown',
              reason: 'Metadata missing',
              size: 0
            };
          }
        })
      );

      const response = {
        recycledFiles: fileInfos.length,
        files: fileInfos,
        recycleBinPath: recycleDir
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list recycle bin');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list recycle bin: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

const emptyRecycleBinSchema = z.object({
  confirm: z.boolean().describe('Confirmation flag - must be true to proceed'),
  olderThanDays: z.number().optional().describe('Only delete files older than X days (optional)')
});

@injectable()
export class EmptyRecycleBinTool implements IMCPTool {
  name = 'empty_recycle_bin';
  description = 'Permanently delete files from recycle bin (DESTRUCTIVE operation)';
  schema = emptyRecycleBinSchema;

  async execute(params: z.infer<typeof emptyRecycleBinSchema>, context: ToolContext): Promise<ToolResult> {
    if (!params.confirm) {
      return {
        content: [
          {
            type: 'text',
            text: 'Operation cancelled. Set confirm=true to proceed with emptying recycle bin.'
          }
        ]
      };
    }

    try {
      const recycleDir = path.join(process.cwd(), '.recycle');

      try {
        await fs.access(recycleDir);
      } catch {
        return {
          content: [{ type: 'text', text: 'Recycle bin is already empty (directory does not exist)' }]
        };
      }

      const files = await fs.readdir(recycleDir);
      let deletedCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        const filePath = path.join(recycleDir, file);

        if (params.olderThanDays) {
          const stats = await fs.stat(filePath);
          const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

          if (ageInDays < params.olderThanDays) {
            skippedCount++;
            continue;
          }
        }

        await fs.unlink(filePath);
        deletedCount++;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Recycle bin emptied. Files deleted: ${deletedCount}, Files skipped: ${skippedCount}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to empty recycle bin');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to empty recycle bin: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}