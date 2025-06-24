// Intelligent Search Service for Token-Efficient Context Discovery
// File: src/application/services/intelligent-search.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { IEmbeddingService } from '../../core/interfaces/semantic-context.interface.js';
import { SecurityValidatorService } from './security-validator.service.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { parseScript, parseModule } from 'meriyah';

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
    @inject('EmbeddingService') private embeddingService: IEmbeddingService,
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
      // Initialize embedding service if needed
      await this.embeddingService.initialize();

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query.intent.target);

      // Search database for contexts with embeddings
      const results: CompactSearchResult[] = [];
      const db = this.dbHandler.getDatabase();

      // Get contexts that have embeddings
      let dbQuery = 'SELECT * FROM context_items WHERE embedding IS NOT NULL';
      const queryParams: any[] = [];

      // Apply filters
      if (query.filters.maxResults) {
        dbQuery += ' LIMIT ?';
        queryParams.push(query.filters.maxResults * 2); // Get more to filter by similarity
      }

      const dbResults = db.prepare(dbQuery).all(...queryParams) as any[];

      // Calculate similarities and filter by threshold
      for (const row of dbResults) {
        try {
          // Parse embedding from database (assuming it's stored as JSON string)
          let embedding: number[];
          if (typeof row.embedding === 'string') {
            embedding = JSON.parse(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            embedding = row.embedding;
          } else {
            continue; // Skip invalid embeddings
          }

          // Calculate similarity
          const similarity = this.embeddingService.calculateSimilarity(queryEmbedding, embedding);

          // Apply minimum similarity threshold
          if (similarity >= (query.filters.minRelevance || 0.3)) {
            results.push({
              id: `semantic-${row.id}`,
              type: 'semantic',
              relevance: similarity,
              summary: this.createSemanticSummary(row, similarity),
              location: {
                file: row.source || 'database',
                line: row.id
              },
              preview: this.createPreview(row.value, 80),
              metadata: {
                confidence: similarity,
                contextWeight: 0.9,
                nodeType: row.type || 'context',
                lastModified: new Date(row.updated_at || row.created_at)
              },
              expandable: true,
              tokenCount: this.estimateTokens(this.createPreview(row.value, 80))
            });
          }
        } catch (error) {
          console.warn('Error processing semantic result:', error);
          continue;
        }
      }

      // Sort by relevance and limit results
      results.sort((a, b) => b.relevance - a.relevance);
      return results.slice(0, query.filters.maxResults || 10);

    } catch (error) {
      console.warn('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Perform structure-aware search with basic AST-like functionality
   */
  private async structuralSearch(query: SearchQuery): Promise<CompactSearchResult[]> {
    // Enhanced structural search for common programming patterns
    if (!['function', 'class', 'variable', 'import'].includes(query.intent.type)) {
      return [];
    }

    const results: CompactSearchResult[] = [];

    try {
      // Get files to search based on scope
      const filesToSearch = await this.getSearchFiles(query.scope);

      for (const filePath of filesToSearch) {
        if (await this.securityValidator.validatePath(filePath, 'read')) {
          const fileResults = await this.searchInFile(filePath, query);
          results.push(...fileResults);
        }
      }

      return results;
    } catch (error) {
      console.warn('Structural search failed:', error);
      return [];
    }
  }

  /**
   * Get list of files to search based on scope
   */
  private async getSearchFiles(scope: SearchScope): Promise<string[]> {
    const files: string[] = [];

    // Add explicit files
    if (scope.files) {
      files.push(...scope.files);
    }

    // Search directories
    if (scope.directories) {
      for (const directory of scope.directories) {
        try {
          if (await this.securityValidator.validatePath(directory, 'read')) {
            const dirFiles = await this.getFilesFromDirectory(directory, scope);
            files.push(...dirFiles);
          }
        } catch (error) {
          console.warn(`Failed to search directory ${directory}:`, error);
        }
      }
    }

    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Get files from a directory with filtering
   */
  private async getFilesFromDirectory(directory: string, scope: SearchScope): Promise<string[]> {
    const files: string[] = [];

    try {
      if (!await fs.pathExists(directory)) {
        return files;
      }

      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories (with depth limit)
          if (!entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
            const subFiles = await this.getFilesFromDirectory(fullPath, scope);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // Check file type filters
          if (this.matchesFileFilter(entry.name, scope)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${directory}:`, error);
    }

    return files;
  }

  /**
   * Check if file matches the scope filters
   */
  private matchesFileFilter(fileName: string, scope: SearchScope): boolean {
    // Check file type filters
    if (scope.fileTypes && scope.fileTypes.length > 0) {
      return scope.fileTypes.some(ext => fileName.endsWith(ext));
    }

    // Default to common code files
    const defaultExtensions = ['.ts', '.js', '.tsx', '.jsx', '.json', '.yaml', '.yml'];
    return defaultExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Search for patterns within a specific file using AST parsing for better accuracy
   */
  private async searchInFile(filePath: string, query: SearchQuery): Promise<CompactSearchResult[]> {
    const results: CompactSearchResult[] = [];
    const fileExtension = path.extname(filePath).toLowerCase();

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Use AST parsing for JavaScript/TypeScript files
      if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(fileExtension)) {
        const astResults = await this.searchWithAST(content, filePath, query);
        results.push(...astResults);
      } else {
        // Fall back to pattern matching for other file types
        const patternResults = await this.searchWithPatterns(content, filePath, query);
        results.push(...patternResults);
      }
    } catch (error) {
      console.warn(`Error searching file ${filePath}:`, error);
      
      // If AST parsing fails, fall back to pattern matching
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const patternResults = await this.searchWithPatterns(content, filePath, query);
        results.push(...patternResults);
      } catch (fallbackError) {
        console.warn(`Fallback pattern search also failed for ${filePath}:`, fallbackError);
      }
    }

    return results;
  }

  /**
   * Enhanced AST-based search for JavaScript/TypeScript files
   */
  private async searchWithAST(content: string, filePath: string, query: SearchQuery): Promise<CompactSearchResult[]> {
    const results: CompactSearchResult[] = [];

    try {
      // Parse the file as a module (works for most modern JS/TS)
      let ast: any;
      try {
        ast = parseModule(content, { 
          loc: true, 
          ranges: true,
          next: true // Support modern JS features
        });
      } catch (moduleError) {
        // If module parsing fails, try script parsing
        ast = parseScript(content, { 
          loc: true, 
          ranges: true,  
          next: true
        });
      }

      // Walk the AST to find matching nodes
      this.walkAST(ast, content, filePath, query, results);

    } catch (error) {
      console.warn(`AST parsing failed for ${filePath}:`, error);
      throw error; // Re-throw to trigger fallback
    }

    return results;
  }

  /**
   * Walk the AST and find nodes matching the search query
   */
  private walkAST(
    node: any, 
    content: string, 
    filePath: string, 
    query: SearchQuery, 
    results: CompactSearchResult[]
  ): void {
    if (!node || typeof node !== 'object') return;

    // Check if this node matches our search criteria
    if (this.nodeMatchesQuery(node, query)) {
      const result = this.createASTSearchResult(node, content, filePath, query);
      if (result) {
        results.push(result);
      }
    }

    // Recursively walk child nodes
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => this.walkAST(c, content, filePath, query, results));
      } else if (child && typeof child === 'object') {
        this.walkAST(child, content, filePath, query, results);
      }
    }
  }

  /**
   * Check if an AST node matches the search query
   */
  private nodeMatchesQuery(node: any, query: SearchQuery): boolean {
    const target = query.intent.target.toLowerCase();

    switch (query.intent.type) {
      case 'function':
        return (
          (node.type === 'FunctionDeclaration' && 
           node.id?.name?.toLowerCase().includes(target)) ||
          (node.type === 'VariableDeclarator' && 
           node.id?.name?.toLowerCase().includes(target) && 
           (node.init?.type === 'FunctionExpression' || node.init?.type === 'ArrowFunctionExpression')) ||
          (node.type === 'MethodDefinition' && 
           node.key?.name?.toLowerCase().includes(target)) ||
          (node.type === 'Property' && 
           node.key?.name?.toLowerCase().includes(target) && 
           (node.value?.type === 'FunctionExpression' || node.value?.type === 'ArrowFunctionExpression'))
        );

      case 'class':
        return (
          (node.type === 'ClassDeclaration' && 
           node.id?.name?.toLowerCase().includes(target)) ||
          (node.type === 'TSInterfaceDeclaration' && 
           node.id?.name?.toLowerCase().includes(target)) ||
          (node.type === 'TSTypeAliasDeclaration' && 
           node.id?.name?.toLowerCase().includes(target))
        );

      case 'variable':
        return (
          node.type === 'VariableDeclarator' && 
          node.id?.name?.toLowerCase().includes(target)
        );

      case 'import':
        return (
          (node.type === 'ImportDeclaration' && 
           (node.source?.value?.toLowerCase().includes(target) ||
            node.specifiers?.some((spec: any) => 
              spec.local?.name?.toLowerCase().includes(target) ||
              spec.imported?.name?.toLowerCase().includes(target)
            ))) ||
          (node.type === 'CallExpression' && 
           node.callee?.name === 'require' &&
           node.arguments?.[0]?.value?.toLowerCase().includes(target))
        );

      default:
        return false;
    }
  }

  /**
   * Create a search result from an AST node
   */
  private createASTSearchResult(
    node: any, 
    content: string, 
    filePath: string, 
    query: SearchQuery
  ): CompactSearchResult | null {
    if (!node.loc) return null;

    const lines = content.split('\n');
    const startLine = node.loc.start.line;
    const endLine = node.loc.end.line;
    
    // Get the actual code for this node
    const nodeLines = lines.slice(startLine - 1, endLine);
    const preview = nodeLines.join(' ').trim().substring(0, 100);

    // Get the name of the node (function name, class name, etc.)
    const nodeName = this.getNodeName(node) || query.intent.target;

    return {
      id: `ast-${path.basename(filePath)}-${startLine}-${nodeName.replace(/\s+/g, '')}`,
      type: 'structural',
      relevance: this.calculateASTRelevance(node, query.intent.target),
      summary: this.createASTSummary(node, nodeName, filePath, startLine),
      location: {
        file: filePath,
        line: startLine,
        column: node.loc.start.column,
        endLine: endLine,
        endColumn: node.loc.end.column
      },
      preview: preview,
      metadata: {
        confidence: 0.95, // AST parsing is more confident than regex
        contextWeight: 0.9,
        nodeType: node.type,
        language: this.detectLanguageFromFile(filePath)
      },
      expandable: true,
      tokenCount: this.estimateTokens(preview)
    };
  }

  /**
   * Get the name of an AST node
   */
  private getNodeName(node: any): string | null {
    if (node.id?.name) return node.id.name;
    if (node.key?.name) return node.key.name;
    if (node.local?.name) return node.local.name;
    if (node.imported?.name) return node.imported.name;
    return null;
  }

  /**
   * Calculate relevance score for AST matches
   */
  private calculateASTRelevance(node: any, target: string): number {
    const nodeName = this.getNodeName(node)?.toLowerCase() || '';
    const targetLower = target.toLowerCase();

    // Exact match gets highest score
    if (nodeName === targetLower) {
      return 0.98;
    }

    // Contains target gets high score
    if (nodeName.includes(targetLower)) {
      return 0.9;
    }

    // Similar name gets medium score
    if (nodeName.startsWith(targetLower) || nodeName.endsWith(targetLower)) {
      return 0.8;
    }

    return 0.7;
  }

  /**
   * Create summary for AST search results
   */
  private createASTSummary(node: any, nodeName: string, filePath: string, line: number): string {
    const fileName = path.basename(filePath);
    const nodeType = this.friendlyNodeType(node.type);
    return `${nodeType}: ${nodeName} in ${fileName}:${line}`;
  }

  /**
   * Convert AST node type to friendly name
   */
  private friendlyNodeType(nodeType: string): string {
    switch (nodeType) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return 'Function';
      case 'ClassDeclaration':
        return 'Class';
      case 'MethodDefinition':
        return 'Method';
      case 'VariableDeclarator':
        return 'Variable';
      case 'ImportDeclaration':
        return 'Import';
      case 'TSInterfaceDeclaration':
        return 'Interface';
      case 'TSTypeAliasDeclaration':
        return 'Type';
      default:
        return 'Code';
    }
  }

  /**
   * Fallback pattern-based search for non-JS/TS files
   */
  private async searchWithPatterns(content: string, filePath: string, query: SearchQuery): Promise<CompactSearchResult[]> {
    const results: CompactSearchResult[] = [];
    const lines = content.split('\n');

    // Define search patterns based on query intent
    let patterns: RegExp[] = [];

    switch (query.intent.type) {
      case 'function':
        patterns = [
          new RegExp(`function\\s+${query.intent.target}\\s*\\(`, 'gi'),
          new RegExp(`const\\s+${query.intent.target}\\s*=\\s*\\(`, 'gi'),
          new RegExp(`let\\s+${query.intent.target}\\s*=\\s*\\(`, 'gi'),
          new RegExp(`${query.intent.target}\\s*:\\s*\\(`, 'gi'), // Object method
          new RegExp(`async\\s+${query.intent.target}\\s*\\(`, 'gi'),
          new RegExp(`${query.intent.target}\\s*\\(.*\\)\\s*=>`, 'gi') // Arrow function
        ];
        break;

      case 'class':
        patterns = [
          new RegExp(`class\\s+${query.intent.target}\\b`, 'gi'),
          new RegExp(`interface\\s+${query.intent.target}\\b`, 'gi'),
          new RegExp(`type\\s+${query.intent.target}\\b`, 'gi')
        ];
        break;

      case 'variable':
        patterns = [
          new RegExp(`const\\s+${query.intent.target}\\b`, 'gi'),
          new RegExp(`let\\s+${query.intent.target}\\b`, 'gi'),
          new RegExp(`var\\s+${query.intent.target}\\b`, 'gi')
        ];
        break;

      case 'import':
        patterns = [
          new RegExp(`import.*${query.intent.target}`, 'gi'),
          new RegExp(`from\\s+['"\`].*${query.intent.target}.*['"\`]`, 'gi')
        ];
        break;
    }

    // Search for patterns in file
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const pattern of patterns) {
        const matches = line.match(pattern);
        if (matches) {
          for (const match of matches) {
            results.push({
              id: `pattern-${path.basename(filePath)}-${lineIndex}-${match.replace(/\s+/g, '')}`,
              type: 'structural',
              relevance: this.calculateStructuralRelevance(match, query.intent.target),
              summary: this.createStructuralSummary(query.intent.type, query.intent.target, filePath, lineIndex + 1),
              location: {
                file: filePath,
                line: lineIndex + 1,
                column: line.indexOf(match) + 1
              },
              preview: line.trim(),
              metadata: {
                confidence: 0.8, // Pattern matching is less confident than AST
                contextWeight: 0.7,
                nodeType: query.intent.type,
                language: this.detectLanguageFromFile(filePath)
              },
              expandable: true,
              tokenCount: this.estimateTokens(line.trim())
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Calculate relevance score for structural matches
   */
  private calculateStructuralRelevance(match: string, target: string): number {
    const matchLower = match.toLowerCase();
    const targetLower = target.toLowerCase();

    // Exact match gets highest score
    if (matchLower.includes(targetLower)) {
      return 0.95;
    }

    // Partial match gets medium score
    if (matchLower.includes(targetLower.substring(0, Math.floor(targetLower.length / 2)))) {
      return 0.7;
    }

    return 0.5;
  }

  /**
   * Create summary for structural search results
   */
  private createStructuralSummary(type: string, target: string, filePath: string, line: number): string {
    const fileName = path.basename(filePath);
    return `${type.charAt(0).toUpperCase() + type.slice(1)}: ${target} in ${fileName}:${line}`;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguageFromFile(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.json':
        return 'json';
      case '.yaml':
      case '.yml':
        return 'yaml';
      default:
        return 'text';
    }
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
    const results: CompactSearchResult[] = [];

    try {
      const files = await this.getFilesFromDirectory(directory, query.scope);
      
      for (const file of files.slice(0, 20)) { // Limit to prevent too many results
        const fileResults = await this.searchInFile(file, query);
        results.push(...fileResults);
      }
    } catch (error) {
      console.warn(`Error searching directory ${directory}:`, error);
    }

    return results;
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
   * Create a semantic search summary
   */
  private createSemanticSummary(row: any, similarity: number): string {
    const type = row.type || row.context_type || 'Context';
    const key = row.key || 'Unknown';
    const matchPercent = (similarity * 100).toFixed(1);
    
    return `${type}: ${key} (${matchPercent}% semantic match)`;
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

      if (await this.securityValidator.validatePath(filePath, 'read')) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        const startLine = Math.max(0, line - contextLines - 1);
        const endLine = Math.min(lines.length, line + contextLines);
        
        const contextedLines = lines.slice(startLine, endLine);
        return contextedLines
          .map((l, i) => `${startLine + i + 1}: ${l}`)
          .join('\n');
      } else {
        return `Access denied to file: ${filePath}`;
      }
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
