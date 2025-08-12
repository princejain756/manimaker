import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// VPS Configuration
const VPS_CONFIG = {
  baseDir: '/var/www/manimaker',
  sandboxDir: '/var/www/manimaker/sandboxes',
  nginxConfig: '/etc/nginx/sites-enabled/manimaker',
  domain: 'ai.maninfini.com',
  defaultPort: 3000,
  user: 'ubuntu',
  group: 'ubuntu'
};

// Store active sandbox globally
declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
}

interface SandboxInfo {
  sandboxId: string;
  port: number;
  directory: string;
  url: string;
  subdomain: string;
  userName: string;
  pid?: number;
  status: 'creating' | 'running' | 'stopped' | 'error';
}

export async function POST(request: NextRequest) {
  try {
    const { action, sandboxId, userName } = await request.json();

    switch (action) {
      case 'create':
        return await createSandbox(userName);
      case 'kill':
        return await killSandbox(sandboxId);
      case 'status':
        return await getSandboxStatus(sandboxId);
      case 'restart':
        return await restartSandbox(sandboxId);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[vps-sandbox/manage] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function createSandbox(userName?: string): Promise<NextResponse> {
  try {
    console.log('[vps-sandbox] Creating new sandbox...');
    
    // Kill existing sandbox if any
    if (global.activeSandbox) {
      await killExistingSandbox();
    }

    // Generate unique user identifier and subdomain
    const userIdentifier = userName || 'user';
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 100);
    const uniqueUserName = `${userIdentifier}${randomNum}`;
    const subdomain = `${uniqueUserName}.${VPS_CONFIG.domain}`;

    // Generate unique sandbox ID and port
    const sandboxId = `sandbox_${timestamp}`;
    const port = await findAvailablePort();
    const sandboxDir = path.join(VPS_CONFIG.sandboxDir, uniqueUserName);
    
    console.log(`[vps-sandbox] Creating sandbox: ${sandboxId} for user: ${uniqueUserName} on port ${port}`);
    console.log(`[vps-sandbox] Subdomain: ${subdomain}`);

    // Create sandbox directory
    await execAsync(`sudo mkdir -p ${sandboxDir}`);
    await execAsync(`sudo chown ${VPS_CONFIG.user}:${VPS_CONFIG.group} ${sandboxDir}`);

    // Set up React Vite app
    await setupReactViteApp(sandboxDir);

    // Install dependencies
    await execAsync(`cd ${sandboxDir} && sudo -u ${VPS_CONFIG.user} npm install`);

    // Start the development server
    const { pid } = await startDevServer(sandboxDir, port);

    // Update Nginx configuration for subdomain
    await updateNginxConfig(uniqueUserName, port, subdomain);

    // Wait for server to be ready
    await waitForServer(port);

    const sandboxData: SandboxInfo = {
      sandboxId,
      port,
      directory: sandboxDir,
      url: `https://${subdomain}`,
      subdomain,
      userName: uniqueUserName,
      pid,
      status: 'running'
    };

    // Store sandbox globally
    global.activeSandbox = sandboxData;
    global.sandboxData = sandboxData;
    global.existingFiles = new Set([
      'src/App.jsx',
      'src/main.jsx', 
      'src/index.css',
      'index.html',
      'package.json',
      'vite.config.js',
      'tailwind.config.js',
      'postcss.config.js'
    ]);

    console.log(`[vps-sandbox] Sandbox created successfully: ${sandboxData.url}`);

    return NextResponse.json({
      success: true,
      sandboxId,
      url: sandboxData.url,
      subdomain,
      userName: uniqueUserName,
      port,
      directory: sandboxDir,
      message: 'VPS sandbox created successfully'
    });

  } catch (error) {
    console.error('[vps-sandbox] Error creating sandbox:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 }
    );
  }
}

async function killSandbox(sandboxId?: string): Promise<NextResponse> {
  try {
    console.log(`[vps-sandbox] Killing sandbox: ${sandboxId || 'current'}`);

    let killed = false;

    if (global.activeSandbox) {
      const sandbox = global.activeSandbox as SandboxInfo;
      
      // Kill the development server process
      if (sandbox.pid) {
        try {
          await execAsync(`sudo kill -9 ${sandbox.pid}`);
          killed = true;
          console.log(`[vps-sandbox] Killed process ${sandbox.pid}`);
        } catch (error) {
          console.log(`[vps-sandbox] Process ${sandbox.pid} was already dead`);
        }
      }

      // Kill any remaining processes in the sandbox directory
      try {
        await execAsync(`sudo pkill -f "${sandbox.directory}"`);
      } catch (error) {
        // Ignore if no processes found
      }

      // Remove Nginx configuration
      await removeNginxConfig(sandbox.userName);

      // Optionally remove sandbox directory (comment out if you want to keep files)
      // await execAsync(`sudo rm -rf ${sandbox.directory}`);

      global.activeSandbox = null;
      global.sandboxData = null;
    }

    if (global.existingFiles) {
      global.existingFiles.clear();
    }

    return NextResponse.json({
      success: true,
      killed,
      message: 'Sandbox killed successfully'
    });

  } catch (error) {
    console.error('[vps-sandbox] Error killing sandbox:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to kill sandbox' },
      { status: 500 }
    );
  }
}

async function getSandboxStatus(sandboxId?: string): Promise<NextResponse> {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({
        active: false,
        healthy: false,
        sandboxData: null
      });
    }

    const sandbox = global.activeSandbox as SandboxInfo;
    
    // Check if process is still running
    let isHealthy = false;
    if (sandbox.pid) {
      try {
        await execAsync(`sudo kill -0 ${sandbox.pid}`);
        isHealthy = true;
      } catch (error) {
        isHealthy = false;
      }
    }

    return NextResponse.json({
      active: true,
      healthy: isHealthy,
      sandboxData: sandbox
    });

  } catch (error) {
    console.error('[vps-sandbox] Error checking status:', error);
    return NextResponse.json({
      active: false,
      healthy: false,
      sandboxData: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function restartSandbox(sandboxId?: string): Promise<NextResponse> {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ error: 'No active sandbox' }, { status: 400 });
    }

    const sandbox = global.activeSandbox as SandboxInfo;
    
    // Kill existing process
    if (sandbox.pid) {
      try {
        await execAsync(`sudo kill -9 ${sandbox.pid}`);
      } catch (error) {
        // Ignore if process was already dead
      }
    }

    // Start new process
    const { pid } = await startDevServer(sandbox.directory, sandbox.port);
    sandbox.pid = pid;
    sandbox.status = 'running';

    return NextResponse.json({
      success: true,
      sandboxId: sandbox.sandboxId,
      pid,
      message: 'Sandbox restarted successfully'
    });

  } catch (error) {
    console.error('[vps-sandbox] Error restarting sandbox:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restart sandbox' },
      { status: 500 }
    );
  }
}

