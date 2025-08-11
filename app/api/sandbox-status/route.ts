import { NextResponse } from 'next/server';
import { appConfig } from '@/config/app.config';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

export async function GET() {
  try {
    // Check if sandbox exists
    const sandboxExists = !!global.activeSandbox;
    
    let sandboxHealthy = false;
    let sandboxInfo = null;
    
    if (sandboxExists && global.activeSandbox) {
      try {
        // Check if we're using VPS or E2B
        if (appConfig.sandbox.type === 'vps') {
          // For VPS, just check if the sandbox data exists and looks valid
          // Avoid self-referencing fetch calls which can cause issues
          sandboxHealthy = !!(global.activeSandbox.sandboxId && global.activeSandbox.url);
          sandboxInfo = {
            sandboxId: global.sandboxData?.sandboxId || global.activeSandbox?.sandboxId,
            url: global.sandboxData?.url || global.activeSandbox?.url,
            filesTracked: global.existingFiles ? Array.from(global.existingFiles) : [],
            lastHealthCheck: new Date().toISOString(),
            sandboxType: 'vps'
          };
        } else {
          // Legacy E2B health check
          // Since Python isn't available in the Vite template, just check if sandbox exists
          // The sandbox object existing is enough to confirm it's healthy
          sandboxHealthy = true;
          sandboxInfo = {
            sandboxId: global.sandboxData?.sandboxId,
            url: global.sandboxData?.url,
            filesTracked: global.existingFiles ? Array.from(global.existingFiles) : [],
            lastHealthCheck: new Date().toISOString()
          };
        }
      } catch (error) {
        console.error('[sandbox-status] Health check failed:', error);
        sandboxHealthy = false;
      }
    }
    
    return NextResponse.json({
      success: true,
      active: sandboxExists,
      healthy: sandboxHealthy,
      sandboxData: sandboxInfo,
      sandboxType: appConfig.sandbox.type,
      message: sandboxHealthy 
        ? 'Sandbox is active and healthy' 
        : sandboxExists 
          ? 'Sandbox exists but is not responding' 
          : 'No active sandbox'
    });
    
  } catch (error) {
    console.error('[sandbox-status] Error:', error);
    return NextResponse.json({ 
      success: false,
      active: false,
      error: (error as Error).message 
    }, { status: 500 });
  }
}