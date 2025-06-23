# Implementation Specification: Intelligent Search & Surgical Editing

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Tool Layer                            │
├─────────────────────────────────────────────────────────────┤
│  SmartSearchTool  │  SurgicalEditTool  │  BatchEditTool     │
├─────────────────────────────────────────────────────────────┤
│                  Service Layer                              │  
├─────────────────────────────────────────────────────────────┤
│ QueryParserService │ ASTSearchService │ EditValidationService│
├─────────────────────────────────────────────────────────────┤
│                  Engine Layer                               │
├─────────────────────────────────────────────────────────────┤
│  SearchEngine  │  EditEngine  │  TokenOptimizer  │ Validator │
├─────────────────────────────────────────────────────────────┤
│                  Data Layer                                 │
├─────────────────────────────────────────────────────────────┤
│   AST Cache   │  Search Index  │  Edit History  │  Patterns │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 Core Services

### 1. QueryParserService
```typescript
export interface SearchQuery {
  intent: SearchIntent;
  scope: SearchScope;
  filters: SearchFilters;
  optimization: TokenOptimization;
}

export interface SearchIntent {
  type: 'function' | 'class' | 'variable' | 'import' | 'config' | 'pattern' | 'semantic';
  target: string;
  context?: string;
  language?: string;
}

export interface SearchScope {
  files?: string[];
  directories?: string[];
  workspace?: boolean;
  includeTests?: boolean;
  includeNodeModules?: boolean;
}

export interface SearchFilters {
  minRelevance?: number;
  maxResults?: number;
  fileTypes?: string[];
  excludePatterns?: string[];
}

export interface TokenOptimization {
  summaryOnly?: boolean;
  maxContextLines?: number;
  progressive?: boolean;
  compression?: number;
}

@injectable()
export class QueryParserService {
  parseNaturalLanguage(query: string): SearchQuery {
    // Parse natural language queries like:
    // "find function handleSubmit in components"
    // "find React imports"
    // "find database configuration"
  }

  parseStructured(query: StructuredQuery): SearchQuery {
    // Parse structured queries like:
    // { type: 'function', name: 'handleSubmit', scope: ['src/components'] }
  }
}
```

### 2. ASTSearchService
```typescript
export interface ASTNode {
  type: string;
  name: string;
  location: SourceLocation;
  metadata: Record<string, any>;
  parent?: ASTNode;
  children: ASTNode[];
}

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface ASTSearchResult {
  node: ASTNode;
  relevance: number;
  context: string;
  surrounding: string;
}

@injectable()
export class ASTSearchService {
  private astCache: Map<string, ASTNode> = new Map();
  
  async searchFunctions(name: string, scope: SearchScope): Promise<ASTSearchResult[]> {
    // Use Tree-sitter or similar to parse code files
    // Cache ASTs for performance
    // Return precise function matches
  }

  async searchClasses(name: string, scope: SearchScope): Promise<ASTSearchResult[]> {
    // Find class definitions and references
  }

  async searchImports(pattern: string, scope: SearchScope): Promise<ASTSearchResult[]> {
    // Find import statements matching pattern
  }

  async getNodeContext(node: ASTNode, contextLines: number = 3): Promise<string> {
    // Return minimal context around AST node
    // Token-efficient representation
  }
}
```

