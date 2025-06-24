// src/application/tools/project-creation.tool.ts
import { injectable, inject } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IWorkspaceManager } from '@core/interfaces/workspace.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';

const execAsync = promisify(exec);

// Project creation schema
const createProjectSchema = z.object({
  name: z.string().describe('Name of the project to create'),
  description: z.string().optional().describe('Description of the project'),
  template: z.string().optional().describe('Template to use for project creation'),
  directory: z.string().optional().describe('Custom directory path (overrides default)'),
  skipGit: z.boolean().optional().default(false).describe('Skip git repository initialization'),
  skipWorkspace: z.boolean().optional().default(false).describe('Skip workspace creation'),
  customDirectories: z.array(z.string()).optional().describe('Custom directories to create (in addition to defaults)'),
  tags: z.array(z.string()).optional().describe('Tags for the project context')
});

@injectable()
export class CreateProjectTool implements IMCPTool {
  name = 'create_project';
  description = 'Create a new project in the designated projects directory with automatic workspace setup';
  schema = createProjectSchema;

  constructor(
    @inject('ConfigManager') private configManager: any,
    @inject('SecurityValidator') private securityValidator: ISecurityValidator
  ) {}

  async execute(params: z.infer<typeof createProjectSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get configuration
      const config = this.configManager.getConfig();
      const projectsConfig = config.projects || {
        defaultDirectory: 'A:/Projects',
        autoCreateDirectory: true,
        autoAddToSafeZones: true,
        projectStructure: {
          createGitRepo: true,
          createReadme: true,
          createGitignore: true,
          defaultDirectories: ['src', 'docs', 'tests'],
          templates: { enabled: true, directory: './templates' }
        },
        naming: {
          convention: 'kebab-case',
          allowSpaces: false,
          maxLength: 50,
          reservedNames: ['con', 'prn', 'aux', 'nul']
        },
        workspace: {
          autoCreateWorkspace: true,
          autoActivateWorkspace: true,
          contextPrefix: 'project',
          defaultType: 'project'
        }
      };

      // Validate and transform project name
      const projectName = this.validateAndTransformProjectName(params.name, projectsConfig.naming);
      
      // Determine project directory
      const baseDir = params.directory || projectsConfig.defaultDirectory;
      const projectPath = path.join(baseDir, projectName);

      // Ensure base directory exists
      if (projectsConfig.autoCreateDirectory) {
        await fs.ensureDir(baseDir);
        
        // Add to safe zones if configured
        if (projectsConfig.autoAddToSafeZones) {
          await this.addToSafeZones(baseDir);
        }
      }

      // Check if project already exists
      if (await fs.pathExists(projectPath)) {
        throw new Error(`Project directory already exists: ${projectPath}`);
      }

      // Validate path is safe
      const isPathSafe = await this.securityValidator.validatePath(projectPath);
      if (!isPathSafe) {
        throw new Error(`Project path is not in a safe zone: ${projectPath}`);
      }

      // Create project directory
      await fs.ensureDir(projectPath);

      // Create project structure
      const createdItems = await this.createProjectStructure(
        projectPath, 
        projectName, 
        projectsConfig.projectStructure,
        params
      );

      // Initialize git repository if requested
      if (!params.skipGit && projectsConfig.projectStructure.createGitRepo) {
        try {
          await execAsync('git init', { cwd: projectPath });
          createdItems.push('git repository');
        } catch (error) {
          context.logger.warn({ error, projectPath }, 'Failed to initialize git repository');
        }
      }

      // Create workspace if requested
      let workspace = null;
      if (!params.skipWorkspace && projectsConfig.workspace.autoCreateWorkspace) {
        try {
          const workspaceManager = context.container.get<IWorkspaceManager>('WorkspaceManager');
          workspace = await workspaceManager.createWorkspace(projectName, {
            rootPath: projectPath,
            type: projectsConfig.workspace.defaultType as any,
            gitEnabled: !params.skipGit && projectsConfig.projectStructure.createGitRepo,
            contextPrefix: `${projectsConfig.workspace.contextPrefix}:${projectName}:`
          });

          if (projectsConfig.workspace.autoActivateWorkspace) {
            await workspaceManager.setActiveWorkspace(workspace.id);
          }
        } catch (error) {
          context.logger.warn({ error, projectName }, 'Failed to create workspace');
        }
      }

      // Store project context
      const db = context.container.get<IDatabaseHandler>('DatabaseHandler');
      const projectContextKey = `project:${projectName}:${Date.now()}`;
      await db.storeContext(projectContextKey, {
        name: projectName,
        description: params.description,
        path: projectPath,
        createdAt: new Date().toISOString(),
        template: params.template,
        structure: createdItems,
        workspaceId: workspace?.id,
        tags: params.tags || []
      }, 'project_creation');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                project: {
                  name: projectName,
                  path: projectPath,
                  description: params.description,
                  template: params.template,
                  createdItems,
                  workspace: workspace ? {
                    id: workspace.id,
                    name: workspace.name,
                    active: projectsConfig.workspace.autoActivateWorkspace
                  } : null
                },
                contextKey: projectContextKey,
                message: `Project '${projectName}' created successfully at ${projectPath}`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create project');
      throw error;
    }
  }

  private validateAndTransformProjectName(name: string, namingConfig: any): string {
    // Check reserved names
    if (namingConfig.reservedNames.includes(name.toLowerCase())) {
      throw new Error(`Project name '${name}' is reserved and cannot be used`);
    }

    // Check length
    if (name.length > namingConfig.maxLength) {
      throw new Error(`Project name exceeds maximum length of ${namingConfig.maxLength} characters`);
    }

    // Check spaces
    if (!namingConfig.allowSpaces && name.includes(' ')) {
      throw new Error('Project name cannot contain spaces');
    }

    // Transform based on convention
    let transformedName = name;
    switch (namingConfig.convention) {
      case 'kebab-case':
        transformedName = name.toLowerCase().replace(/[\s_]/g, '-').replace(/[^a-z0-9-]/g, '');
        break;
      case 'snake_case':
        transformedName = name.toLowerCase().replace(/[\s-]/g, '_').replace(/[^a-z0-9_]/g, '');
        break;
      case 'camelCase':
        transformedName = name.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '').replace(/^[A-Z]/, char => char.toLowerCase());
        break;
      case 'PascalCase':
        transformedName = name.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '').replace(/^[a-z]/, char => char.toUpperCase());
        break;
    }

    return transformedName;
  }

  private async createProjectStructure(
    projectPath: string, 
    projectName: string, 
    structureConfig: any,
    params: z.infer<typeof createProjectSchema>
  ): Promise<string[]> {
    const createdItems: string[] = [];

    // Create default directories
    for (const dir of structureConfig.defaultDirectories) {
      const dirPath = path.join(projectPath, dir);
      await fs.ensureDir(dirPath);
      createdItems.push(`directory: ${dir}`);
    }

    // Create custom directories
    if (params.customDirectories) {
      for (const dir of params.customDirectories) {
        const dirPath = path.join(projectPath, dir);
        await fs.ensureDir(dirPath);
        createdItems.push(`custom directory: ${dir}`);
      }
    }

    // Create README.md
    if (structureConfig.createReadme) {
      const readmeContent = this.generateReadmeContent(projectName, params.description);
      await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent);
      createdItems.push('README.md');
    }

    // Create .gitignore
    if (structureConfig.createGitignore) {
      const gitignoreContent = this.generateGitignoreContent();
      await fs.writeFile(path.join(projectPath, '.gitignore'), gitignoreContent);
      createdItems.push('.gitignore');
    }

    return createdItems;
  }

  private generateReadmeContent(projectName: string, description?: string): string {
    return `# ${projectName}

${description || 'A new project created with context-savvy-server'}

## Getting Started

This project was created using the context-savvy-server project creation tool.

## Structure

- \`src/\` - Source code
- \`docs/\` - Documentation
- \`tests/\` - Test files

## Contributing

1. Clone this repository
2. Make your changes
3. Submit a pull request

## License

TBD - Please add your license information here.
`;
  }

  private generateGitignoreContent(): string {
    return `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# nyc test coverage
.nyc_output

# Grunt intermediate storage
.grunt

# Bower dependency directory
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# Typescript v1 declaration files
typings/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Logs
logs
*.log

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Build outputs
build/
dist/
out/
`;
  }

  private async addToSafeZones(directory: string): Promise<void> {
    try {
      // Get current config
      const config = this.configManager.getConfig();
      const currentSafeZones = config.security?.safezones || [];
      
      // Add directory if not already present
      if (!currentSafeZones.includes(directory)) {
        const updatedSafeZones = [...currentSafeZones, directory];
        
        // Update security configuration
        await this.configManager.updateConfig({
          security: {
            ...config.security,
            safezones: updatedSafeZones
          }
        });
      }
    } catch (error) {
      // Don't fail project creation if safe zone addition fails
      console.warn('Failed to add directory to safe zones:', error);
    }
  }
}

