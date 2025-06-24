// Enhanced Smart Path Tools with Proper Database Handler Integration
// File: src/application/tools/smart-paths-enhanced.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';

// Enhanced schema with proper contextKeys handling
const createSmartPathSchema = z.object({
  name: z.string().describe('Name for the smart path'),
  path_name: z.string().optional().describe('Alias for name (backward compatibility)'),
  description: z.string().optional().describe('Description (stored in metadata)'),
  type: z.enum(['item_bundle', 'query_template', 'file_set']).describe('Type of smart path'),
  definition: z.union([
    z.object({
      items: z.array(z.string()).describe('Array of context keys for item bundles'),
      keys: z.array(z.string()).optional().describe('Legacy keys parameter'),
      query: z.string().optional().describe('Query template for query_template type'),
      paths: z.array(z.string()).optional().describe('File paths for file_set type'),
      metadata: z.record(z.unknown()).optional().describe('Additional metadata')
    }),
    z.string().describe('JSON string definition (backward compatibility)')
  ]).describe('Smart path definition object or JSON string'),
  // Legacy parameters for backward compatibility
  context_keys: z.string().optional().describe('JSON array of context keys (backward compatibility)'),
  steps: z.string().optional().describe('Legacy steps parameter (backward compatibility)')
});

const executeSmartPathSchema = z.object({
  id: z.string().describe('ID of the smart path to execute'),
  params: z.record(z.unknown()).optional().default({}).describe('Parameters for the smart path'),
  contextKeys: z.array(z.string()).optional().describe('Array of context keys to process with the smart path')
});

const listSmartPathsSchema = z.object({
  limit: z.number().optional().default(10).describe('Maximum number of smart paths to return')
});

@injectable()
export class CreateSmartPathTool implements IMCPTool {
  name = 'create_smart_path';
  description = 'Create a smart path for efficient context bundling with proper parameter validation';
  schema = createSmartPathSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof createSmartPathSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Resolve name (handle legacy path_name)
      const name = params.name || params.path_name;
      if (!name) {
        throw new Error('Name is required for smart path creation');
      }

      // Parse definition
      let definition;
      if (typeof params.definition === 'string') {
        try {
          definition = JSON.parse(params.definition);
        } catch (error) {
          throw new Error(`Invalid JSON in definition: ${error instanceof Error ? error.message : 'Parse error'}`);
        }
      } else {
        definition = params.definition;
      }

      // Handle legacy context_keys parameter
      if (params.context_keys && !definition.items) {
        try {
          const contextKeys = JSON.parse(params.context_keys);
          if (Array.isArray(contextKeys)) {
            definition.items = contextKeys;
          }
        } catch (error) {
          throw new Error(`Invalid JSON in context_keys: ${error instanceof Error ? error.message : 'Parse error'}`);
        }
      }

      // Validate definition based on type
      this.validateDefinition(params.type, definition);

      // Add description to metadata
      if (params.description && !definition.metadata) {
        definition.metadata = {};
      }
      if (params.description) {
        definition.metadata.description = params.description;
      }