// Helper functions

async function killExistingSandbox(): Promise<void> {
  if (global.activeSandbox) {
    const sandbox = global.activeSandbox as SandboxInfo;
    if (sandbox.pid) {
      try {
        await execAsync(`sudo kill -9 ${sandbox.pid}`);
      } catch (error) {
        // Ignore if process was already dead
      }
    }
    await removeNginxConfig(sandbox.userName || sandbox.sandboxId);
  }
  global.activeSandbox = null;
  global.sandboxData = null;
}

async function findAvailablePort(): Promise<number> {
  const startPort = VPS_CONFIG.defaultPort;
  
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      await execAsync(`sudo netstat -tlnp | grep :${port}`);
      // Port is in use, try next one
    } catch (error) {
      // Port is available
      return port;
    }
  }
  
  throw new Error('No available ports found');
}

async function setupReactViteApp(sandboxDir: string): Promise<void> {
  console.log('[vps-sandbox] Setting up React Vite app...');

  // Create directory structure
  await execAsync(`sudo mkdir -p ${sandboxDir}/src`);

  // Write package.json
  const packageJson = {
    "name": "vps-sandbox-app",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
      "dev": "vite --host 0.0.0.0",
      "build": "vite build",
      "preview": "vite preview"
    },
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0"
    },
    "devDependencies": {
      "@vitejs/plugin-react": "^4.0.0",
      "vite": "^4.3.9",
      "tailwindcss": "^3.3.0",
      "postcss": "^8.4.31",
      "autoprefixer": "^10.4.16"
    }
  };

  await writeFile(`${sandboxDir}/package.json`, JSON.stringify(packageJson, null, 2));

  // Write vite.config.js
  const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    hmr: {
      clientPort: 443
    }
  }
})`;

  await writeFile(`${sandboxDir}/vite.config.js`, viteConfig);

  // Write tailwind.config.js
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

  await writeFile(`${sandboxDir}/tailwind.config.js`, tailwindConfig);

  // Write postcss.config.js
  const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

  await writeFile(`${sandboxDir}/postcss.config.js`, postcssConfig);

  // Write index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VPS Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

  await writeFile(`${sandboxDir}/index.html`, indexHtml);

  // Write src/main.jsx
  const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

  await writeFile(`${sandboxDir}/src/main.jsx`, mainJsx);

  // Write src/App.jsx
  const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-blue-400">VPS Sandbox Ready</h1>
        <p className="text-lg text-gray-400">
          Your Ubuntu VPS sandbox is running!<br/>
          Start building your React app with Vite and Tailwind CSS.
        </p>
      </div>
    </div>
  )
}

export default App`;

  await writeFile(`${sandboxDir}/src/App.jsx`, appJsx);

  // Write src/index.css
  const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;

  await writeFile(`${sandboxDir}/src/index.css`, indexCss);

  // Set proper ownership
  await execAsync(`sudo chown -R ${VPS_CONFIG.user}:${VPS_CONFIG.group} ${sandboxDir}`);
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await execAsync(`sudo tee ${filePath} > /dev/null << 'EOF'
${content}
EOF`);
}

