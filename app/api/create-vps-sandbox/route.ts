import { NextRequest, NextResponse } from 'next/server';

// Import the VPS management functions directly to avoid self-referencing fetch
async function createSandboxDirect(userName?: string) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const path = await import('path');
  
  const execAsync = promisify(exec);

  // VPS Configuration
  const VPS_CONFIG = {
    baseDir: '/var/www/manimaker',
    sandboxDir: '/var/www/manimaker/sandboxes',
    nginxConfig: '/etc/nginx/sites-enabled/manimaker',
    domain: 'ai.maninfini.com',
    serverIP: '162.55.177.212',
    defaultPort: 3000,
    user: 'ubuntu',
    group: 'ubuntu'
  };

  // Helper functions
  async function killExistingSandbox() {
    if (global.activeSandbox) {
      const sandbox = global.activeSandbox;
      if (sandbox.pid) {
        try {
          await execAsync(`kill -9 ${sandbox.pid}`);
        } catch (error) {
          // Ignore if process was already dead
        }
      }
      await removeNginxConfig(sandbox.userName || sandbox.sandboxId);
    }
    global.activeSandbox = null;
    global.sandboxData = null;
  }

  async function findAvailablePort() {
    const startPort = VPS_CONFIG.defaultPort;
    
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        await execAsync(`netstat -tlnp | grep :${port}`);
        // Port is in use, try next one
      } catch (error) {
        // Port is available
        return port;
      }
    }
    
    throw new Error('No available ports found');
  }

  async function writeFile(filePath: string, content: string) {
    await execAsync(`tee ${filePath} > /dev/null << 'EOF'
${content}
EOF`);
  }

  async function setupReactViteApp(sandboxDir: string) {
    console.log('[vps-sandbox] Setting up React Vite app...');

    // Create directory structure
    await execAsync(`mkdir -p "${sandboxDir}/src"`);

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

    // Write other config files...
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

    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

    await writeFile(`${sandboxDir}/postcss.config.js`, postcssConfig);

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
    await execAsync(`chown -R ${VPS_CONFIG.user}:${VPS_CONFIG.group} "${sandboxDir}"`);
  }

  async function startDevServer(sandboxDir: string, port: number) {
    console.log(`[vps-sandbox] Starting dev server on port ${port}...`);

    // Start Vite in background and capture PID
    const { stdout } = await execAsync(`cd "${sandboxDir}" && npm run dev -- --port ${port} &> /dev/null & echo $!`);
    const pid = parseInt(stdout.trim());

    if (isNaN(pid)) {
      throw new Error('Failed to start development server');
    }

    console.log(`[vps-sandbox] Dev server started with PID: ${pid}`);
    return { pid };
  }

  async function updateNginxConfig(userName: string, port: number, subdomain?: string) {
    console.log(`[vps-sandbox] Updating Nginx config for ${userName}...`);

    if (subdomain) {
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

      const configPath = `/etc/nginx/sites-available/${userName}.conf`;
      await execAsync(`sudo tee ${configPath} > /dev/null << 'EOF'
${subdomainConfig}
EOF`);

      await execAsync(`sudo ln -sf ${configPath} /etc/nginx/sites-enabled/${userName}.conf`);
    }

    // Test and reload Nginx
    await execAsync('sudo nginx -t');
    await execAsync('sudo systemctl reload nginx');
  }

  async function removeNginxConfig(userName: string) {
    try {
      const configPath = `/etc/nginx/sites-enabled/${userName}.conf`;
      await execAsync(`sudo rm -f ${configPath}`);
      await execAsync(`sudo rm -f /etc/nginx/sites-available/${userName}.conf`);
      await execAsync('sudo nginx -t');
      await execAsync('sudo systemctl reload nginx');
    } catch (error) {
      console.error(`Error removing nginx config:`, error);
    }
  }

  async function waitForServer(port: number, maxAttempts: number = 30) {
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

  // Main creation logic
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
    const sandboxDir = `${VPS_CONFIG.sandboxDir}/${uniqueUserName}`;
    
    console.log(`[vps-sandbox] Creating sandbox: ${sandboxId} for user: ${uniqueUserName} on port ${port}`);

    // Create sandbox directory
    await execAsync(`mkdir -p "${sandboxDir}"`);
    await execAsync(`chown ${VPS_CONFIG.user}:${VPS_CONFIG.group} "${sandboxDir}"`);

    // Set up React Vite app
    await setupReactViteApp(sandboxDir);

    // Install dependencies
    console.log(`[vps-sandbox] Installing dependencies...`);
    await execAsync(`cd "${sandboxDir}" && npm install`);

    // Start the development server
    const { pid } = await startDevServer(sandboxDir, port);

    // Update Nginx configuration for subdomain
    await updateNginxConfig(uniqueUserName, port, subdomain);

    // Wait for server to be ready
    await waitForServer(port);

    const sandboxData = {
      sandboxId,
      port,
      directory: sandboxDir,
      url: `https://${subdomain}`, // Primary URL with subdomain
      fallbackUrl: `http://${VPS_CONFIG.serverIP}:${port}`, // Fallback IP:port for testing
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

    // Initialize sandbox state for file caching
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId: sandboxId
      },
      sandbox: sandboxData,
      sandboxData: sandboxData
    };

    console.log(`[vps-sandbox] Sandbox created successfully: ${sandboxData.url}`);
    return sandboxData;
    
  } catch (error) {
    console.error('[vps-sandbox] Error in createSandboxDirect:', error);
    throw error;
  }
}

// Use VPS sandbox management
export async function POST(request: NextRequest) {
  try {
    console.log('[create-vps-sandbox] Creating VPS sandbox...');

    // Get user information from request
    const { userName } = await request.json();

    // Call the VPS sandbox creation directly instead of making a fetch request
    const data = await createSandboxDirect(userName || 'user');

    console.log('[create-vps-sandbox] VPS sandbox created successfully:', data.sandboxId);

    // Return in the same format as the old e2b endpoint for compatibility
    return NextResponse.json({
      success: true,
      sandboxId: data.sandboxId,
      url: data.url,
      fallbackUrl: data.fallbackUrl, // Include fallback URL
      subdomain: data.subdomain,
      userName: data.userName,
      port: data.port,
      directory: data.directory,
      message: 'VPS sandbox created and React app initialized',
      structure: `VPS Sandbox Structure for ${data.userName}:
├── Primary URL: ${data.url}
├── Fallback URL: ${data.fallbackUrl}
├── Subdomain: ${data.subdomain}
├── src/
│   ├── App.jsx (React component)
│   ├── main.jsx (Entry point)
│   └── index.css (Tailwind CSS)
├── index.html (HTML template)
├── package.json (Dependencies)
├── vite.config.js (Vite configuration)
├── tailwind.config.js (Tailwind configuration)
└── postcss.config.js (PostCSS configuration)`
    });

  } catch (error) {
    console.error('[create-vps-sandbox] Error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create VPS sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
