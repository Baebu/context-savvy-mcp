// src/infrastructure/adapters/enhanced-cli.adapter.ts - Fixed Logger Issues
import { spawn, ChildProcess } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { injectable, inject } from 'inversify';
import { EventEmitter } from 'node:events';
import type {
  CommandResult,
  CommandOptions,
  IEnhancedCLIHandler, // Import new interface
  ProcessInfoPublic,
  ProcessLimitsPublic,
  ProcessManagerStatsPublic
} from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/schema.js'; // Corrected import
import os from 'node:os';

interface ProcessInfoInternal {
  id: string;
  command: string;
  args: string[];
  pid: number;
  startTime: Date;
  process: ChildProcess;
  timeout: NodeJS.Timeout;
  memoryUsage: number;
  cpuUsage: number;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  maxMemoryMB: number;
  maxProcessCpuPercent: number;
}

// Using ProcessLimitsPublic directly as ProcessLimits
// Using ProcessManagerStatsPublic directly as ProcessManagerStats

@injectable()
export class EnhancedCLIAdapter extends EventEmitter implements IEnhancedCLIHandler {
  private processes = new Map<string, ProcessInfoInternal>();
  private processCounter = 0;
  private limits: ProcessLimitsPublic;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private resourceMonitorInterval: NodeJS.Timeout | null = null;
  private stats: ProcessManagerStatsPublic;

  constructor(
    @inject('SecurityValidator') private security: ISecurityValidator,
    @inject('Config') private config: ServerConfig
  ) {
    super();

    // Initialize process limits from config
    this.limits = {
      maxConcurrentProcesses: this.config.security?.maxConcurrentProcesses || 5,
      maxProcessMemoryMB: this.config.security?.maxProcessMemoryMB || 512,
      maxProcessCpuPercent: this.config.security?.maxProcessCpuPercent || 80,
      defaultTimeoutMs: this.config.security?.defaultTimeoutMs || 30000,
      maxTimeoutMs: this.config.security?.maxTimeoutMs || 300000,
      cleanupIntervalMs: this.config.security?.cleanupIntervalMs || 60000,
      resourceCheckIntervalMs: this.config.security?.resourceCheckIntervalMs || 5000
    };

    // Initialize stats
    this.stats = {
      activeProcesses: 0,
      totalProcesses: 0,
      completedProcesses: 0,
      failedProcesses: 0,
      timeoutProcesses: 0,
      killedProcesses: 0,
      totalMemoryUsageMB: 0,
      totalCpuUsage: 0
    };

    // Start background processes
    this.startCleanupProcess();
    if (this.config.security?.enableProcessMonitoring !== false) {
      this.startResourceMonitoring();
    }

    logger.info('Enhanced CLI Adapter initialized with process management');
  }
  /**
   * Enhanced CLI Adapter for managing command execution with process limits, security validation,
   * and resource monitoring.
   * Implements ICLIHandler interface for command execution and management.
   */

  // Required by ICLIHandler interface
  async execute(params: { command: string; args: string[]; options?: CommandOptions }): Promise<CommandResult> {
    // Validate concurrency limits
    if (this.processes.size >= this.limits.maxConcurrentProcesses) {
      throw new Error(`Maximum concurrent processes (${this.limits.maxConcurrentProcesses}) exceeded`);
    }

    // Security validation
    await this.security.validateCommand(params.command, params.args);

    // Generate unique process ID
    const processId = this.generateProcessId();

    // Set timeout (respect limits)
    const timeout = Math.min(params.options?.timeout || this.limits.defaultTimeoutMs, this.limits.maxTimeoutMs);

    try {
      const result = await this.spawnProcess(processId, params.command, params.args, {
        ...params.options,
        timeout
      });

      this.stats.completedProcesses++;
      return result;
    } catch (error) {
      this.stats.failedProcesses++;
      throw error;
    }
  }