### 3. SmartSearchEngine
```typescript
export interface SmartSearchResult {
  id: string;
  type: 'exact' | 'semantic' | 'structural' | 'pattern';
  relevance: number;
  summary: string;
  location: SourceLocation;
  preview: string;
  metadata: SearchResultMetadata;
  expandable: boolean;
}

export interface SearchResultMetadata {
  language: string;
  nodeType?: string;
  confidence: number;
  contextWeight: number;
  tokenCount: number;
}

@injectable()
export class SmartSearchEngine {
  constructor(
    @inject('QueryParserService') private queryParser: QueryParserService,
    @inject('ASTSearchService') private astSearch: ASTSearchService,
    @inject('EmbeddingService') private embeddings: IEmbeddingService,
    @inject('TokenOptimizer') private tokenOptimizer: TokenOptimizer
  ) {}

  async search(query: string | SearchQuery): Promise<SmartSearchResult[]> {
    const parsedQuery = typeof query === 'string' 
      ? this.queryParser.parseNaturalLanguage(query)
      : query;

    // Multi-engine search
    const results = await Promise.all([
      this.exactSearch(parsedQuery),
      this.astSearch(parsedQuery),
      this.semanticSearch(parsedQuery)
    ]);

    // Merge and rank results
    const merged = this.mergeResults(results.flat());
    const ranked = this.rankByRelevance(merged, parsedQuery);
    
    // Optimize for token usage
    return this.tokenOptimizer.optimizeResults(ranked, parsedQuery.optimization);
  }

  private async exactSearch(query: SearchQuery): Promise<SmartSearchResult[]> {
    // Traditional text/regex search with smart ranking
  }

  private async astSearch(query: SearchQuery): Promise<SmartSearchResult[]> {
    // Structure-aware search using AST
  }

  private async semanticSearch(query: SearchQuery): Promise<SmartSearchResult[]> {
    // Embedding-based semantic search
  }
}
```

### 4. SurgicalEditService
```typescript
export interface EditTarget {
  type: 'line' | 'range' | 'function' | 'class' | 'variable' | 'config';
  file: string;
  location: SourceLocation;
  identifier?: string;
}

export interface SurgicalEdit {
  target: EditTarget;
  operation: 'replace' | 'insert' | 'delete' | 'modify';
  content: string;
  validation: EditValidation;
}

export interface EditValidation {
  syntaxCheck: boolean;
  typeCheck: boolean;
  testCheck: boolean;
  dependencies: string[];
}

export interface EditResult {
  success: boolean;
  changes: FileChange[];
  validation: ValidationResult;
  rollbackId: string;
}

@injectable()
export class SurgicalEditService {
  async findEditTarget(description: string): Promise<EditTarget[]> {
    // "function handleSubmit in UserForm.tsx"
    // "config database.host in server.yaml"
    // "import statement for React in App.tsx"
  }

  async validateEdit(edit: SurgicalEdit): Promise<ValidationResult> {
    // Syntax validation
    // Type checking (if TypeScript/etc)
    // Dependency impact analysis
    // Test impact prediction
  }

  async applyEdit(edit: SurgicalEdit): Promise<EditResult> {
    // Apply the edit with full validation
    // Create rollback checkpoint
    // Update related files if needed
  }

  async batchEdit(edits: SurgicalEdit[]): Promise<EditResult[]> {
    // Coordinate multiple related edits
    // Ensure consistency across files
    // Atomic operation (all succeed or all fail)
  }
}
```

### 5. TokenOptimizer
```typescript
@injectable()
export class TokenOptimizer {
  optimizeResults(results: SmartSearchResult[], options: TokenOptimization): SmartSearchResult[] {
    if (options.summaryOnly) {
      return results.map(r => ({
        ...r,
        preview: this.createSummary(r),
        expandable: true
      }));
    }

    if (options.maxContextLines) {
      return results.map(r => ({
        ...r,
        preview: this.limitContext(r, options.maxContextLines)
      }));
    }

    return results;
  }

  private createSummary(result: SmartSearchResult): string {
    // Create 1-2 line summary instead of full content
    // "Function handleSubmit in UserForm.tsx:45 - handles form submission"
    // "Config API_URL in config/server.yaml:12 - currently 'localhost:3000'"
  }

  estimateTokens(content: string): number {
    // Rough token estimation for planning
  }

  compressContent(content: string, targetTokens: number): string {
    // Intelligent content compression while preserving meaning
  }
}
```

## 🛠️ MCP Tools

### SmartSearchTool
```typescript
@injectable()
export class SmartSearchTool extends BaseTool {
  readonly name = 'smart_search';
  readonly description = 'Intelligent search with semantic understanding and token efficiency';

  async execute(params: {
    query: string;
    scope?: string;
    mode?: 'summary' | 'detailed' | 'progressive';
    maxResults?: number;
    language?: string;
  }): Promise<ToolResult> {
    const results = await this.searchEngine.search(params.query);
    
    return {
      success: true,
      data: {
        results: results.slice(0, params.maxResults || 10),
        totalFound: results.length,
        tokenUsage: this.calculateTokenUsage(results),
        expandableResults: results.filter(r => r.expandable).length
      }
    };
  }
}
```

