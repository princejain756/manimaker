import { NextRequest, NextResponse } from 'next/server';
import { appConfig } from '@/config/app.config';
import { installPackagesVPS } from '@/lib/vps-utils';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
}

export async function POST(request: NextRequest) {
  try {
    const { packages, sandboxId } = await request.json();
    
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Packages array is required' 
      }, { status: 400 });
    }
    
    // Validate and deduplicate package names
    const validPackages = [...new Set(packages)]
      .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '')
      .map(pkg => pkg.trim());
    
    if (validPackages.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid package names provided'
      }, { status: 400 });
    }
    
    // Log if duplicates were found
    if (packages.length !== validPackages.length) {
      console.log(`[install-packages] Cleaned packages: removed ${packages.length - validPackages.length} invalid/duplicate entries`);
      console.log(`[install-packages] Original:`, packages);
      console.log(`[install-packages] Cleaned:`, validPackages);
    }
    
    // Check if we have an active sandbox
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox available' 
      }, { status: 400 });
    }
    
    console.log('[install-packages] Installing packages via VPS:', validPackages);
    
    // Check if we're using VPS or E2B
    if (appConfig.sandbox.type === 'vps') {
      // Use direct VPS utilities instead of fetch
      const vpsResult = await installPackagesVPS(global.activeSandbox.directory, validPackages);
      
      if (!vpsResult.success) {
        return NextResponse.json({
          success: false,
          error: vpsResult.error || 'Failed to install packages'
        }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        installed: validPackages,
        message: vpsResult.message,
        stdout: vpsResult.stdout || '',
        stderr: vpsResult.stderr || ''
      });
    }
    
    // Legacy E2B code follows...
    // If we reach here, we're still using E2B (fallback)
    console.log('[install-packages] Using legacy E2B sandbox');
    
    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    
    // Start installation in background (E2B legacy code)
    (async (sandboxInstance) => {
      try {
        await sendProgress({ 
          type: 'start', 
          message: `Installing ${validPackages.length} package${validPackages.length > 1 ? 's' : ''}...`,
          packages: validPackages 
        });
        
        // Kill any existing Vite process first
        await sendProgress({ type: 'status', message: 'Stopping development server...' });
        
        await sandboxInstance.runCode(`
import subprocess
import os
import signal

# Try to kill any existing Vite process
try:
    with open('/tmp/vite-process.pid', 'r') as f:
        pid = int(f.read().strip())
        os.kill(pid, signal.SIGTERM)
        print("Stopped existing Vite process")
except:
    print("No existing Vite process found")
        `);
        
        // Install packages
        const packageList = validPackages.join(' ');
        await sendProgress({ 
          type: 'info', 
          message: `Installing packages: ${packageList}`
        });
        
        const installResult = await sandboxInstance.runCode(`
import subprocess
import os

os.chdir('/home/user/app')

# Run npm install with output capture
packages_to_install = ${JSON.stringify(validPackages)}
cmd_args = ['npm', 'install', '--legacy-peer-deps'] + packages_to_install

print(f"Running command: {' '.join(cmd_args)}")

process = subprocess.Popen(
    cmd_args,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

# Stream output
while True:
    output = process.stdout.readline()
    if output == '' and process.poll() is not None:
        break
    if output:
        print(output.strip())

# Get the return code
rc = process.poll()

# Capture any stderr
stderr = process.stderr.read()
if stderr:
    print("STDERR:", stderr)

print(f"\\nInstallation completed with code: {rc}")
        `, { timeout: 60000 });
        
        await sendProgress({ 
          type: 'success', 
          message: `Successfully installed: ${validPackages.join(', ')}`,
          installedPackages: validPackages 
        });
        
        // Restart Vite dev server
        await sendProgress({ type: 'status', message: 'Restarting development server...' });
        
        await sandboxInstance.runCode(`
import subprocess
import os
import time

os.chdir('/home/user/app')

# Kill any existing Vite processes
subprocess.run(['pkill', '-f', 'vite'], capture_output=True)
time.sleep(1)

# Start Vite dev server
env = os.environ.copy()
env['FORCE_COLOR'] = '0'

process = subprocess.Popen(
    ['npm', 'run', 'dev'],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env
)

print(f'✓ Vite dev server restarted with PID: {process.pid}')

# Store process info for later
with open('/tmp/vite-process.pid', 'w') as f:
    f.write(str(process.pid))

# Wait a bit for Vite to start up
time.sleep(3)

print("Vite restarted and should now recognize all packages")
        `);
        
        await sendProgress({ 
          type: 'complete', 
          message: 'Package installation complete and dev server restarted!',
          installedPackages: validPackages 
        });
        
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage && errorMessage !== 'undefined') {
          await sendProgress({ 
            type: 'error', 
            message: errorMessage
          });
        }
      } finally {
        await writer.close();
      }
    })(global.activeSandbox);
    
    // Return the stream for E2B
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('[install-packages] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}