  // Required by ICLIHandler interface
  async validateCommand(command: string): Promise<boolean> {
    try {
      await this.security.validateCommand(command, []);
      return true;
    } catch {
      return false;
    }
  }

  private generateProcessId(): string {
    return `proc_${Date.now()}_${++this.processCounter}`;
  }

  private async spawnProcess(
    processId: string,
    command: string,
    args: string[],
    options: CommandOptions
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      // Determine shell settings
      const shellInfo = this.getShellInfo(command, args, options);

      const spawnOptions: SpawnOptions = {
        cwd: options.cwd,
        env: { ...process.env, ...shellInfo.env },
        stdio: options.visibleTerminal ? ['ignore', 'ignore', 'ignore'] : ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: shellInfo.detached || false,
        windowsHide: shellInfo.windowsHide !== false
      };

      // Spawn the process
      const childProcess = spawn(shellInfo.command, shellInfo.args, spawnOptions);

      if (!childProcess.pid) {
        reject(new Error(`Failed to spawn process: ${command}`));
        return;
      }

      // Create process info
      const processInfo: ProcessInfoInternal = {
        id: processId,
        command,
        args,
        pid: childProcess.pid,
        startTime: new Date(),
        process: childProcess,
        timeout: setTimeout(() => this.handleTimeout(processId), options.timeout || this.limits.defaultTimeoutMs),
        memoryUsage: 0, // Will be updated by monitorResourceUsage
        cpuUsage: 0, // Will be updated by monitorResourceUsage
        status: 'running',
        maxMemoryMB: this.limits.maxProcessMemoryMB,
        maxProcessCpuPercent: this.limits.maxProcessCpuPercent
      };

      // Register process
      this.processes.set(processId, processInfo);
      this.stats.activeProcesses++;
      this.stats.totalProcesses++;

      let stdout = '';
      let stderr = '';

      // Handle output for non-visible terminals
      if (!options.visibleTerminal) {
        // Handle stdout
        if (childProcess.stdout) {
          childProcess.stdout.on('data', data => {
            stdout += data.toString();
          });
        }

        // Handle stderr
        if (childProcess.stderr) {
          childProcess.stderr.on('data', data => {
            stderr += data.toString();
          });
        }
      } else {
        // For visible terminals, we don't capture output
        stdout = '[Output displayed in visible terminal window]';
        stderr = '';

        // Log that a visible terminal was opened
        logger.info(
          {
            processId,
            command,
            args,
            terminalType: options.terminalType || 'auto',
            title: options.title || 'CLI Command Execution'
          },
          'Opened visible terminal window for command execution'
        );
      }

      // Handle process completion
      childProcess.on('close', (code, signal) => {
        clearTimeout(processInfo.timeout);

        if (signal) {
          processInfo.status = signal === 'SIGTERM' ? 'timeout' : 'killed';
          this.stats.killedProcesses++;
        } else if (code === 0) {
          processInfo.status = 'completed';
        } else {
          processInfo.status = 'failed';
        }

        // Schedule cleanup
        setTimeout(() => this.cleanupProcess(processId), 5000);

        // Return standard CommandResult (no processId as it's not in interface)
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: code || 0,
          signal,
          executionTime: Date.now() - processInfo.startTime.getTime()
        };

        if (processInfo.status === 'completed') {
          resolve(result);
        } else {
          reject(new Error(`Process ${processInfo.status}: ${stderr || `Exit code: ${code}`}`));
        }
      });

      // Handle process errors
      childProcess.on('error', error => {
        clearTimeout(processInfo.timeout);
        processInfo.status = 'failed';
        this.cleanupProcess(processId);
        reject(error);
      });

