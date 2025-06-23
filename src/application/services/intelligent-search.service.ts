// Intelligent Search Service for Token-Efficient Context Discovery
// File: src/application/services/intelligent-search.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { SecurityValidatorService } from './security-validator.service.js';

export interface SearchQuery {
  intent: SearchIntent;
  scope: SearchScope;
  filters: SearchFilters;
  optimization: TokenOptimization;
}

export interface SearchIntent {
  type: 'function' | 'class' | 'variable' | 'import' | 'config' | 'pattern' | 'semantic' | 'text';
  target: string;
  context?: string;
  language?: string;
}

export interface SearchScope {
  files?: string[];
  directories?: string[];
  workspace?: boolean;
  includeTests?: boolean;
  fileTypes?: string[];
}

export interface SearchFilters {
  minRelevance?: number;
  maxResults?: number;
  excludePatterns?: string[];
}

export interface TokenOptimization {
  summaryOnly?: boolean;
  maxContextLines?: number;
  progressive?: boolean;
  compressionLevel?: number;
}

export interface CompactSearchResult {
  id: string;
  type: 'exact' | 'semantic' | 'structural' | 'pattern';
  relevance: number;
  summary: string;
  location: SourceLocation;
  preview: string;
  metadata: SearchResultMetadata;
  expandable: boolean;
  tokenCount: number;
}

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface SearchResultMetadata {
  language?: string;
  nodeType?: string;
  confidence: number;
  contextWeight: number;
  lastModified?: Date;
  inActiveWorkspace?: boolean;
}

@injectable()
export class IntelligentSearchService {
  private resultCache = new Map<string, CompactSearchResult[]>();
  private expandedCache = new Map<string, string>();

  constructor(
    @inject('DatabaseHandler') private dbHandler: IDatabaseHandler,
    // @inject('EmbeddingService') private embeddingService: IEmbeddingService,
    // @inject('FilesystemHandler') private fsHandler: IFilesystemHandler,
    @inject('SecurityValidator') private securityValidator: SecurityValidatorService
  ) {}