### SurgicalEditTool
```typescript
@injectable()
export class SurgicalEditTool extends BaseTool {
  readonly name = 'surgical_edit';
  readonly description = 'Precise, validated editing with rollback capability';

  async execute(params: {
    target: string; // "function:handleSubmit" or "config:database.host" 
    operation: 'replace' | 'insert' | 'delete' | 'modify';
    content: string;
    validate?: boolean;
    preview?: boolean;
  }): Promise<ToolResult> {
    const targets = await this.editService.findEditTarget(params.target);
    
    if (targets.length === 0) {
      return { success: false, error: 'Edit target not found' };
    }

    if (targets.length > 1) {
      return { 
        success: false, 
        error: 'Multiple targets found, please be more specific',
        data: { possibleTargets: targets.map(t => this.describeTarget(t)) }
      };
    }

    const edit: SurgicalEdit = {
      target: targets[0],
      operation: params.operation,
      content: params.content,
      validation: { syntaxCheck: true, typeCheck: true, testCheck: false, dependencies: [] }
    };

    if (params.preview) {
      const validation = await this.editService.validateEdit(edit);
      return {
        success: true,
        data: {
          preview: this.generatePreview(edit),
          validation,
          willProceed: validation.success
        }
      };
    }

    const result = await this.editService.applyEdit(edit);
    return {
      success: result.success,
      data: result
    };
  }
}
```

### ExpandResultTool
```typescript
@injectable()
export class ExpandResultTool extends BaseTool {
  readonly name = 'expand_result';
  readonly description = 'Expand a summarized search result to show full context';

  async execute(params: { resultId: string; contextLines?: number }): Promise<ToolResult> {
    // Show full context for a specific search result
    // Token-efficient progressive disclosure
  }
}
```

## 📈 Usage Examples

### Current vs New Comparison:

**Finding a Function (Current):**
```bash
search_files --pattern "handleSubmit" --directory "src"
# Returns: 2,847 tokens, 15 files, lots of noise

content_edit_file --find "handleSubmit" --replace "handleFormSubmit" 
# Risk: Might change wrong occurrences
```

**Finding a Function (New):**
```bash
smart_search "find function handleSubmit in components"
# Returns: 127 tokens, 3 precise matches, zero noise

surgical_edit --target "function:handleSubmit in UserForm" --operation "rename" --content "handleFormSubmit" --validate
# Result: Precise, validated, safe
```

**Configuration Changes (Current):**
```bash
search_files --pattern "API_URL" 
# Returns: 1,200+ tokens, multiple config files, environment variables, comments

content_edit_file --find "API_URL = 'localhost'" --replace "API_URL = 'production.com'"
# Risk: Might miss some occurrences or change wrong ones
```

**Configuration Changes (New):**
```bash
smart_search "find config API_URL"
# Returns: 89 tokens, exact config locations only

surgical_edit --target "config:API_URL" --content "'production.com'" --validate
# Result: All config occurrences updated safely
```

## 🚀 Implementation Priority

### Phase 1 (Immediate Impact):
1. **QueryParserService** - Parse natural language search queries
2. **SmartSearchTool** - Replace basic search with intelligent version
3. **TokenOptimizer** - Reduce token usage by 80%
4. **SurgicalEditTool** - Precise editing capabilities

### Phase 2 (Advanced Features):
1. **ASTSearchService** - Structure-aware code search
2. **BatchEditTool** - Multi-file coordinated edits
3. **ValidationPipeline** - Pre-edit safety checks
4. **RollbackSystem** - Safe editing with undo

### Phase 3 (Intelligence):
1. **Context Awareness** - Understand current task
2. **Pattern Learning** - Learn from user behavior  
3. **Smart Suggestions** - Predict user intent
4. **Auto-completion** - Suggest searches and edits

## 💡 Expected Benefits

- **🎯 10x more precise** - Find exactly what you need
- **⚡ 90% fewer tokens** - Efficient summaries and progressive disclosure
- **🔧 100% safe edits** - Validation and rollback capabilities  
- **🧠 Intelligent assistance** - Understands your intent and context
- **🚀 Faster workflow** - No more digging through irrelevant results

Ready to start building this system? Which phase should we implement first?