      // Emit process started event
      this.emit('processStarted', { processId, command, args, pid: childProcess.pid });
    });
  }

  private getShellInfo(
    command: string,
    args: string[],
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
    detached?: boolean;
    windowsHide?: boolean;
  } {
    const platform = process.platform;
    const fullCommand = `${command} ${args.join(' ')}`;

    // Handle visible terminal requests
    if (options.visibleTerminal) {
      return this.getVisibleTerminalInfo(fullCommand, options);
    }

    // Default background execution
    if (platform === 'win32') {
      return {
        command: 'cmd.exe',
        args: ['/c', fullCommand],
        env: options.env,
        windowsHide: true
      };
    } else {
      return {
        command: 'sh',
        args: ['-c', fullCommand],
        env: options.env
      };
    }
  }

  private getVisibleTerminalInfo(
    fullCommand: string,
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
    detached?: boolean;
    windowsHide?: boolean;
  } {
    const platform = process.platform;
    const terminalType = options.terminalType || 'auto';
    const title = options.title || 'CLI Command Execution';
    const keepOpen = options.keepOpen !== false; // Default to true

    if (platform === 'win32') {
      return this.getWindowsVisibleTerminal(fullCommand, terminalType, title, keepOpen, options);
    } else if (platform === 'darwin') {
      return this.getMacOSVisibleTerminal(fullCommand, title, keepOpen, options);
    } else {
      return this.getLinuxVisibleTerminal(fullCommand, title, keepOpen, options);
    }
  }

  private getWindowsVisibleTerminal(
    fullCommand: string,
    terminalType: string,
    title: string,
    keepOpen: boolean,
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
    detached?: boolean;
    windowsHide?: boolean;
  } {
    const pauseCommand = keepOpen ? ' & pause' : '';

    switch (terminalType) {
      case 'wt':
        // Windows Terminal
        return {
          command: 'wt.exe',
          args: ['new-tab', '--title', title, 'cmd.exe', '/c', `title ${title} && ${fullCommand}${pauseCommand}`],
          env: options.env,
          detached: true,
          windowsHide: false
        };

      case 'powershell':
        // PowerShell
        return {
          command: 'powershell.exe',
          args: [
            '-NoExit',
            '-WindowStyle',
            'Normal',
            '-Command',
            `$Host.UI.RawUI.WindowTitle = '${title}'; ${fullCommand}`
          ],
          env: options.env,
          detached: true,
          windowsHide: false
        };

      case 'cmd':
        // Command Prompt
        return {
          command: 'cmd.exe',
          args: [
            '/c',
            'start',
            `"${title}"`,
            '/wait',
            'cmd.exe',
            '/k',
            `title ${title} && ${fullCommand}${pauseCommand}`
          ],
          env: options.env,
          detached: false,
          windowsHide: false
        };

      case 'auto':
      default:
        // Try Windows Terminal first, fall back to cmd
        const hasWindowsTerminal = this.hasWindowsTerminal();
        if (hasWindowsTerminal) {
          return this.getWindowsVisibleTerminal(fullCommand, 'wt', title, keepOpen, options);
        } else {
          return this.getWindowsVisibleTerminal(fullCommand, 'cmd', title, keepOpen, options);
        }
    }
  }

  private getMacOSVisibleTerminal(
    fullCommand: string,
    title: string,
    keepOpen: boolean,
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
    detached?: boolean;
  } {
    // Use title in the AppleScript to set terminal window name
    const titleScript = `tell application "Terminal" to set custom title of front window to "${title}"`;
    const commandScript = keepOpen
      ? `tell application "Terminal" to do script "${fullCommand}; echo 'Press any key to continue...'; read -n 1"`
      : `tell application "Terminal" to do script "${fullCommand}"`;

    const combinedScript = `${commandScript}; ${titleScript}`;

    return {
      command: 'osascript',
      args: ['-e', combinedScript],
      env: options.env,
      detached: true
    };
  }

  private getLinuxVisibleTerminal(
    fullCommand: string,
    title: string,
    keepOpen: boolean,
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
    detached?: boolean;
  } {
    const holdOption = keepOpen ? '--hold' : '';

    // Try common Linux terminal emulators
    const terminals = [
      { name: 'gnome-terminal', args: ['--title', title, holdOption, '--', 'bash', '-c', fullCommand] },
      { name: 'konsole', args: ['--title', title, holdOption, '-e', 'bash', '-c', fullCommand] },
      { name: 'xterm', args: ['-title', title, holdOption, '-e', 'bash', '-c', fullCommand] },
      { name: 'urxvt', args: ['-title', title, holdOption, '-e', 'bash', '-c', fullCommand] }
    ];

    // Use the first available terminal
    for (const terminal of terminals) {
      if (this.commandExists(terminal.name)) {
        return {
          command: terminal.name,
          args: terminal.args.filter(arg => arg !== ''), // Remove empty args
          env: options.env,
          detached: true
        };
      }
    }

    // Fallback to xterm
    return {
      command: 'xterm',
      args: ['-title', title, '-e', 'bash', '-c', fullCommand],
      env: options.env,
      detached: true
    };
  }

  private hasWindowsTerminal(): boolean {
    try {
      const { execSync } = require('child_process');
      execSync('where wt.exe', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private commandExists(command: string): boolean {
    try {
      const { execSync } = require('child_process');
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private handleTimeout(processId: string): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    logger.warn(`Process ${processId} timed out, killing...`);

    processInfo.status = 'timeout';
    this.stats.timeoutProcesses++;

    this.forceKillProcess(processId);
  }

  public killProcess(processId: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): boolean {
    const processInfo = this.processes.get(processId);
    if (!processInfo || processInfo.status !== 'running') {
      return false;
    }

    logger.info(`Killing process ${processId} with ${signal}`);

    try {
      if (signal === 'SIGKILL' || process.platform === 'win32') {
        // On Windows, 'SIGTERM' is not directly supported, 'kill' sends SIGKILL by default
        processInfo.process.kill('SIGKILL');
      } else {
        processInfo.process.kill(signal);

        // Give process time to gracefully shutdown, then force kill
        setTimeout(() => {
          if (processInfo.status === 'running') {
            logger.warn(`Process ${processId} didn't respond to ${signal}, force killing...`);
            processInfo.process.kill('SIGKILL');
          }
        }, this.config.security?.processKillGracePeriodMs || 5000);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to kill process ${processId}: ${String(error)}`);
      return false;
    }
  }

  public forceKillProcess(processId: string): void {
    this.killProcess(processId, 'SIGKILL');
  }

  public killAllProcesses(): number {
    const activeProcesses = Array.from(this.processes.values()).filter(p => p.status === 'running');

    let killedCount = 0;
    for (const process of activeProcesses) {
      if (this.killProcess(process.id)) {
        killedCount++;
      }
    }

    logger.info(`Killed ${killedCount} active processes`);
    return killedCount;
  }

  private mapToProcessInfoPublic(processInfo: ProcessInfoInternal): ProcessInfoPublic {
    return {
      id: processInfo.id,
      command: processInfo.command,
      args: processInfo.args,
      pid: processInfo.pid,
      startTime: processInfo.startTime,
      memoryUsage: processInfo.memoryUsage,
      cpuUsage: processInfo.cpuUsage,
      status: processInfo.status
    };
  }

  public getProcesses(): ProcessInfoPublic[] {
    return Array.from(this.processes.values()).map(this.mapToProcessInfoPublic);
  }

  public getProcessInfo(processId: string): ProcessInfoPublic | undefined {
    const processInfo = this.processes.get(processId);
    return processInfo ? this.mapToProcessInfoPublic(processInfo) : undefined;
  }

  public getStats(): ProcessManagerStatsPublic & { systemResources: any } {
    const systemMemory = process.memoryUsage();
    const loadAverage = os.loadavg(); // [1min, 5min, 15min]

    return {
      ...this.stats,
      systemResources: {
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        memoryUsagePercent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
        loadAverage,
        platform: os.platform(),
        cpuCount: os.cpus().length,
        nodeMemory: {
          rss: Math.round(systemMemory.rss / 1024 / 1024),
          heapTotal: Math.round(systemMemory.heapTotal / 1024 / 1024),
          heapUsed: Math.round(systemMemory.heapUsed / 1024 / 1024),
          external: Math.round(systemMemory.external / 1024 / 1024)
        }
      }
    };
  }

  public updateLimits(newLimits: Partial<ProcessLimitsPublic>): void {
    this.limits = { ...this.limits, ...newLimits };
    logger.info('Process limits updated');
  }

  public getLimits(): ProcessLimitsPublic {
    return { ...this.limits };
  }

  private startCleanupProcess(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.limits.cleanupIntervalMs);
  }

  private startResourceMonitoring(): void {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
    }

    this.resourceMonitorInterval = setInterval(() => {
      this.monitorResourceUsage();
    }, this.limits.resourceCheckIntervalMs);
  }

  private performCleanup(): void {
    const now = Date.now();
    const processesToCleanup: string[] = [];

    for (const [processId, processInfo] of this.processes) {
      // Clean up completed processes older than 5 minutes
      if (processInfo.status !== 'running' && now - processInfo.startTime.getTime() > 300000) {
        processesToCleanup.push(processId);
      }
    }

    for (const processId of processesToCleanup) {
      this.cleanupProcess(processId);
    }

    if (processesToCleanup.length > 0) {
      logger.debug(`Cleaned up ${processesToCleanup.length} old processes`);
    }
  }

  private cleanupProcess(processId: string): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    // Clear timeout if still active
    if (processInfo.timeout) {
      clearTimeout(processInfo.timeout);
    }

    // Remove from active processes count
    if (processInfo.status === 'running') {
      this.stats.activeProcesses--;
    }

    // Remove from tracking
    this.processes.delete(processId);

    this.emit('processCleanedUp', { processId });
  }

  private async monitorResourceUsage(): Promise<void> {
    // Update total CPU and memory usage for all tracked processes
    this.updateResourceStats();

    for (const [_processId, processInfo] of this.processes) {
      if (processInfo.status !== 'running') continue;

      // Get actual resource usage for child processes
      try {
        const resourceUsage = await this.getProcessResourceUsage(processInfo.pid);
        processInfo.memoryUsage = resourceUsage.memory;
        processInfo.cpuUsage = resourceUsage.cpu;
      } catch (error) {
        // Fallback to basic estimation if platform-specific monitoring fails
        logger.debug(`Resource monitoring failed for PID ${processInfo.pid}, using fallback: ${String(error)}`);
        
        // Use process runtime as a basic heuristic for resource estimation
        const runtime = Date.now() - processInfo.startTime.getTime();
        const baseMemory = 20; // Base memory estimate in MB
        const runtimeMemory = Math.min(runtime / 60000 * 5, 50); // Add 5MB per minute, max 50MB
        
        processInfo.memoryUsage = Math.floor(baseMemory + runtimeMemory);
        processInfo.cpuUsage = 0; // Cannot estimate CPU reliably without proper monitoring
      }

      // Check memory limits
      if (processInfo.memoryUsage > processInfo.maxMemoryMB) {
        logger.warn(
          `Process ${processInfo.id} exceeded memory limit (${processInfo.memoryUsage}MB > ${processInfo.maxMemoryMB}MB), killing...`
        );
        this.forceKillProcess(processInfo.id);
        continue;
      }

      // Check CPU limits (warning only, don't kill unless configured to)
      if (processInfo.cpuUsage > processInfo.maxProcessCpuPercent) {
        logger.warn(`Process ${processInfo.id} high CPU usage: ${processInfo.cpuUsage.toFixed(1)}%`);
      }
    }
  }

  private async getProcessResourceUsage(pid: number): Promise<{ memory: number; cpu: number }> {
    const platform = process.platform;
    
    try {
      if (platform === 'win32') {
        return await this.getWindowsProcessUsage(pid);
      } else if (platform === 'darwin') {
        return await this.getMacOSProcessUsage(pid);
      } else {
        return await this.getLinuxProcessUsage(pid);
      }
    } catch (error) {
      throw new Error(`Platform-specific resource monitoring failed: ${String(error)}`);
    }
  }

  private async getWindowsProcessUsage(pid: number): Promise<{ memory: number; cpu: number }> {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      // Use PowerShell to get process info (memory in KB, CPU percentage)
      const { stdout } = await execAsync(
        `powershell -Command "Get-Process -Id ${pid} | Select-Object WorkingSet,CPU | ConvertTo-Json"`,
        { timeout: 5000 }
      );
      
      const processData = JSON.parse(stdout.trim());
      const memoryMB = Math.round((processData.WorkingSet || 0) / 1024 / 1024);
      const cpuPercent = parseFloat(processData.CPU || '0');
      
      return { memory: memoryMB, cpu: cpuPercent };
    } catch (error) {
      throw new Error(`Windows process monitoring failed: ${String(error)}`);
    }
  }

  private async getMacOSProcessUsage(pid: number): Promise<{ memory: number; cpu: number }> {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      // Use ps command to get memory (RSS in KB) and CPU percentage
      const { stdout } = await execAsync(`ps -p ${pid} -o rss=,pcpu=`, { timeout: 5000 });
      
      const parts = stdout.trim().split(/\s+/);
      const memoryKB = parseInt(parts[0] || '0', 10);
      const cpuPercent = parseFloat(parts[1] || '0');
      
      return { memory: Math.round(memoryKB / 1024), cpu: cpuPercent };
    } catch (error) {
      throw new Error(`macOS process monitoring failed: ${String(error)}`);
    }
  }

  private async getLinuxProcessUsage(pid: number): Promise<{ memory: number; cpu: number }> {
    const { readFile } = await import('node:fs/promises');
    
    try {
      // Read from /proc filesystem for memory and CPU info
      const statContent = await readFile(`/proc/${pid}/stat`, 'utf8');
      const statusContent = await readFile(`/proc/${pid}/status`, 'utf8');
      
      // Parse memory from status file (VmRSS line)
      const vmRssMatch = statusContent.match(/VmRSS:\s+(\d+)\s+kB/);
      const memoryKB = vmRssMatch ? parseInt(vmRssMatch[1], 10) : 0;
      
      // Parse CPU times from stat file (simplified calculation)
      const statParts = statContent.split(' ');
      const utime = parseInt(statParts[13] || '0', 10);
      const stime = parseInt(statParts[14] || '0', 10);
      const totalTime = utime + stime;
      
      // Simple CPU percentage estimate (would need more complex calculation for accuracy)
      const cpuPercent = totalTime > 0 ? Math.min(totalTime / 100, 100) : 0;
      
      return { memory: Math.round(memoryKB / 1024), cpu: cpuPercent };
    } catch (error) {
      throw new Error(`Linux process monitoring failed: ${String(error)}`);
    }
  }

  private updateResourceStats(): void {
    let totalMemory = 0;
    let totalCpu = 0;

    for (const processInfo of this.processes.values()) {
      if (processInfo.status === 'running') {
        totalMemory += processInfo.memoryUsage;
        totalCpu += processInfo.cpuUsage;
      }
    }

    this.stats.totalMemoryUsageMB = totalMemory;
    this.stats.totalCpuUsage = totalCpu;
  }

  public shutdown(): void {
    logger.info('Shutting down Enhanced CLI Adapter...');

    // Kill all running processes
    this.killAllProcesses();

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = null;
    }

    // Clear all processes
    this.processes.clear();

    logger.info('Enhanced CLI Adapter shutdown complete');
  }
}
