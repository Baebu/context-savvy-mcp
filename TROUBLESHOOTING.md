# Context Savvy MCP - Troubleshooting Guide

## Common Issues & Solutions

### 1. MCP Error -32603: contextKeys Expected Array

**Symptoms:**

```
Error: MCP error -32603: [{"code": "invalid_type", "expected": "array", "received": "undefined", "path": ["contextKeys"], "message": "Required"}]
```

**Root Cause:** MCP tools expecting `contextKeys` as an array parameter but receiving `undefined`.

**Solution:**

```typescript
// In affected tools, ensure contextKeys is always an array
const contextKeys = Array.isArray(params.contextKeys)
  ? params.contextKeys
  : params.contextKeys
    ? [params.contextKeys]
    : [];
```

**Quick Fix:** Update tool schemas to include optional contextKeys parameter:

```typescript
const toolSchema = z.object({
  contextKeys: z.array(z.string()).optional().describe('Array of context keys to process'),
  // ... other parameters
});
```

### 2. Path Template Resolution Error

**Symptoms:**

```
Error reading file:///{path}: Access denied: Path 'A:\%7Bpath%7D' not within any configured safe zone
```

**Root Cause:** Resource template `'file:///{path}'` not properly interpolating - `{path}` getting URL encoded to `%7Bpath%7D` instead of being replaced.

**Solution:** Enhanced resource with proper URI parsing:

```typescript
private parseResourceUri(uri: string): { path: string } {
  // Handle both encoded and non-encoded URIs
  const decodedUri = decodeURIComponent(uri);
  const urlParts = new URL(decodedUri);

  let filePath = urlParts.pathname;

  // Remove leading slash on Windows
  if (process.platform === 'win32' && filePath.startsWith('/') {
    filePath = filePath.substring(1);
  }

  return { path: filePath };
}
```

### 3. Advanced Features Not Responding

**Symptoms:**

- `execute_smart_path`: No result received
- `token_budget_optimization`: No result received
- `task_completion_detection`: No result received

**Root Cause:** Advanced Phase 4-7 features may have timeout issues or dependency problems.

**Solution:**

1. Check server logs for specific error messages
2. Verify all dependencies are properly registered in DI container
3. Test individual components separately
4. Consider increasing timeout values for complex operations

## System Health Diagnostics

### Quick Health Check

```bash
# Check if server is running properly
npm run health-check

# Get comprehensive system status
npm run start -- --health-check
```

### Expected System Status

- **Database**: Should be accessible with reasonable size (e.g., 133MB)
- **Context Items**: Should show stored contexts with embeddings
- **Workspaces**: Should list active workspaces
- **Security**: Safe zones should be properly configured
- **Monitoring**: Autonomous monitoring should be active

### Performance Baselines

- **Batch Operations**: ~3000 operations/second
- **Context Storage**: Should handle 1000+ context items
- **Search Operations**: Sub-second response for most queries
- **File Operations**: Fast directory listing and file access

## Deployment Validation

### Pre-Deployment Checklist

1. **Build succeeds without errors**

   ```bash
   npm run build
   ```

2. **Tests pass**

   ```bash
   npm test
   ```

3. **Core functionality works**
   - File access through resources
   - Context storage and retrieval
   - Security validation
   - Basic tool operations

### Post-Deployment Validation

1. **Test Resource Access**

   ```bash
   # Test file:// URI resolution
   # Should NOT contain %7B or %7D encoding
   ```

2. **Verify Parameter Handling**

   ```bash
   # Test tools with contextKeys parameter
   # Should NOT produce MCP -32603 errors
   ```

3. **Check Error Messages**
   - Should be clear and actionable
   - Should include helpful suggestions
   - Should provide debugging information

## Configuration Troubleshooting

### Safe Zone Configuration

```yaml
# Enhanced safe zone configuration
security:
  safeZones:
    - "A:/*"
    - "."
    - "${workingDirectory}/**"
  pathResolution:
    enableTemplateResolution: true
    validateResolvedPaths: true
    urlDecoding: true
  errorHandling:
    verboseErrors: true
    includeSuggestions: true
```

### Common Configuration Issues

1. **Path Access Denied**
   - Verify safe zones include required directories
   - Check for proper wildcard usage (`/*` vs `/**`)
   - Ensure paths are properly formatted for your OS

