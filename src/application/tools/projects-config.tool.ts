// src/application/tools/projects-config.tool.ts
import { injectable, inject } from 'inversify';
import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

// Initialize projects directory schema
const initProjectsDirectorySchema = z.object({
  directory: z.string().optional().describe('Custom projects directory path (uses config default if not specified)'),
  force: z.boolean().optional().default(false).describe('Force initialization even if directory exists')
});

@injectable()
export class InitProjectsDirectoryTool implements IMCPTool {
  name = 'init_projects_directory';
  description = 'Initialize the projects directory and add it to safe zones';
  schema = initProjectsDirectorySchema;

  constructor(@inject('ConfigManager') private configManager: any) {}

  async execute(params: z.infer<typeof initProjectsDirectorySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get configuration
      const config = this.configManager.getConfig();
      const projectsConfig = config.projects || { defaultDirectory: '~/projects' };
      const projectsDir = params.directory || projectsConfig.defaultDirectory;

      // Check if directory already exists
      const exists = await fs.pathExists(projectsDir);
      if (exists && !params.force) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  directory: projectsDir,
                  alreadyExists: true,
                  message: `Projects directory already exists at ${projectsDir}`
                },
                null,
                2
              )
            }
          ]
        };
      }

      // Create the directory
      await fs.ensureDir(projectsDir);

      // Add to safe zones if not already present
      await this.addToSafeZones(projectsDir);

      // Create README file
      const readmeContent = this.generateProjectsReadme(projectsDir);
      await fs.writeFile(path.join(projectsDir, 'README.md'), readmeContent);

      // Create .gitkeep to ensure directory is tracked in git
      await fs.writeFile(
        path.join(projectsDir, '.gitkeep'),
        '# This file ensures the projects directory is tracked in git\n'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                directory: projectsDir,
                created: !exists,
                addedToSafeZones: true,
                files: ['README.md', '.gitkeep'],
                message: `Projects directory initialized at ${projectsDir}`
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to initialize projects directory');
      throw error;
    }
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
      console.warn('Failed to add directory to safe zones:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add ${directory} to safe zones: ${errorMessage}`);
    }
  }

  private generateProjectsReadme(projectsDir: string): string {
    return `# Projects Directory

This directory is designated for all new projects created by Claude using the context-savvy-server.

## Location

\`${projectsDir}\`

## Purpose

This directory serves as the default location where new project directories will be created when using the \`create_project\` tool.

## Configuration

The projects directory is configured in \`config/server.yaml\` under the \`projects\` section:

\`\`\`yaml
projects:
  defaultDirectory: '${projectsDir}'
  autoCreateDirectory: true
  autoAddToSafeZones: true
\`\`\`

## Features

- **Automatic Safe Zone Addition**: This directory is automatically added to the security safe zones
- **Workspace Integration**: Projects created here automatically get their own workspaces
- **Template Support**: Projects can be created from templates
- **Git Integration**: Projects can be automatically initialized with git repositories

## Usage

Use the \`create_project\` tool to create new projects:

\`\`\`javascript
create_project({
  name: "my-awesome-project",
  description: "A new project for awesome things",
  template: "web-app" // optional
})
\`\`\`

## Directory Structure

Each project created here will have:
- \`src/\` - Source code directory
- \`docs/\` - Documentation directory
- \`tests/\` - Test files directory
- \`README.md\` - Project documentation
- \`.gitignore\` - Git ignore file
- \`.git/\` - Git repository (if enabled)

## Project Templates

Available templates:
- \`web-app\` - Basic web application with HTML, CSS, and JavaScript
- More templates can be added to the \`templates/\` directory

## Management

- Use \`list_projects\` to see all projects in this directory
- Use \`create_project\` to create new projects
- Use \`init_projects_directory\` to reinitialize this directory if needed

---

Created: ${new Date().toISOString()}
`;
  }
}

// Get projects configuration tool
@injectable()
export class GetProjectsConfigTool implements IMCPTool {
  name = 'get_projects_config';
  description = 'Get the current projects configuration';
  schema = z.object({});

  constructor(@inject('ConfigManager') private configManager: any) {}

  async execute(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      const config = this.configManager.getConfig();
      const projectsConfig = config.projects || null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                projectsConfig,
                isConfigured: !!projectsConfig,
                defaultDirectory: projectsConfig?.defaultDirectory || '~/projects',
                message: projectsConfig
                  ? 'Projects configuration found'
                  : 'Projects configuration not found - using defaults'
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error }, 'Failed to get projects configuration');
      throw error;
    }
  }
}

// Update projects configuration tool
const updateProjectsConfigSchema = z.object({
  defaultDirectory: z.string().optional().describe('Default directory for new projects'),
  autoCreateDirectory: z.boolean().optional().describe('Automatically create the projects directory'),
  autoAddToSafeZones: z.boolean().optional().describe('Automatically add projects directory to safe zones'),
  projectStructure: z
    .object({
      createGitRepo: z.boolean().optional(),
      createReadme: z.boolean().optional(),
      createGitignore: z.boolean().optional(),
      defaultDirectories: z.array(z.string()).optional()
    })
    .optional(),
  naming: z
    .object({
      convention: z.enum(['kebab-case', 'snake_case', 'camelCase', 'PascalCase']).optional(),
      allowSpaces: z.boolean().optional(),
      maxLength: z.number().optional()
    })
    .optional(),
  workspace: z
    .object({
      autoCreateWorkspace: z.boolean().optional(),
      autoActivateWorkspace: z.boolean().optional(),
      contextPrefix: z.string().optional(),
      defaultType: z.enum(['project', 'scratch', 'shared']).optional()
    })
    .optional()
});

@injectable()
export class UpdateProjectsConfigTool implements IMCPTool {
  name = 'update_projects_config';
  description = 'Update the projects configuration';
  schema = updateProjectsConfigSchema;

  constructor(@inject('ConfigManager') private configManager: any) {}

  async execute(params: z.infer<typeof updateProjectsConfigSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const config = this.configManager.getConfig();
      const currentProjectsConfig = config.projects || {};

      // Merge configurations
      const updatedProjectsConfig = {
        ...currentProjectsConfig,
        ...params,
        projectStructure: {
          ...currentProjectsConfig.projectStructure,
          ...params.projectStructure
        },
        naming: {
          ...currentProjectsConfig.naming,
          ...params.naming
        },
        workspace: {
          ...currentProjectsConfig.workspace,
          ...params.workspace
        }
      };

      // Update configuration
      await this.configManager.updateConfig({
        projects: updatedProjectsConfig
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                updatedConfig: updatedProjectsConfig,
                message: 'Projects configuration updated successfully'
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to update projects configuration');
      throw error;
    }
  }
}