  /**
   * Parse natural language search query into structured search intent
   */
  parseNaturalLanguage(query: string): SearchQuery {
    const lowercaseQuery = query.toLowerCase().trim();
    let intent: SearchIntent;
    let scope: SearchScope = {};
    let filters: SearchFilters = { maxResults: 10, minRelevance: 0.3 };
    let optimization: TokenOptimization = { summaryOnly: true, maxContextLines: 3, progressive: true };

    // Parse search intent patterns
    if (lowercaseQuery.includes('function') || lowercaseQuery.match(/\w+\s*\(/)) {
      intent = {
        type: 'function',
        target: this.extractTarget(query, ['function', 'func', 'method']),
        language: this.detectLanguage(query)
      };
    } else if (lowercaseQuery.includes('class') || lowercaseQuery.match(/class\s+\w+/)) {
      intent = {
        type: 'class',
        target: this.extractTarget(query, ['class']),
        language: this.detectLanguage(query)
      };
    } else if (lowercaseQuery.includes('import') || lowercaseQuery.includes('require')) {
      intent = {
        type: 'import',
        target: this.extractTarget(query, ['import', 'require', 'from']),
        language: this.detectLanguage(query)
      };
    } else if (lowercaseQuery.includes('config') || lowercaseQuery.includes('setting')) {
      intent = {
        type: 'config',
        target: this.extractTarget(query, ['config', 'setting', 'env'])
      };
    } else if (
      lowercaseQuery.includes('variable') ||
      lowercaseQuery.includes('const') ||
      lowercaseQuery.includes('let')
    ) {
      intent = {
        type: 'variable',
        target: this.extractTarget(query, ['variable', 'var', 'const', 'let']),
        language: this.detectLanguage(query)
      };
    } else {
      // Default to semantic search for natural language queries
      intent = {
        type: 'semantic',
        target: query,
        context: 'general'
      };
    }

    // Parse scope indicators
    if (lowercaseQuery.includes('in components') || lowercaseQuery.includes('component')) {
      scope.directories = ['src/components', 'components'];
      scope.fileTypes = ['.tsx', '.jsx', '.ts', '.js'];
    } else if (lowercaseQuery.includes('in services') || lowercaseQuery.includes('service')) {
      scope.directories = ['src/services', 'services'];
      scope.fileTypes = ['.ts', '.js'];
    } else if (lowercaseQuery.includes('in utils') || lowercaseQuery.includes('util')) {
      scope.directories = ['src/utils', 'utils', 'lib'];
      scope.fileTypes = ['.ts', '.js'];
    } else if (lowercaseQuery.includes('test') || lowercaseQuery.includes('spec')) {
      scope.includeTests = true;
      scope.fileTypes = ['.test.ts', '.test.js', '.spec.ts', '.spec.js'];
    }

    // Parse file type hints
    if (lowercaseQuery.includes('typescript') || lowercaseQuery.includes('.ts')) {
      scope.fileTypes = ['.ts', '.tsx'];
    } else if (lowercaseQuery.includes('javascript') || lowercaseQuery.includes('.js')) {
      scope.fileTypes = ['.js', '.jsx'];
    } else if (lowercaseQuery.includes('config') || lowercaseQuery.includes('json')) {
      scope.fileTypes = ['.json', '.yaml', '.yml', '.toml', '.env'];
    }

    return { intent, scope, filters, optimization };
  }

  /**
   * Perform intelligent search with token optimization
   */
  async search(query: string | SearchQuery): Promise<CompactSearchResult[]> {
    const cacheKey = typeof query === 'string' ? query : JSON.stringify(query);

    // Check cache first
    if (this.resultCache.has(cacheKey)) {
      return this.resultCache.get(cacheKey)!;
    }

    const parsedQuery = typeof query === 'string' ? this.parseNaturalLanguage(query) : query;

    // Multi-engine search
    const results = await Promise.all([
      this.exactSearch(parsedQuery),
      this.semanticSearch(parsedQuery),
      this.structuralSearch(parsedQuery)
    ]);

    // Merge and rank results
    const merged = this.mergeResults(results.flat());
    const ranked = this.rankByRelevance(merged, parsedQuery);

    // Optimize for token usage
    const optimized = this.optimizeResults(ranked, parsedQuery.optimization);

    // Cache results
    this.resultCache.set(cacheKey, optimized);

    return optimized;
  }

  /**
   * Expand a specific search result to show full context
   */
  async expandResult(resultId: string, contextLines: number = 5): Promise<string> {
    const cacheKey = `${resultId}-${contextLines}`;

    if (this.expandedCache.has(cacheKey)) {
      return this.expandedCache.get(cacheKey)!;
    }

    // Find the result from cache
    let targetResult: CompactSearchResult | undefined;
    for (const results of this.resultCache.values()) {
      targetResult = results.find(r => r.id === resultId);
      if (targetResult) break;
    }

    if (!targetResult) {
      throw new Error(`Search result with ID ${resultId} not found`);
    }

    // Read file content around the location
    const fullContext = await this.getFileContext(targetResult.location.file, targetResult.location.line, contextLines);

    this.expandedCache.set(cacheKey, fullContext);
    return fullContext;
  }

  /**
   * Extract the target term from query, removing common keywords
   */
  private extractTarget(query: string, keywords: string[]): string {
    let cleaned = query.toLowerCase();

    // Remove common search keywords
    for (const keyword of [...keywords, 'find', 'search', 'locate', 'get', 'show', 'in', 'for']) {
      cleaned = cleaned.replace(new RegExp(`\\b${keyword}\\b`, 'g'), ' ');
    }

    // Extract the main target (first significant word)
    const words = cleaned
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2);
    return words[0] || query.trim();
  }

  /**
   * Detect programming language from query context
   */
  private detectLanguage(query: string): string | undefined {
    const lowercaseQuery = query.toLowerCase();

    if (lowercaseQuery.includes('typescript') || lowercaseQuery.includes('.tsx') || lowercaseQuery.includes('.ts')) {
      return 'typescript';
    } else if (
      lowercaseQuery.includes('javascript') ||
      lowercaseQuery.includes('.jsx') ||
      lowercaseQuery.includes('.js')
    ) {
      return 'javascript';
    } else if (lowercaseQuery.includes('python') || lowercaseQuery.includes('.py')) {
      return 'python';
    } else if (lowercaseQuery.includes('react') || lowercaseQuery.includes('jsx')) {
      return 'react';
    }

    return undefined;
  }

