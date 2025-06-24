// Jest setup file
import 'reflect-metadata';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.MCP_LOG_LEVEL = 'error';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup test timeout
jest.setTimeout(30000);
