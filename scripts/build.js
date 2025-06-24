#!/usr/bin/env node

// Build script for Context-Savy MCP Server
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
  magenta: '\x1b[35m',
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

function runCommand(command, description) {
  try {
    log(`${description}...`);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (err) {
    error(`Failed to ${description.toLowerCase()}: ${err.message}`);
    return false;
  }
}

async function main() {
  log('🔨 Building Context-Savy MCP Server...', colors.bright);

  const startTime = Date.now();

  try {
    // Step 1: Clean previous build
    log('🧹 Cleaning previous build...');
    await fs.remove('./build');
    await fs.remove('./dist');
    success('Previous build cleaned');

    // Step 2: Ensure dependencies are installed
    if (!fs.existsSync('./node_modules')) {
      if (!runCommand('npm ci', '📦 Installing dependencies')) {
        process.exit(1);
      }
    } else {
      log('📦 Dependencies already installed');
    }

    // Step 3: Run security audit (non-blocking)
    log('🔒 Running security audit...');
    try {
      execSync('npm audit --audit-level moderate', { stdio: 'inherit' });
      success('Security audit passed');
    } catch (err) {
      warning('Security audit found issues - please review');
    }

    // Step 4: Build TypeScript
    if (!runCommand('npx tsc --project tsconfig.json', '🏗️  Compiling TypeScript')) {
      process.exit(1);
    }

    // Step 5: Copy configuration files
    log('📋 Copying configuration files...');
    try {
      await fs.ensureDir('./build/config');

      // Copy config files
      const configDir = './config';
      if (await fs.pathExists(configDir)) {
        const configFiles = await fs.readdir(configDir);
        for (const file of configFiles) {
          if (file.includes('.example.') || file.includes('.yaml') || file.includes('.json')) {
            await fs.copy(path.join(configDir, file), path.join('./build/config', file));
            log(`  Copied ${file}`);
          }
        }
      }

      // Copy other important files
      const filesToCopy = ['./package.json', './README.md', './LICENSE'];

      for (const file of filesToCopy) {
        if (await fs.pathExists(file)) {
          await fs.copy(file, path.join('./build', path.basename(file)));
          log(`  Copied ${path.basename(file)}`);
        }
      }

      // Copy templates directory if it exists
      if (await fs.pathExists('./templates')) {
        await fs.copy('./templates', './build/templates');
        log('  Copied templates directory');
      }

      // Copy migration SQL files
      const migrationDir = './src/infrastructure/migrations';
      if (await fs.pathExists(migrationDir)) {
        await fs.ensureDir('./build/infrastructure/migrations');
        const migrationFiles = await fs.readdir(migrationDir);
        for (const file of migrationFiles) {
          if (file.endsWith('.sql')) {
            await fs.copy(path.join(migrationDir, file), path.join('./build/infrastructure/migrations', file));
            log(`  Copied migration ${file}`);
          }
        }
      }

      success('Configuration files copied');
    } catch (err) {
      warning(`Failed to copy some configuration files: ${err.message}`);
    }

    // Step 6: Create production start script
    log('📝 Creating production start script...');
    const startScript = `#!/usr/bin/env node
// Production start script for Context-Savy MCP Server
require('./index.js');
`;
    await fs.writeFile('./build/start.js', startScript);
    success('Production start script created');

    // Step 7: Display build summary
    const buildTime = Math.round((Date.now() - startTime) / 1000);

    log('\n' + '='.repeat(50), colors.bright);
    success(`Build completed successfully in ${buildTime}s!`);
    log('📁 Output directory: ./build/', colors.green);
    log('🚀 Start with: node build/index.js', colors.cyan);
    log('🔧 Or use: npm start', colors.cyan);

    // Display build info
    const buildInfo = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    await fs.writeJson('./build/build-info.json', buildInfo, { spaces: 2 });
    log('📊 Build info saved to build/build-info.json', colors.blue);
  } catch (err) {
    error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  warning('Build interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  warning('Build terminated');
  process.exit(1);
});

// Run the build
main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
