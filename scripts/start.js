#!/usr/bin/env node

/**
 * Start Script for Context-Savy MCP Server
 */

import { spawn } from 'child_process';
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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dev: false,
    debug: false,
    config: null,
    port: null,
    logLevel: null
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dev':
      case '-d':
        options.dev = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--config':
      case '-c':
        if (i + 1 < args.length) {
          options.config = args[i + 1];
          i++;
        }
        break;
      case '--port':
      case '-p':
        if (i + 1 < args.length) {
          options.port = parseInt(args[i + 1]);
          i++;
        }
        break;
      case '--log-level':
      case '-l':
        if (i + 1 < args.length) {
          options.logLevel = args[i + 1];
          i++;
        }
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }
  
  return options;
}

function showHelp() {
  log('🚀 Context-Savy MCP Server Starter', colors.bright);
  log('');
  log('Usage: npm start [options]', colors.cyan);
  log('   or: node scripts/start.js [options]', colors.cyan);
  log('');
  log('Options:', colors.blue);
  log('  --dev, -d           Start in development mode');
  log('  --debug             Enable debug logging');
  log('  --config, -c PATH   Use specific config file');
  log('  --port, -p PORT     Override server port');
  log('  --log-level, -l     Set log level (error, warn, info, debug)');
  log('  --help, -h          Show this help message');
  log('');
  log('Examples:', colors.yellow);
  log('  npm start                          # Start production server');
  log('  npm start -- --dev                # Start in development mode');
  log('  npm start -- --debug              # Start with debug logging');
  log('  npm start -- --config config.yaml # Use custom config');
  log('  npm start -- --port 3001          # Use custom port');
}

async function checkBuild() {
  const buildPath = './build/index.js';
  
  if (!(await fs.pathExists(buildPath))) {
    error('Server build not found!');
    log('Run the following command first:', colors.yellow);
    log('  npm run build', colors.cyan);
    return false;
  }
  
  return true;
}

async function checkConfig(configPath) {
  if (configPath) {
    if (!(await fs.pathExists(configPath))) {
      error(`Config file not found: ${configPath}`);
      return false;
    }
  } else {
    // Check for default config
    const defaultConfig = './config/server.yaml';
    if (!(await fs.pathExists(defaultConfig))) {
      warning('Default config file not found');
      log('Creating from example...', colors.yellow);
      
      const exampleConfig = './config/server.example.yaml';
      if (await fs.pathExists(exampleConfig)) {
        await fs.copy(exampleConfig, defaultConfig);
        success('Created config/server.yaml from example');
      } else {
        warning('No example config found either');
      }
    }
  }
  
  return true;
}

function setupEnvironment(options) {
  const env = {
    ...process.env,
    NODE_ENV: options.dev ? 'development' : 'production'
  };
  
  if (options.config) {
    env.MCP_SERVER_CONFIG_PATH = path.resolve(options.config);
  }
  
  if (options.port) {
    env.PORT = options.port.toString();
  }
  
  if (options.logLevel) {
    env.MCP_LOG_LEVEL = options.logLevel;
  }
  
  if (options.debug) {
    env.DEBUG = '1';
    env.MCP_LOG_LEVEL = 'debug';
  }
  
  return env;
}

async function startServer(options) {
  const buildPath = path.resolve('./build/index.js');
  const env = setupEnvironment(options);
  
  log('🚀 Starting Context-Savy MCP Server...', colors.bright);
  log(`📁 Server path: ${buildPath}`, colors.blue);
  log(`🔧 Environment: ${env.NODE_ENV}`, colors.blue);
  
  if (env.MCP_SERVER_CONFIG_PATH) {
    log(`⚙️  Config: ${env.MCP_SERVER_CONFIG_PATH}`, colors.blue);
  }
  
  if (env.PORT) {
    log(`🌐 Port: ${env.PORT}`, colors.blue);
  }
  
  log(''); // Empty line for clarity
  
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', [buildPath], {
      stdio: 'inherit',
      env,
      shell: false
    });
    
    serverProcess.on('close', (code) => {
      if (code === 0) {
        success('Server stopped gracefully');
        resolve(code);
      } else {
        error(`Server exited with code ${code}`);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
    
    serverProcess.on('error', (err) => {
      error(`Failed to start server: ${err.message}`);
      reject(err);
    });
    
    // Handle process signals to ensure clean shutdown
    process.on('SIGINT', () => {
      log('\\n🛑 Stopping server...', colors.yellow);
      serverProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      log('\\n🛑 Terminating server...', colors.yellow);
      serverProcess.kill('SIGTERM');
    });
  });
}

async function main() {
  const options = parseArgs();
  
  try {
    // Check if server is built
    if (!(await checkBuild())) {
      process.exit(1);
    }
    
    // Check configuration
    if (!(await checkConfig(options.config))) {
      process.exit(1);
    }
    
    // Start the server
    await startServer(options);
    
  } catch (err) {
    error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
