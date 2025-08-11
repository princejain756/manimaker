import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Get active sandbox from global state (in production, use a proper state management solution)
declare global {
  var activeSandbox: any;
}

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();
    
    if (!command) {
      return NextResponse.json({ 
        success: false, 
        error: 'Command is required' 
      }, { status: 400 });
    }
    
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log(`[run-command] Executing: ${command}`);
    
    // Execute command in VPS sandbox directory
    const sandboxDir = global.activeSandbox.directory || '/var/www/manimaker/sandboxes/user';
    const { stdout, stderr } = await execAsync(`cd "${sandboxDir}" && ${command}`, { timeout: 30000 });
    
    let output = '';
    if (stdout) {
      output += `STDOUT:\n${stdout}`;
    }
    if (stderr) {
      output += stdout ? `\n\nSTDERR:\n${stderr}` : `STDERR:\n${stderr}`;
    }
    
    return NextResponse.json({
      success: true,
      output,
      stdout,
      stderr,
      message: 'Command executed successfully'
    });
    
  } catch (error) {
    console.error('[run-command] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}