      // Create smart path record
      const smartPathId = `smart_path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await this.db.storeContext(smartPathId, {
        name,
        type: params.type,
        definition,
        createdAt: new Date().toISOString(),
        version: '1.0'
      }, 'smart_path');

      const response = {
        success: true,
        smart_path_id: smartPathId,
        name,
        type: params.type,
        definition,
        message: `Smart path '${name}' created successfully`
      };

      context.logger.info({ smartPathId, name, type: params.type }, 'Smart path created');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create smart path');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create smart path: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private validateDefinition(type: string, definition: any): void {
    switch (type) {
      case 'item_bundle':
        if (!definition.items || !Array.isArray(definition.items)) {
          throw new Error('item_bundle type requires "items" array in definition');
        }
        if (definition.items.length === 0) {
          throw new Error('items array cannot be empty for item_bundle');
        }
        break;
      
      case 'query_template':
        if (!definition.query || typeof definition.query !== 'string') {
          throw new Error('query_template type requires "query" string in definition');
        }
        break;
      
      case 'file_set':
        if (!definition.paths || !Array.isArray(definition.paths)) {
          throw new Error('file_set type requires "paths" array in definition');
        }
        if (definition.paths.length === 0) {
          throw new Error('paths array cannot be empty for file_set');
        }
        break;
      
      default:
        throw new Error(`Unknown smart path type: ${type}`);
    }
  }
}

@injectable()
export class ExecuteSmartPathTool implements IMCPTool {
  name = 'execute_smart_path';
  description = 'Execute a smart path to retrieve bundled context with proper contextKeys handling';
  schema = executeSmartPathSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof executeSmartPathSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Retrieve smart path definition
      const smartPathData = await this.db.getContext(params.id);
      if (!smartPathData) {
        throw new Error(`Smart path not found: ${params.id}`);
      }

      const smartPath = smartPathData as any;
      if (!smartPath || typeof smartPath !== 'object') {
        throw new Error(`Invalid smart path data: ${params.id}`);
      }

      // Ensure contextKeys is always an array (fix for MCP error)
      const contextKeys = Array.isArray(params.contextKeys) 
        ? params.contextKeys 
        : params.contextKeys 
          ? [params.contextKeys]
          : [];

      // Execute based on smart path type
      let result;
      switch (smartPath.type) {
        case 'item_bundle':
          result = await this.executeItemBundle(smartPath, contextKeys, params.params);
          break;
        case 'query_template':
          result = await this.executeQueryTemplate(smartPath, contextKeys, params.params);
          break;
        case 'file_set':
          result = await this.executeFileSet(smartPath, contextKeys, params.params);
          break;
        default:
          throw new Error(`Unsupported smart path type: ${smartPath.type}`);
      }

      const response = {
        smartPathId: params.id,
        smartPathName: smartPath.name,
        type: smartPath.type,
        executionResult: result,
        contextKeysProcessed: contextKeys.length,
        executedAt: new Date().toISOString()
      };

      context.logger.info({ 
        smartPathId: params.id, 
        type: smartPath.type, 
        contextKeysCount: contextKeys.length 
      }, 'Smart path executed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, smartPathId: params.id }, 'Failed to execute smart path');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute smart path: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async executeItemBundle(smartPath: any, contextKeys: string[], params: Record<string, unknown>) {
    const items = smartPath.definition?.items || [];
    const allKeys = [...items, ...contextKeys];
    
    const results = [];
    for (const key of allKeys) {
      try {
        const contextData = await this.db.getContext(key);
        if (contextData) {
          results.push({
            key,
            found: true,
            data: contextData
          });
        } else {
          results.push({
            key,
            found: false,
            error: 'Context not found'
          });
        }
      } catch (error) {
        results.push({
          key,
          found: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      type: 'item_bundle',
      totalItems: allKeys.length,
      foundItems: results.filter(r => r.found).length,
      items: results
    };
  }

  private async executeQueryTemplate(smartPath: any, contextKeys: string[], params: Record<string, unknown>) {
    const query = smartPath.definition?.query || '';
    
    // Simple template substitution
    let processedQuery = query;
    for (const [key, value] of Object.entries(params)) {
      processedQuery = processedQuery.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    return {
      type: 'query_template',
      originalQuery: query,
      processedQuery,
      contextKeys,
      parameters: params
    };
  }

  private async executeFileSet(smartPath: any, contextKeys: string[], params: Record<string, unknown>) {
    const paths = smartPath.definition?.paths || [];
    
    return {
      type: 'file_set',
      paths,
      contextKeys,
      note: 'File set execution would require filesystem integration'
    };
  }
}

@injectable()
export class ListSmartPathsTool implements IMCPTool {
  name = 'list_smart_paths';
  description = 'List all available smart paths with usage statistics';
  schema = listSmartPathsSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof listSmartPathsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Query for smart paths
      const smartPaths = await this.db.queryContext({
        type: 'smart_path',
        limit: params.limit
      });

      const formattedPaths = smartPaths.map(path => ({
        id: path.key,
        name: (path.value as any)?.name || path.key,
        type: (path.value as any)?.type || 'unknown',
        createdAt: path.createdAt,
        updatedAt: path.updatedAt
      }));

      const response = {
        smart_paths: formattedPaths,
        total_count: formattedPaths.length,
        limit: params.limit
      };

      context.logger.info({ count: formattedPaths.length }, 'Listed smart paths');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error }, 'Failed to list smart paths');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list smart paths: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}
