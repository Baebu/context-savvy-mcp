# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Enhanced File Operations Tool**: New `multiline` parameter for complex regex patterns across multiple lines
- **Advanced Error Reporting**: Rich debugging information with file statistics, pattern analysis, and actionable suggestions
- **Search Timeout Protection**: Configurable timeout parameter for file search operations to prevent hanging

### Changed

- **File Search Engine**: Improved regex pattern handling with proper state management and multi-line support
- **Error Messages**: Enhanced from generic messages to detailed diagnostic reports with debugging context
- **Performance**: Optimized regex compilation and file processing with timeout protection

### Deprecated

### Removed

### Fixed

- **CRITICAL: Regex Search Engine**: Fixed `search_files` tool returning 0 matches for valid regex patterns due to improper `lastIndex` state management
  - Pattern `version.*2\.0\.0` now correctly matches files containing `version: 2.0.0`
  - Global regex state properly reset between files to prevent false negatives
  - Added comprehensive pattern validation and error handling
- **HIGH: Multi-line Text Replacement**: Fixed `content_edit_file` failures on complex multi-line patterns
  - CHANGELOG section replacements with multiple newlines now work reliably
  - Enhanced whitespace tolerance and flexible pattern matching
  - Added proper `m` and `s` flag support for multi-line regex operations
- **MEDIUM: Error Message Quality**: Replaced generic "No occurrences found" messages with detailed diagnostics
  - Added file content sampling and pattern analysis for debugging
  - Included actionable suggestions for common pattern matching issues
  - Enhanced case sensitivity detection and recommendations
- **TypeScript Compliance**: Resolved all type safety issues with proper error handling and variable declaration order

### Security

## [2.1.0] - 2025-06-23

### Added

- **Enhanced File Operations Tool**: New `multiline` parameter for complex regex patterns across multiple lines
- **Advanced Error Reporting**: Rich debugging information with file statistics, pattern analysis, and actionable suggestions
- **Search Timeout Protection**: Configurable timeout parameter for file search operations to prevent hanging

- **Public Release Preparation**: Complete repository cleanup and standardization for first public GitHub release
- **Enhanced Setup Script**: Consolidated setup functionality with Claude Desktop configuration display
- **Streamlined Configuration**: Simplified config system to use single comprehensive example file

### Changed

- **File Search Engine**: Improved regex pattern handling with proper state management and multi-line support
- **Error Messages**: Enhanced from generic messages to detailed diagnostic reports with debugging context
- **Performance**: Optimized regex compilation and file processing with timeout protection

- **Project Naming Standardization**: Unified all references to `context-savvy-mcp` across codebase and documentation
- **Configuration Architecture**: Simplified from multiple config files to single `server.example.yaml` approach
- **Setup Process**: Enhanced `scripts/setup.js` with better cross-platform support and Claude Desktop integration

### Removed

- **Development Artifacts Cleanup**:
  - Removed temporary test files: `test-build.mjs`, `test-compact-search-direct.mjs`, `test-intelligent-search.mjs`, `test-search-quick.mjs`
  - Removed internal documentation: `STAGE_1_IMPLEMENTATION_COMPLETE.md`, `QUICK_START_PROMPT.md`
  - Removed redundant setup script: `scripts/quick-setup.js` (functionality merged into main setup)
  - Removed unused config files: `config/development.yaml`, `config/production.yaml` (not used by config loader)
  - Removed internal development docs: `WORKSPACE_PERSISTENCE_IMPLEMENTATION.md`, `search-discovery-capabilities.md`, `INTELLIGENT_SEARCH_IMPLEMENTATION.md`, `INTELLIGENT_SEARCH_DESIGN.md`
  - Removed debug artifacts: `startup-debug.log`, `src/infrastructure/config/schema.ts.backup`

### Fixed

- **CRITICAL: Regex Search Engine**: Fixed `search_files` tool returning 0 matches for valid regex patterns due to improper `lastIndex` state management
  - Pattern `version.*2\.0\.0` now correctly matches files containing `version: 2.0.0`
  - Global regex state properly reset between files to prevent false negatives
  - Added comprehensive pattern validation and error handling
- **HIGH: Multi-line Text Replacement**: Fixed `content_edit_file` failures on complex multi-line patterns
  - CHANGELOG section replacements with multiple newlines now work reliably
  - Enhanced whitespace tolerance and flexible pattern matching
  - Added proper `m` and `s` flag support for multi-line regex operations
- **MEDIUM: Error Message Quality**: Replaced generic "No occurrences found" messages with detailed diagnostics
  - Added file content sampling and pattern analysis for debugging
  - Included actionable suggestions for common pattern matching issues
  - Enhanced case sensitivity detection and recommendations
- **TypeScript Compliance**: Resolved all type safety issues with proper error handling and variable declaration order

- **Configuration System**: Fixed setup script to only copy files that are actually used by the application
- **Project References**: Updated all hardcoded project names from inconsistent variations to standardized `context-savvy-mcp`
- **Package Scripts**: Removed references to deleted setup scripts in `package.json`