// List projects tool
const listProjectsSchema = z.object({
  directory: z.string().optional().describe('Directory to search for projects (uses default if not specified)'),
  includeHidden: z.boolean().optional().default(false).describe('Include hidden projects')
});

@injectable()
export class ListProjectsTool implements IMCPTool {
  name = 'list_projects';
  description = 'List all projects in the projects directory';
  schema = listProjectsSchema;

  constructor(@inject('ConfigManager') private configManager: any) {}

  async execute(params: z.infer<typeof listProjectsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const config = this.configManager.getConfig();
      const projectsConfig = config.projects || { defaultDirectory: 'A:/Projects' };
      const searchDir = params.directory || projectsConfig.defaultDirectory;

      // Check if directory exists
      if (!await fs.pathExists(searchDir)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projects: [],
                directory: searchDir,
                message: 'Projects directory does not exist'
              }, null, 2)
            }
          ]
        };
      }

      // Get all subdirectories
      const items = await fs.readdir(searchDir);
      const projects = [];

      for (const item of items) {
        const itemPath = path.join(searchDir, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          // Skip hidden directories unless requested
          if (!params.includeHidden && item.startsWith('.')) {
            continue;
          }

          const projectInfo = {
            name: item,
            path: itemPath,
            hasGit: await fs.pathExists(path.join(itemPath, '.git')),
            hasReadme: await fs.pathExists(path.join(itemPath, 'README.md')),
            hasPackageJson: await fs.pathExists(path.join(itemPath, 'package.json')),
            createdAt: stat.birthtime,
            modifiedAt: stat.mtime
          };

          projects.push(projectInfo);
        }
      }

      // Sort by creation date (newest first)
      projects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              projects,
              directory: searchDir,
              totalCount: projects.length,
              message: `Found ${projects.length} projects in ${searchDir}`
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to list projects');
      throw error;
    }
  }
}
