#!/usr/bin/env node

/**
 * Test Runner Script for Context-Savy MCP Server
 */

import { execSync, spawn } from 'child_process';
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
    watch: false,
    coverage: false,
    verbose: false,
    testPattern: null,
    bail: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--coverage':
      case '-c':
        options.coverage = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--bail':
      case '-b':
        options.bail = true;
        break;
      case '--pattern':
      case '-p':
        if (i + 1 < args.length) {
          options.testPattern = args[i + 1];
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
  log('🧪 Context-Savy MCP Server Test Runner', colors.bright);
  log('');
  log('Usage: npm test [options]', colors.cyan);
  log('   or: node scripts/test.js [options]', colors.cyan);
  log('');
  log('Options:', colors.blue);
  log('  --watch, -w      Run tests in watch mode');
  log('  --coverage, -c   Generate test coverage report');
  log('  --verbose, -v    Verbose test output');
  log('  --bail, -b       Stop on first test failure');
  log('  --pattern, -p    Run tests matching pattern');
  log('  --help, -h       Show this help message');
  log('');
  log('Examples:', colors.yellow);
  log('  npm test                    # Run all tests');
  log('  npm test -- --watch         # Run tests in watch mode');
  log('  npm test -- --coverage      # Run with coverage');
  log('  npm test -- --pattern=tool  # Run tests matching "tool"');
}

async function ensureTestEnvironment() {
  log('🔧 Setting up test environment...');
  
  // Ensure test directories exist
  const testDirs = [
    './tests',
    './coverage',
    './data/test'
  ];
  
  for (const dir of testDirs) {
    await fs.ensureDir(dir);
  }
  
  // Create test database if needed
  const testDbPath = './data/test/context-test.db';
  if (!(await fs.pathExists(testDbPath))) {
    await fs.ensureFile(testDbPath);
    log('Created test database');
  }
  
  success('Test environment ready');
}

function buildJestCommand(options) {
  const jestArgs = ['jest'];
  
  if (options.watch) {
    jestArgs.push('--watch');
  }
  
  if (options.coverage) {
    jestArgs.push('--coverage');
  }
  
  if (options.verbose) {
    jestArgs.push('--verbose');
  }
  
  if (options.bail) {
    jestArgs.push('--bail');
  }
  
  if (options.testPattern) {
    jestArgs.push('--testNamePattern', options.testPattern);
  }
  
  // Add environment variables
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    MCP_LOG_LEVEL: 'error', // Reduce log noise during tests
    TEST_DATABASE_PATH: './data/test/context-test.db'
  };
  
  return { command: 'npx', args: jestArgs, env };
}

async function runTests(options) {
  try {
    await ensureTestEnvironment();
    
    const { command, args, env } = buildJestCommand(options);
    
    log(`🧪 Running tests with: ${command} ${args.join(' ')}`, colors.bright);
    
    return new Promise((resolve, reject) => {
      const testProcess = spawn(command, args, {
        stdio: 'inherit',
        env,
        shell: true
      });
      
      testProcess.on('close', (code) => {
        if (code === 0) {
          success('All tests passed!');
          resolve(code);
        } else {
          error(`Tests failed with exit code ${code}`);
          reject(new Error(`Tests failed with exit code ${code}`));
        }
      });
      
      testProcess.on('error', (err) => {
        error(`Failed to start test runner: ${err.message}`);
        reject(err);
      });
    });
    
  } catch (err) {
    error(`Test execution failed: ${err.message}`);
    throw err;
  }
}

async function generateTestReport() {
  log('📊 Generating test report...');
  
  const coverageDir = './coverage';
  if (await fs.pathExists(coverageDir)) {
    const reportPath = path.join(coverageDir, 'lcov-report', 'index.html');
    if (await fs.pathExists(reportPath)) {
      log(`📈 Coverage report: ${path.resolve(reportPath)}`, colors.green);
    }
  }
}

async function main() {
  const options = parseArgs();
  
  try {
    // Check if Jest is available
    try {
      execSync('npx jest --version', { stdio: 'pipe' });
    } catch (err) {
      error('Jest is not installed or not available');
      log('Install Jest with: npm install --save-dev jest @types/jest ts-jest');
      process.exit(1);
    }
    
    // Run the tests
    await runTests(options);
    
    // Generate reports if coverage was requested
    if (options.coverage) {
      await generateTestReport();
    }
    
    log('', colors.green);
    success('Test execution completed successfully!');
    
  } catch (err) {
    error(`Test runner failed: ${err.message}`);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  warning('Tests interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  warning('Tests terminated');
  process.exit(143);
});

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