## [2.0.1] - 2025-06-17

### Added

- **Enhanced File Operations Tool**: New `multiline` parameter for complex regex patterns across multiple lines
- **Advanced Error Reporting**: Rich debugging information with file statistics, pattern analysis, and actionable suggestions
- **Search Timeout Protection**: Configurable timeout parameter for file search operations to prevent hanging

- **Enhanced Task Management System**

  - New `create_task` tool for standardized task creation with priorities, due dates, and tags
  - New `list_tasks` tool with advanced filtering, semantic search, and sorting capabilities
  - New `update_task` tool for updating task properties and tracking progress
  - New `complete_task` tool with optional follow-up task creation
  - New `task_templates` tool for managing reusable task workflows
  - Support for recurring tasks with daily, weekly, and monthly patterns
  - Task hierarchies with parent/child relationships
  - Full workspace and session integration for better organization
  - Automatic semantic tagging for improved discovery

- **Autonomous System Behaviors**
  - New `AutonomousMonitorService` for background monitoring of system state
  - Automatic token usage tracking with thresholds (70%, 90%, 95%)
  - Automatic checkpointing at 70% token usage
  - Automatic handoff preparation at 90% token usage
  - Automatic panic mode at 95% token usage
  - Background compression for contexts > 10KB
  - Scheduled archiving (daily) and deduplication (every 6 hours)
  - Token tracking middleware for transparent usage monitoring
  - Control tools: `enable_autonomous_monitoring`, `disable_autonomous_monitoring`, `get_autonomous_status`, `trigger_maintenance`

### Fixed

- **CRITICAL: Regex Search Engine**: Fixed `search_files` tool returning 0 matches for valid regex patterns due to improper `lastIndex` state management
  - Pattern `version.*2\.0\.0` now correctly matches files containing `version: 2.0.0`
  - Global regex state properly reset between files to prevent false negatives
  - Added comprehensive pattern validation and error handling
- **HIGH: Multi-line Text Replacement**: Fixed `content_edit_file` failures on complex multi-line patterns
  - CHANGELOG section replacements with multiple newlines now work reliably
  - Enhanced whitespace tolerance and flexible pattern matching
  - Added proper `m` and `s` flag support for multi-line regex operations
- **MEDIUM: Error Message Quality**: Replaced generic "No occurrences found" messages with detailed diagnostics
  - Added file content sampling and pattern analysis for debugging
  - Included actionable suggestions for common pattern matching issues
  - Enhanced case sensitivity detection and recommendations
- **TypeScript Compliance**: Resolved all type safety issues with proper error handling and variable declaration order

- **Task Discovery Issues**

  - `find_active_tasks` now properly discovers tasks using semantic search
  - Improved task discovery with multiple search patterns
  - Better deduplication logic to avoid duplicate results
  - Tasks now properly tagged for semantic discovery

- **Manual Tool Issues**
  - Converted manual emergency tools to automatic triggers
  - Fixed token budget optimization to run continuously
  - Made compression automatic on storage operations
  - Automated context deduplication and archiving

### Changed

- **File Search Engine**: Improved regex pattern handling with proper state management and multi-line support
- **Error Messages**: Enhanced from generic messages to detailed diagnostic reports with debugging context
- **Performance**: Optimized regex compilation and file processing with timeout protection

- Task storage now uses standardized schema with consistent structure
- Tasks automatically tagged with status, priority, workspace, and creation date
- Improved task lifecycle management with proper state transitions
- Enhanced integration with existing context management system
- Emergency protocols now trigger automatically based on system state
- Token tracking integrated transparently into all tool executions

## [2.0.0] - 2025-06-14

### Added

- **Enhanced File Operations Tool**: New `multiline` parameter for complex regex patterns across multiple lines
- **Advanced Error Reporting**: Rich debugging information with file statistics, pattern analysis, and actionable suggestions
- **Search Timeout Protection**: Configurable timeout parameter for file search operations to prevent hanging

- Complete rewrite with TypeScript and clean architecture
- Enhanced security with command whitelisting and path validation
- SQLite-based context storage with advanced querying
- Smart path bundling for efficient file operations
- Comprehensive monitoring and metrics
- Flexible YAML-based configuration
- Full test coverage with Jest
- GitHub Actions CI/CD pipeline
- Issue templates and pull request templates
- Security policy and vulnerability reporting process

### Changed

- **File Search Engine**: Improved regex pattern handling with proper state management and multi-line support
- **Error Messages**: Enhanced from generic messages to detailed diagnostic reports with debugging context
- **Performance**: Optimized regex compilation and file processing with timeout protection

- Migrated from JavaScript to TypeScript
- Implemented clean architecture patterns
- Enhanced performance with streaming operations
- Improved error handling and logging

### Security

- Added command whitelisting for secure execution
- Implemented path validation and sanitization
- Added comprehensive security measures
