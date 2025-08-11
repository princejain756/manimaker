import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// VPS Configuration
const VPS_CONFIG = {
  baseDir: '/var/www/manimaker',
  sandboxDir: '/var/www/manimaker/sandboxes',
  user: 'www-data',
  group: 'www-data'
};

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

interface ExecuteRequest {
  action: 'writeFile' | 'runCommand' | 'readFile' | 'deleteFile' | 'listFiles' | 'installPackages';
  filePath?: string;
  content?: string;
  command?: string;
  packages?: string[];
  cwd?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    const { action } = body;

    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandbox = global.activeSandbox;
    const sandboxDir = sandbox.directory;

    switch (action) {
      case 'writeFile':
        return await writeFile(sandboxDir, body.filePath!, body.content!);
      case 'runCommand':
        return await runCommand(sandboxDir, body.command!, body.cwd);
      case 'readFile':
        return await readFile(sandboxDir, body.filePath!);
      case 'deleteFile':
        return await deleteFile(sandboxDir, body.filePath!);
      case 'listFiles':
        return await listFiles(sandboxDir);
      case 'installPackages':
        return await installPackages(sandboxDir, body.packages!);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[vps-sandbox/execute] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function writeFile(sandboxDir: string, filePath: string, content: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Writing file: ${filePath}`);

    // Ensure the file path is relative to sandbox directory
    const fullPath = path.join(sandboxDir, filePath);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    await execAsync(`sudo mkdir -p "${dir}"`);

    // Write the file
    await execAsync(`sudo tee "${fullPath}" > /dev/null << 'EOF'
${content}
EOF`);

    // Set proper ownership
    await execAsync(`sudo chown ${VPS_CONFIG.user}:${VPS_CONFIG.group} "${fullPath}"`);

    // Track the file in existing files
    if (global.existingFiles) {
      global.existingFiles.add(filePath);
    }

    console.log(`[vps-sandbox] File written successfully: ${filePath}`);

    return NextResponse.json({
      success: true,
      filePath,
      message: 'File written successfully'
    });

  } catch (error) {
    console.error(`[vps-sandbox] Error writing file ${filePath}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write file' },
      { status: 500 }
    );
  }
}

async function runCommand(sandboxDir: string, command: string, cwd?: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Running command: ${command}`);

    const workingDir = cwd ? path.join(sandboxDir, cwd) : sandboxDir;
    
    // Run command as the web user
    const { stdout, stderr } = await execAsync(
      `cd "${workingDir}" && sudo -u ${VPS_CONFIG.user} ${command}`,
      { timeout: 60000 } // 60 second timeout
    );

    console.log(`[vps-sandbox] Command completed: ${command}`);

    return NextResponse.json({
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
      cwd: workingDir
    });

  } catch (error: any) {
    console.error(`[vps-sandbox] Error running command ${command}:`, error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      command,
      cwd: cwd || sandboxDir
    });
  }
}

async function readFile(sandboxDir: string, filePath: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Reading file: ${filePath}`);

    const fullPath = path.join(sandboxDir, filePath);
    
    // Check if file exists
    try {
      await execAsync(`sudo test -f "${fullPath}"`);
    } catch (error) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read the file
    const { stdout: content } = await execAsync(`sudo cat "${fullPath}"`);

    console.log(`[vps-sandbox] File read successfully: ${filePath}`);

    return NextResponse.json({
      success: true,
      filePath,
      content: content,
      size: content.length
    });

  } catch (error) {
    console.error(`[vps-sandbox] Error reading file ${filePath}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read file' },
      { status: 500 }
    );
  }
}

async function deleteFile(sandboxDir: string, filePath: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Deleting file: ${filePath}`);

    const fullPath = path.join(sandboxDir, filePath);
    
    // Delete the file
    await execAsync(`sudo rm -f "${fullPath}"`);

    // Remove from existing files tracking
    if (global.existingFiles) {
      global.existingFiles.delete(filePath);
    }

    console.log(`[vps-sandbox] File deleted successfully: ${filePath}`);

    return NextResponse.json({
      success: true,
      filePath,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error(`[vps-sandbox] Error deleting file ${filePath}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}

async function listFiles(sandboxDir: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Listing files in: ${sandboxDir}`);

    // List all files recursively, excluding node_modules and other common excludes
    const { stdout } = await execAsync(
      `find "${sandboxDir}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" -printf "%P\\n" | sort`
    );

    const files = stdout.trim().split('\n').filter(file => file.length > 0);

    console.log(`[vps-sandbox] Found ${files.length} files`);

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
      directory: sandboxDir
    });

  } catch (error) {
    console.error(`[vps-sandbox] Error listing files:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list files' },
      { status: 500 }
    );
  }
}

async function installPackages(sandboxDir: string, packages: string[]): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Installing packages: ${packages.join(', ')}`);

    if (!packages || packages.length === 0) {
      return NextResponse.json({ error: 'No packages specified' }, { status: 400 });
    }

    // Install packages using npm
    const packageList = packages.join(' ');
    const { stdout, stderr } = await execAsync(
      `cd "${sandboxDir}" && sudo -u ${VPS_CONFIG.user} npm install ${packageList}`,
      { timeout: 300000 } // 5 minute timeout for package installation
    );

    console.log(`[vps-sandbox] Packages installed successfully: ${packages.join(', ')}`);

    // Restart the development server to pick up new packages
    if (global.activeSandbox && global.activeSandbox.pid) {
      try {
        console.log(`[vps-sandbox] Restarting dev server after package installation...`);
        
        // Kill current process
        await execAsync(`sudo kill -9 ${global.activeSandbox.pid}`);
        
        // Start new process
        const { stdout: pidOutput } = await execAsync(
          `cd "${sandboxDir}" && sudo -u ${VPS_CONFIG.user} npm run dev -- --port ${global.activeSandbox.port} &> /dev/null & echo $!`
        );
        
        const newPid = parseInt(pidOutput.trim());
        if (!isNaN(newPid)) {
          global.activeSandbox.pid = newPid;
          console.log(`[vps-sandbox] Dev server restarted with new PID: ${newPid}`);
        }
      } catch (error) {
        console.warn(`[vps-sandbox] Failed to restart dev server:`, error);
        // Don't fail the package installation for this
      }
    }

    return NextResponse.json({
      success: true,
      packages,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      message: 'Packages installed successfully'
    });

  } catch (error: any) {
    console.error(`[vps-sandbox] Error installing packages:`, error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      packages,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      message: 'Failed to install packages'
    });
  }
}

// GET endpoint for status checks
export async function GET(request: NextRequest) {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({
        active: false,
        message: 'No active sandbox'
      });
    }

    const sandbox = global.activeSandbox;
    
    // Check if the process is still running
    let isRunning = false;
    if (sandbox.pid) {
      try {
        await execAsync(`sudo kill -0 ${sandbox.pid}`);
        isRunning = true;
      } catch (error) {
        isRunning = false;
      }
    }

    return NextResponse.json({
      active: true,
      sandboxId: sandbox.sandboxId,
      port: sandbox.port,
      url: sandbox.url,
      directory: sandbox.directory,
      pid: sandbox.pid,
      running: isRunning,
      status: sandbox.status
    });

  } catch (error) {
    console.error('[vps-sandbox/execute] Error checking status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}