2. **Resource Template Issues**
   - Verify template strings don't contain unresolved variables
   - Check URI encoding/decoding configuration
   - Test with absolute paths first

## Error Handling & Debugging

### Enhanced Error Messages

The system now provides detailed error information:

```json
{
  "error": true,
  "tool": "tool-name",
  "message": "Detailed error description",
  "suggestions": [
    "Actionable suggestion 1",
    "Actionable suggestion 2"
  ],
  "timestamp": "2025-06-23T21:39:00Z"
}
```

### Debugging Steps

1. **Check Server Logs**
   - Look for specific error patterns
   - Check for dependency injection issues
   - Verify database connectivity

2. **Test Individual Components**
   - Resource access: Try file:// URIs
   - Smart paths: Test creation and execution
   - Parameter validation: Check array handling

3. **Validate Configuration**
   - Review safe zone settings
   - Check path resolution options
   - Verify security configurations

## Testing & Validation

### Automated Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "Resource Path Resolution"
npm test -- --grep "MCP Parameter Handling"
```

### Manual Testing Checklist

#### Core Functionality ✅

- [ ] File resource access works without encoding issues
- [ ] Context storage and retrieval functions properly
- [ ] Security validation works correctly
- [ ] Basic tool operations complete successfully

#### Advanced Features ⚠️

- [ ] Smart path execution handles contextKeys properly
- [ ] Batch operations complete without errors
- [ ] Token optimization functions respond
- [ ] Task completion detection works

#### Error Handling ✅

- [ ] Error messages are helpful and actionable
- [ ] Debugging information is sufficient
- [ ] Graceful degradation for common issues

## Performance Optimization

### Current Performance Metrics

- **Database**: 133.23 MB with 1095 context items
- **Embeddings**: 626 contexts with semantic embeddings
- **Workspaces**: 14 active workspaces (47KB to 1.2GB range)
- **Operations**: 3000 operations/second in batch mode

### Optimization Opportunities

1. **Database Optimization**
   - Regular cleanup of old contexts
   - Index optimization for search operations
   - Embedding cache management

2. **Memory Management**
   - Monitor context window usage
   - Implement automatic compression
   - Optimize batch operations

3. **File System Operations**
   - Cache frequently accessed files
   - Optimize directory traversal
   - Improve path resolution performance

## Rollback Procedures

### If Issues Arise

1. **Immediate Rollback**

   ```bash
   # Restore backup files
   cp src/application/resources/project-files.resource.backup.ts src/application/resources/project-files.resource.ts

   # Rebuild and restart
   npm run build && npm run start
   ```

2. **Partial Rollback**
   - Disable new tools if they cause issues
   - Revert to previous working configuration
   - Monitor logs for root cause analysis

3. **Validation After Rollback**
   - Verify server starts without errors
   - Test basic functionality
   - Monitor error rates

## Support & Community

### Getting Help

1. **Check Logs First**
   - Server logs contain detailed error information
   - Look for patterns in recurring issues
   - Check timestamps for correlation

2. **Gather System Information**
   - Server version and configuration
   - Operating system and Node.js version
   - Error messages and stack traces
   - Steps to reproduce the issue

3. **Search Known Issues**
   - Check existing GitHub issues
   - Review documentation for similar problems
   - Consult community discussions

### Reporting Issues

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- System configuration details
- Relevant log entries
- Any error messages

## Maintenance & Updates

### Regular Maintenance

1. **Database Cleanup**
   - Remove old or unused contexts
   - Optimize database indexes
   - Monitor database size growth

2. **Performance Monitoring**
   - Track response times
   - Monitor memory usage
   - Check error rates

3. **Security Updates**
   - Review safe zone configurations
   - Update security policies
   - Monitor access patterns

### Update Procedures

1. **Before Updates**
   - Backup current configuration
   - Test in development environment
   - Review changelog for breaking changes

2. **During Updates**
   - Follow deployment validation checklist
   - Monitor for new issues
   - Test core functionality

3. **After Updates**
   - Verify all features work correctly
   - Update documentation if needed
   - Monitor system performance

---

*This guide consolidates information from multiple sources and will be updated as new issues are discovered and resolved.*
