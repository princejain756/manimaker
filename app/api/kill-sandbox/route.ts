import { NextResponse } from 'next/server';
import { appConfig } from '@/config/app.config';
import { killSandboxVPS } from '@/lib/vps-utils';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function POST() {
  try {
    console.log('[kill-sandbox] Killing active sandbox...');
    
    let sandboxKilled = false;
    
    // Check if we're using VPS or E2B
    if (appConfig.sandbox.type === 'vps' && global.activeSandbox) {
      // Use VPS utilities directly
      const result = await killSandboxVPS(global.activeSandbox.sandboxId);
      
      if (result.success) {
        sandboxKilled = result.killed;
        console.log('[kill-sandbox] VPS sandbox killed successfully');
      } else {
        console.warn('[kill-sandbox] Failed to kill VPS sandbox:', result.error);
      }
    } else if (global.activeSandbox) {
      // Legacy E2B code
      try {
        await global.activeSandbox.close();
        sandboxKilled = true;
        console.log('[kill-sandbox] E2B sandbox closed successfully');
      } catch (e) {
        console.error('[kill-sandbox] Failed to close E2B sandbox:', e);
      }
    }
    
    // Clean up global state regardless of sandbox type
    global.activeSandbox = null;
    global.sandboxData = null;
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    }
    
    return NextResponse.json({
      success: true,
      sandboxKilled,
      message: 'Sandbox cleaned up successfully'
    });
    
  } catch (error) {
    console.error('[kill-sandbox] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}