  /**
   * Perform exact text/regex search
   */
  private async exactSearch(query: SearchQuery): Promise<CompactSearchResult[]> {
    // Use existing search functionality but return compact results
    const results: CompactSearchResult[] = [];

    try {
      // Search in database contexts first
      const dbResults = await this.searchDatabase(query);
      results.push(...dbResults);

      // Search in files if needed
      if (query.scope.directories || query.scope.files) {
        const fileResults = await this.searchFiles(query);
        results.push(...fileResults);
      }
    } catch (error) {
      console.warn('Exact search failed:', error);
    }

    return results;
  }

  /**
   * Perform semantic embedding-based search
   */
  private async semanticSearch(query: SearchQuery): Promise<CompactSearchResult[]> {
    if (query.intent.type !== 'semantic') {
      return [];
    }

    try {
      // Phase 1: Simplified implementation - returns empty results
      // Phase 2 will add full semantic search integration
      const semanticResults: any[] = [];

      return semanticResults.map((result: any, index: number) => ({
        id: `semantic-${index}`,
        type: 'semantic' as const,
        relevance: result.similarity || 0.5,
        summary: this.createSummary(result, 'semantic'),
        location: this.extractLocation(result),
        preview: this.createPreview(result, 50),
        metadata: {
          confidence: result.similarity || 0.5,
          contextWeight: 0.8,
          nodeType: 'context'
        },
        expandable: true,
        tokenCount: this.estimateTokens(this.createPreview(result, 50))
      }));
    } catch (error) {
      console.warn('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Perform structure-aware search (basic implementation for now)
   */
  private async structuralSearch(query: SearchQuery): Promise<CompactSearchResult[]> {
    // For Phase 1, this is a placeholder - Phase 2 will add AST search
    return [];
  }

  /**
   * Search in database contexts
   */
  private async searchDatabase(query: SearchQuery): Promise<CompactSearchResult[]> {
    const results: CompactSearchResult[] = [];

    try {
      const db = this.dbHandler.getDatabase();
      let dbQuery = 'SELECT * FROM context_items WHERE 1=1';
      const queryParams: any[] = [];

      // Add search conditions based on intent
      if (query.intent.target) {
        dbQuery += ' AND (key LIKE ? OR value LIKE ? OR tags LIKE ?)';
        const searchTerm = `%${query.intent.target}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
      }

      if (query.intent.type && query.intent.type !== 'semantic') {
        dbQuery += ' AND (type LIKE ? OR context_type LIKE ?)';
        queryParams.push(`%${query.intent.type}%`, `%${query.intent.type}%`);
      }

      dbQuery += ' ORDER BY created_at DESC LIMIT ?';
      queryParams.push(query.filters.maxResults || 10);

      const dbResults = db.prepare(dbQuery).all(...queryParams) as any[];

      for (const row of dbResults) {
        results.push({
          id: `db-${row.id}`,
          type: 'exact',
          relevance: this.calculateDatabaseRelevance(row, query),
          summary: this.createDatabaseSummary(row),
          location: {
            file: 'database',
            line: row.id
          },
          preview: this.createPreview(row.value, 50),
          metadata: {
            confidence: 0.9,
            contextWeight: 0.7,
            nodeType: row.type || 'context',
            lastModified: new Date(row.updated_at || row.created_at)
          },
          expandable: true,
          tokenCount: this.estimateTokens(this.createPreview(row.value, 50))
        });
      }
    } catch (error) {
      console.warn('Database search failed:', error);
    }

    return results;
  }

  /**
   * Search in files using existing file search
   */
  private async searchFiles(query: SearchQuery): Promise<CompactSearchResult[]> {
    const results: CompactSearchResult[] = [];

    try {
      // Use security validator to check search paths
      const safePaths = query.scope.directories || ['src'];

      for (const directory of safePaths) {
        if (await this.securityValidator.validatePath(directory, 'read')) {
          // Perform file search (simplified for Phase 1)
          const fileMatches = await this.searchInDirectory(directory, query);
          results.push(...fileMatches);
        }
      }
    } catch (error) {
      console.warn('File search failed:', error);
    }

    return results;
  }

  /**
   * Search within a specific directory
   */
  private async searchInDirectory(directory: string, query: SearchQuery): Promise<CompactSearchResult[]> {
    // Simplified file search for Phase 1 - Phase 2 will add full file system search
    return [];
  }

  /**
   * Merge results from different search engines
   */
  private mergeResults(results: CompactSearchResult[]): CompactSearchResult[] {
    const seen = new Set<string>();
    const merged: CompactSearchResult[] = [];

    for (const result of results) {
      const key = `${result.location.file}:${result.location.line}:${result.preview}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(result);
      }
    }

    return merged;
  }

  /**
   * Rank results by relevance using multiple factors
   */
  private rankByRelevance(results: CompactSearchResult[], query: SearchQuery): CompactSearchResult[] {
    return results.sort((a, b) => {
      let scoreA = this.calculateRelevanceScore(a, query);
      let scoreB = this.calculateRelevanceScore(b, query);

      return scoreB - scoreA; // Descending order
    });
  }

  /**
   * Calculate relevance score for a result
   */
  private calculateRelevanceScore(result: CompactSearchResult, query: SearchQuery): number {
    let score = result.relevance * 100;

    // Boost exact matches
    if (result.type === 'exact') score += 50;
    if (result.summary.toLowerCase().includes(query.intent.target.toLowerCase())) score += 30;

    // Boost recent files
    if (result.metadata.lastModified && result.metadata.lastModified > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      score += 20;
    }

    // Boost active workspace files
    if (result.metadata.inActiveWorkspace) score += 15;

    // Boost by confidence
    score += result.metadata.confidence * 10;

    return score;
  }

  /**
   * Optimize results for token efficiency
   */
  private optimizeResults(results: CompactSearchResult[], optimization: TokenOptimization): CompactSearchResult[] {
    if (optimization.summaryOnly) {
      return results.map(result => ({
        ...result,
        preview: this.truncatePreview(result.preview, 30),
        tokenCount: this.estimateTokens(this.truncatePreview(result.preview, 30))
      }));
    }

    return results;
  }

  /**
   * Create a smart summary for a result
   */
  private createSummary(result: any, type: string): string {
    if (type === 'semantic') {
      return `Context: ${result.key || 'Unknown'} (${((result.similarity || 0.5) * 100).toFixed(1)}% match)`;
    }

    return `${result.type || 'Item'}: ${result.key || 'Unknown'}`;
  }

  /**
   * Create a database-specific summary
   */
  private createDatabaseSummary(row: any): string {
    const type = row.type || row.context_type || 'Context';
    const key = row.key || 'Unknown';
    const value = row.value ? String(row.value).substring(0, 30) + '...' : '';

    return `${type}: ${key} → ${value}`;
  }

  /**
   * Extract location from result
   */
  private extractLocation(result: any): SourceLocation {
    return {
      file: result.file || result.source || 'database',
      line: result.line || result.id || 1
    };
  }

  /**
   * Create a preview of content
   */
  private createPreview(content: any, maxLength: number): string {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * Truncate preview to specific length
   */
  private truncatePreview(preview: string, maxLength: number): string {
    return preview.length > maxLength ? preview.substring(0, maxLength) + '...' : preview;
  }

  /**
   * Calculate database result relevance
   */
  private calculateDatabaseRelevance(row: any, query: SearchQuery): number {
    let relevance = 0.5; // Base relevance

    const target = query.intent.target.toLowerCase();
    const key = (row.key || '').toLowerCase();
    const value = (row.value || '').toLowerCase();
    const tags = (row.tags || '').toLowerCase();

    // Exact key match
    if (key === target) relevance += 0.4;
    else if (key.includes(target)) relevance += 0.2;

    // Value match
    if (value.includes(target)) relevance += 0.2;

    // Tags match
    if (tags.includes(target)) relevance += 0.1;

    return Math.min(relevance, 1.0);
  }

  /**
   * Get file context around a specific line
   */
  private async getFileContext(filePath: string, line: number, contextLines: number): Promise<string> {
    try {
      if (filePath === 'database') {
        return `Database record at ID ${line}`;
      }

      // Phase 1: Simplified file context
      return `File: ${filePath} at line ${line} (±${contextLines} lines)`;
    } catch (error) {
      return `Error reading context from ${filePath}: ${error}`;
    }
  }

  /**
   * Estimate token count for content (rough approximation)
   */
  private estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Clear caches to free memory
   */
  clearCache(): void {
    this.resultCache.clear();
    this.expandedCache.clear();
  }
}
