import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { SandboxState } from '@/types/sandbox';
import { appConfig } from '@/config/app.config';

// Store active sandbox globally
declare global {
  var activeSandbox: any;
  var sandboxData: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
  var vpsMode: boolean;
  var vpsFiles: Map<string, any>;
}

const execAsync = promisify(exec);

export async function POST() {
  try {
    console.log('[create-ai-sandbox] Creating VPS sandbox...');
    
    // Generate unique sandbox ID and user
    const sandboxId = `sandbox_${Date.now()}`;
    const userId = `user${Math.floor(Math.random() * 1000)}`;
    const sandboxPath = `/var/www/manimaker/sandboxes/${userId}`;
    
    console.log(`[create-ai-sandbox] Creating sandbox: ${sandboxId} for user: ${userId} on port 3000`);

    try {
      // Ensure base directories exist first
      await execAsync(`mkdir -p "/var/www/manimaker/sandboxes"`);
      
      // Create sandbox directory
      await execAsync(`mkdir -p "${sandboxPath}"`);
      await execAsync(`chown ubuntu:ubuntu "${sandboxPath}"`);
      console.log(`[create-ai-sandbox] Created directory: ${sandboxPath}`);
    } catch (error) {
      console.error('[create-ai-sandbox] Error in createSandboxDirectory:', error);
      throw error;
    }

    try {
      // Set up a basic Vite React app
      console.log('[create-ai-sandbox] Setting up Vite React app...');
      
      // Create directory structure
      await execAsync(`mkdir -p "${sandboxPath}/src"`);
      
      // Create package.json
      const packageJson = {
        "name": "sandbox-app",
        "version": "1.0.0",
        "type": "module",
        "scripts": {
          "dev": "vite --host",
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
      
      await execAsync(`echo '${JSON.stringify(packageJson, null, 2)}' | tee "${sandboxPath}/package.json" > /dev/null`);
      console.log('✓ package.json created');

      // Create vite.config.js
      const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    hmr: false
  }
})`;
      
      await execAsync(`echo '${viteConfig}' | tee "${sandboxPath}/vite.config.js" > /dev/null`);
      console.log('✓ vite.config.js created');

      // Create tailwind.config.js
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
      
      await execAsync(`echo '${tailwindConfig}' | tee "${sandboxPath}/tailwind.config.js" > /dev/null`);
      console.log('✓ tailwind.config.js created');

      // Create postcss.config.js
      const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
      
      await execAsync(`echo '${postcssConfig}' | tee "${sandboxPath}/postcss.config.js" > /dev/null`);
      console.log('✓ postcss.config.js created');

      // Create index.html
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
      
      await execAsync(`echo '${indexHtml}' | tee "${sandboxPath}/index.html" > /dev/null`);
      console.log('✓ index.html created');

      // Create src/main.jsx
      const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;
      
      await execAsync(`echo '${mainJsx}' | tee "${sandboxPath}/src/main.jsx" > /dev/null`);
      console.log('✓ src/main.jsx created');

      // Create src/App.jsx
      const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          VPS Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`;
      
      await execAsync(`echo '${appJsx}' | tee "${sandboxPath}/src/App.jsx" > /dev/null`);
      console.log('✓ src/App.jsx created');

      // Create src/index.css
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
      
      await execAsync(`echo '${indexCss}' | tee "${sandboxPath}/src/index.css" > /dev/null`);
      console.log('✓ src/index.css created');

      // Set proper permissions
      await execAsync(`chown -R ubuntu:ubuntu "${sandboxPath}"`);
      await execAsync(`chmod -R 755 "${sandboxPath}"`);
      
      console.log('[create-ai-sandbox] All files created successfully!');

      // Install dependencies
      console.log('[create-ai-sandbox] Installing dependencies...');
      try {
        await execAsync(`cd "${sandboxPath}" && npm install`, { timeout: 60000 });
        console.log('✓ Dependencies installed successfully');
      } catch (error) {
        console.log('⚠ Warning: npm install had issues, continuing anyway');
      }

      // Start Vite dev server in background
      console.log('[create-ai-sandbox] Starting Vite dev server...');
      try {
        // Kill any existing processes on port 3000
        await execAsync(`pkill -f "vite.*--host" || true`);
        
        // Start Vite dev server
        execAsync(`cd "${sandboxPath}" && npm run dev > /tmp/vite-${userId}.log 2>&1 &`);
        console.log(`✓ Vite dev server started for ${userId}`);
        
        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error('Error starting Vite server:', error);
      }

    } catch (error) {
      console.error('[create-ai-sandbox] Error in setupViteApp:', error);
      throw error;
    }

    // Store sandbox data globally
    const sandboxUrl = `https://maninfini.com/${userId}`;
    
    global.activeSandbox = { sandboxId, userId, sandboxPath };
    global.sandboxData = {
      sandboxId,
      url: sandboxUrl,
      userId,
      sandboxPath
    };
    
    // Clear existing files tracking
    if (global.existingFiles) {
      global.existingFiles.clear();
    } else {
      global.existingFiles = new Set<string>();
    }
    
    // Initialize sandbox state
    global.sandboxState = {
      fileCache: {
        files: {},
        lastSync: Date.now(),
        sandboxId
      },
      sandbox: { sandboxId, userId, sandboxPath },
      sandboxData: {
        sandboxId,
        url: sandboxUrl,
        userId,
        sandboxPath
      } as any
    };
    
    // Track initial files
    global.existingFiles.add('src/App.jsx');
    global.existingFiles.add('src/main.jsx');
    global.existingFiles.add('src/index.css');
    global.existingFiles.add('index.html');
    global.existingFiles.add('package.json');
    global.existingFiles.add('vite.config.js');
    global.existingFiles.add('tailwind.config.js');
    global.existingFiles.add('postcss.config.js');
    
    console.log('[create-ai-sandbox] VPS Sandbox ready at:', sandboxUrl);
    
    return NextResponse.json({
      success: true,
      sandboxId,
      url: sandboxUrl,
      userId,
      sandboxPath,
      message: 'VPS Sandbox created and Vite React app initialized'
    } as any);

  } catch (error) {
    console.error('[create-ai-sandbox] Error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create VPS sandbox',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}