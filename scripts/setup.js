#!/usr/bin/env node

/**
 * Setup Script for Context-Savy MCP Server
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.cyan) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function warning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

async function main() {
  log('🚀 Setting up Context-Savy MCP Server...', colors.bright);
  
  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
      error('Node.js 18.0.0 or higher is required');
      error(`Current version: ${nodeVersion}`);
      error('Please upgrade Node.js and try again');
      process.exit(1);
    }
    success(`Node.js version check passed (${nodeVersion})`);
    
    // Create necessary directories
    const directories = [
      './config',
      './data',
      './logs',
      './backups',
      './templates',
      './projects' // Projects directory (configurable in server.yaml)
    ];
    
    for (const dir of directories) {
      try {
        await fs.ensureDir(dir);
        success(`Created directory: ${dir}`);
      } catch (err) {
        if (dir === './A:/Projects') {
          warning(`Could not create projects directory ${dir} - will be created on first use`);
        } else {
          warning(`Could not create directory ${dir}: ${err.message}`);
        }
      }
    }
    
    // Copy example configuration files
    const configFiles = [
      { src: './config/server.example.yaml', dest: './config/server.yaml' }
    ];
    
    for (const { src, dest } of configFiles) {
      try {
        if (await fs.pathExists(src) && !(await fs.pathExists(dest))) {
          await fs.copy(src, dest);
          success(`Created configuration: ${path.basename(dest)}`);
        }
      } catch (err) {
        warning(`Could not copy ${src}: ${err.message}`);
      }
    }
    
    // Install dependencies
    log('📦 Installing dependencies...');
    try {
      execSync('npm ci', { stdio: 'inherit' });
      success('Dependencies installed successfully');
    } catch (err) {
      error('Failed to install dependencies');
      throw err;
    }
    
    // Build the project
    log('🏗️  Building project...');
    try {
      execSync('npm run build:ts', { stdio: 'inherit' });
      success('Project built successfully');
    } catch (err) {
      error('Build failed');
      throw err;
    }
    
    // Run health check
    log('🏥 Running health check...');
    try {
      execSync('npm run health-check', { stdio: 'inherit' });
      success('Health check passed');
    } catch (err) {
      warning('Health check failed - server may still work');
    }
    
    // Display completion message
    log('\n' + '='.repeat(60), colors.bright);
    success('Context-Savy MCP Server setup completed!');
    log('', colors.green);
    
    // Show Claude Desktop configuration
    const projectRoot = path.dirname(__dirname);
    const distPath = path.resolve(projectRoot, 'build', 'index.js');
    const configPath = path.resolve(projectRoot, 'config', 'server.yaml');
    
    log('📋 Add this to your claude_desktop_config.json:', colors.cyan);
    const claudeConfig = {
      mcpServers: {
        'context-savvy-mcp': {
          command: 'node',
          args: [distPath],
          env: {
            MCP_LOG_LEVEL: 'info',
            MCP_SERVER_CONFIG_PATH: configPath
          }
        }
      }
    };
    console.log(JSON.stringify(claudeConfig, null, 2));
    
    log('\n🔧 Claude Desktop config locations:', colors.blue);
    log('   - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json');
    log('   - Windows: %APPDATA%\\Claude\\claude_desktop_config.json');
    log('   - Linux: ~/.config/claude/claude_desktop_config.json');
    
    log('\n📋 Next steps:', colors.cyan);
    log('1. Review and edit config/server.yaml for your settings');
    log('2. Add the server configuration above to your Claude Desktop config');
    log('3. Restart Claude Desktop to load the server');
    log('');
    log('📚 For detailed setup instructions, see:', colors.blue);
    log('   - README.md');
    log('   - CLAUDE_DESKTOP_CONFIG.md');
    log('   - PROJECTS_DIRECTORY_GUIDE.md');
    log('');
    log('🚀 Start the server with: npm start', colors.cyan);
    
  } catch (err) {
    error(`Setup failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
