# Projects Directory Configuration

The context-savvy-server now includes a comprehensive configuration system for managing a designated projects directory where Claude will create new projects.

## Overview

Instead of creating projects directly within the context-savvy-server repository, Claude now uses a dedicated projects directory (default: `~/projects`) that is:

- **Automatically created** when needed
- **Added to security safe zones** for access
- **Integrated with workspaces** for seamless project management
- **Template-enabled** for consistent project structure

## Configuration

### Server Configuration (`config/server.yaml`)

```yaml
# Projects Configuration - Designated directory for new projects
projects:
  defaultDirectory: '~/projects' # Main directory where new projects will be created
  autoCreateDirectory: true # Automatically create the projects directory if it doesn't exist
  autoAddToSafeZones: true # Automatically add projects directory to security safe zones

  # Project structure configuration
  projectStructure:
    createGitRepo: true # Initialize git repository for new projects
    createReadme: true # Create README.md for new projects
    createGitignore: true # Create .gitignore for new projects
    defaultDirectories: # Default directories to create in new projects
      - src
      - docs
      - tests
    templates:
      enabled: true
      directory: './templates' # Directory containing project templates
      # default: 'web-app' # Uncomment to set a default template

  # Project naming conventions
  naming:
    convention: 'kebab-case' # Options: kebab-case, snake_case, camelCase, PascalCase
    allowSpaces: false # Allow spaces in project names
    maxLength: 50 # Maximum length for project names
    reservedNames: # Reserved names that cannot be used for projects
      - con
      - prn
      - aux
      - nul
      # ... (Windows reserved names)

  # Workspace integration
  workspace:
    autoCreateWorkspace: true # Automatically create workspace for new projects
    autoActivateWorkspace: true # Automatically activate workspace for new projects
    contextPrefix: 'project' # Default context prefix for project workspaces
    defaultType: 'project' # Options: project, scratch, shared
```

### Security Integration

The projects directory is automatically added to the security safe zones:

```yaml
security:
  safezones:
    - '.'
    - './context-savy-server/data'
    - './examples'
    - './context-savy-server'
    - '~/projects' # ← Automatically added
```

## Available Tools

### Project Creation

#### `create_project`

Creates a new project in the designated projects directory.

```javascript
create_project({
  name: "my-awesome-project",
  description: "A new project for awesome things",
  template: "web-app", // optional
  customDirectories: ["lib", "config"], // optional
  tags: ["frontend", "react"] // optional
})
```

**Features:**

- Automatic name validation and transformation
- Git repository initialization
- Workspace creation and activation
- Template application
- Context storage for project tracking

#### `list_projects`

Lists all projects in the projects directory.

```javascript
list_projects({
  directory: "~/projects", // optional, uses default if not specified
  includeHidden: false // optional
})
```

### Directory Management

#### `init_projects_directory`

Initializes the projects directory structure.

```javascript
init_projects_directory({
  directory: "~/projects", // optional
  force: false // optional, force initialization even if exists
})
```

**What it does:**

- Creates the projects directory
- Adds it to security safe zones
- Creates README.md documentation
- Creates .gitkeep file for git tracking

### Configuration Management

#### `get_projects_config`

Retrieves current projects configuration.

```javascript
get_projects_config()
```

#### `update_projects_config`

Updates projects configuration settings.

```javascript
update_projects_config({
  defaultDirectory: "C:/MyProjects",
  naming: {
    convention: "snake_case",
    maxLength: 40
  }
})
```

## Project Templates

### Web Application Template

Located in `templates/web-app/`, includes:

- `index.html` - Basic HTML structure with placeholders
- `styles/main.css` - Modern CSS with responsive design
- `scripts/main.js` - JavaScript with utility functions
- `package.json` - Node.js package configuration
- `README.md` - Project documentation template

### Template Variables

Templates support variable substitution:

- `{{PROJECT_NAME}}` - Project display name
- `{{PROJECT_NAME_LOWER}}` - Lowercase project name
- `{{PROJECT_DESCRIPTION}}` - Project description

### Creating Custom Templates

1. Create a new directory in `templates/`
2. Add template files with variable placeholders
3. Reference the template name when creating projects

## Usage Examples

### Basic Project Creation

```javascript
// Create a simple project
create_project({
  name: "todo-app",
  description: "A simple todo application"
})

// Result: ~/projects/todo-app/
// ├── src/
// ├── docs/
// ├── tests/
// ├── README.md
// ├── .gitignore
// └── .git/
```

### Project with Template

```javascript
// Create a web application project
create_project({
  name: "portfolio-website",
  description: "Personal portfolio website",
  template: "web-app"
})

// Result: ~/projects/portfolio-website/
// ├── src/
// ├── docs/
// ├── tests/
// ├── styles/
// │   └── main.css
// ├── scripts/
// │   └── main.js
// ├── index.html
// ├── package.json
// ├── README.md
// ├── .gitignore
// └── .git/
```

### Custom Directory Structure

```javascript
// Create project with custom directories
create_project({
  name: "api-server",
  description: "REST API server",
  customDirectories: ["controllers", "models", "middleware", "config"]
})

// Result: ~/projects/api-server/
// ├── src/
// ├── docs/
// ├── tests/
// ├── controllers/
// ├── models/
// ├── middleware/
// ├── config/
// ├── README.md
// ├── .gitignore
// └── .git/
```

## Best Practices

### Project Organization

1. **Use descriptive names**: Choose clear, meaningful project names
2. **Follow conventions**: Stick to the configured naming convention
3. **Add descriptions**: Always provide project descriptions for context
4. **Use templates**: Leverage templates for consistency
5. **Tag appropriately**: Use tags for project categorization

### Directory Structure

```
~/projects/
├── README.md                 # Projects directory documentation
├── .gitkeep
├── my-web-app/              # Individual projects
├── data-analysis-tool/
├── mobile-app-prototype/
└── experimental-features/
```

### Workspace Integration

Each project automatically gets:

- **Individual workspace**: For file tracking and context management
- **Automatic activation**: Ready to use immediately after creation
- **Context prefix**: Organized context keys (`project:my-app:...`)
- **Git integration**: Seamless version control

## Environment Variables

Override configuration with environment variables:

```bash
export PROJECTS_DIR="~/my-projects"
```

Maps to `projects.defaultDirectory` in configuration. This path is fully configurable in `config/server.yaml` and can be set to any platform-neutral path such as `~/projects`, `./projects`, or an absolute path.

## Troubleshooting

### Common Issues

1. **Access Denied**: Ensure the projects directory is in safe zones
2. **Directory Exists**: Use `force: true` with `init_projects_directory`
3. **Name Validation**: Check naming conventions and reserved names
4. **Template Not Found**: Verify template exists in templates directory

### Debugging

Check configuration:

```javascript
get_projects_config()
```

Initialize directory manually:

```javascript
init_projects_directory({ force: true })
```

List existing projects:

```javascript
list_projects()
```

## Security Considerations

- Projects directory is automatically added to safe zones
- All file operations are validated through security system
- Reserved names prevent system conflicts
- Path traversal protection is maintained

## Future Enhancements

Planned features:

- Additional project templates
- Project archiving and cleanup
- Enhanced template variable system
- Project dependency management
- Integration with external project scaffolding tools

---

This configuration ensures that Claude creates all new projects in a organized, secure, and manageable way outside of the context-savvy-server codebase.