async function startDevServer(sandboxDir: string, port: number): Promise<{ pid: number }> {
  console.log(`[vps-sandbox] Starting dev server on port ${port}...`);

  // Start Vite in background and capture PID
  const { stdout } = await execAsync(`cd ${sandboxDir} && sudo -u ${VPS_CONFIG.user} npm run dev -- --port ${port} &> /dev/null & echo $!`);
  const pid = parseInt(stdout.trim());

  if (isNaN(pid)) {
    throw new Error('Failed to start development server');
  }

  console.log(`[vps-sandbox] Dev server started with PID: ${pid}`);
  return { pid };
}

async function updateNginxConfig(userName: string, port: number, subdomain?: string): Promise<void> {
  console.log(`[vps-sandbox] Updating Nginx config for ${userName}...`);

  if (subdomain) {
    // Create a new server block for the subdomain
    const subdomainConfig = `
# Server block for user subdomain: ${subdomain}
server {
    listen 80;
    listen [::]:80;
    server_name ${subdomain};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${subdomain};

    # Use wildcard SSL certificate for *.maninfini.com
    ssl_certificate /etc/letsencrypt/live/maninfini.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/maninfini.com/privkey.pem;
    
    # SSL Security headers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; connect-src 'self' ws: wss:;" always;

    # Proxy to user's sandbox
    location / {
        proxy_pass http://localhost:${port}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle HMR WebSocket connections
        proxy_set_header Origin http://localhost:${port};
        proxy_buffering off;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}
`;

    // Write subdomain config to a separate file
    const configPath = `/etc/nginx/sites-available/${userName}.conf`;
    await execAsync(`sudo tee ${configPath} > /dev/null << 'EOF'
${subdomainConfig}
EOF`);

    // Enable the site
    await execAsync(`sudo ln -sf ${configPath} /etc/nginx/sites-enabled/${userName}.conf`);

  } else {
    // Fallback: Add location block to main config (legacy behavior)
    const { stdout: currentConfig } = await execAsync(`sudo cat ${VPS_CONFIG.nginxConfig}`);

    const locationBlock = `
    location /${userName}/ {
        proxy_pass http://localhost:${port}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle HMR WebSocket connections
        proxy_set_header Origin http://localhost:${port};
        proxy_buffering off;
    }`;

    const updatedConfig = currentConfig.replace(/}(\s*)$/, `${locationBlock}\n}$1`);

    await execAsync(`sudo tee ${VPS_CONFIG.nginxConfig} > /dev/null << 'EOF'
${updatedConfig}
EOF`);
  }

  // Test and reload Nginx
  await execAsync('sudo nginx -t');
  await execAsync('sudo systemctl reload nginx');

  console.log(`[vps-sandbox] Nginx config updated and reloaded for ${userName}`);
}

async function removeNginxConfig(userName: string): Promise<void> {
  try {
    console.log(`[vps-sandbox] Removing Nginx config for ${userName}...`);

    // Remove subdomain config file
    const configPath = `/etc/nginx/sites-enabled/${userName}.conf`;
    try {
      await execAsync(`sudo rm -f ${configPath}`);
      await execAsync(`sudo rm -f /etc/nginx/sites-available/${userName}.conf`);
      console.log(`[vps-sandbox] Removed subdomain config: ${configPath}`);
    } catch (error) {
      console.warn(`[vps-sandbox] Failed to remove subdomain config: ${error}`);
    }

    // Also clean up any location blocks in main config (legacy cleanup)
    try {
      const { stdout: currentConfig } = await execAsync(`sudo cat ${VPS_CONFIG.nginxConfig}`);

      // Remove the location block for this user
      const locationRegex = new RegExp(`\\s*location /${userName}/\\s*{[^}]*}\\s*`, 'g');
      const updatedConfig = currentConfig.replace(locationRegex, '');

      // Write updated config only if it changed
      if (updatedConfig !== currentConfig) {
        await execAsync(`sudo tee ${VPS_CONFIG.nginxConfig} > /dev/null << 'EOF'
${updatedConfig}
EOF`);
        console.log(`[vps-sandbox] Cleaned up location block for ${userName}`);
      }
    } catch (error) {
      console.warn(`[vps-sandbox] Failed to clean up location block: ${error}`);
    }

    // Test and reload Nginx
    await execAsync('sudo nginx -t');
    await execAsync('sudo systemctl reload nginx');

    console.log(`[vps-sandbox] Nginx config cleaned up for ${userName}`);
  } catch (error) {
    console.error(`[vps-sandbox] Error removing Nginx config:`, error);
    // Don't throw - this is cleanup
  }
}

async function waitForServer(port: number, maxAttempts: number = 30): Promise<void> {
  console.log(`[vps-sandbox] Waiting for server on port ${port}...`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await execAsync(`curl -f http://localhost:${port} > /dev/null 2>&1`);
      console.log(`[vps-sandbox] Server is ready on port ${port}`);
      return;
    } catch (error) {
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(`Server on port ${port} did not become ready within ${maxAttempts} seconds`);
}