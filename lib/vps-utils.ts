// VPS utility functions to avoid self-referencing fetch calls
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const VPS_CONFIG = {
  baseDir: '/var/www/manimaker',
  sandboxDir: '/var/www/manimaker/sandboxes',
  user: 'www-data',
  group: 'www-data'
};

export async function writeFileVPS(sandboxDir: string, filePath: string, content: string) {
  console.log(`[vps-utils] Writing file: ${filePath}`);

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

  return { success: true, filePath, message: 'File written successfully' };
}

export async function runCommandVPS(sandboxDir: string, command: string, cwd?: string) {
  console.log(`[vps-utils] Running command: ${command}`);

  const workingDir = cwd ? path.join(sandboxDir, cwd) : sandboxDir;
  
  try {
    const { stdout, stderr } = await execAsync(
      `cd "${workingDir}" && sudo -u ${VPS_CONFIG.user} ${command}`,
      { timeout: 60000 }
    );

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
      cwd: workingDir
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      command,
      cwd: workingDir
    };
  }
}

export async function readFileVPS(sandboxDir: string, filePath: string) {
  console.log(`[vps-utils] Reading file: ${filePath}`);

  const fullPath = path.join(sandboxDir, filePath);
  
  try {
    await execAsync(`sudo test -f "${fullPath}"`);
  } catch (error) {
    throw new Error('File not found');
  }

  const { stdout: content } = await execAsync(`sudo cat "${fullPath}"`);

  return {
    success: true,
    filePath,
    content: content,
    size: content.length
  };
}

export async function installPackagesVPS(sandboxDir: string, packages: string[]) {
  console.log(`[vps-utils] Installing packages: ${packages.join(', ')}`);

  if (!packages || packages.length === 0) {
    throw new Error('No packages specified');
  }

  const packageList = packages.join(' ');
  
  try {
    const { stdout, stderr } = await execAsync(
      `cd "${sandboxDir}" && sudo -u ${VPS_CONFIG.user} npm install ${packageList}`,
      { timeout: 300000 }
    );

    // Restart the development server to pick up new packages
    if (global.activeSandbox && global.activeSandbox.pid) {
      try {
        console.log(`[vps-utils] Restarting dev server after package installation...`);
        
        // Kill current process
        await execAsync(`sudo kill -9 ${global.activeSandbox.pid}`);
        
        // Start new process
        const { stdout: pidOutput } = await execAsync(
          `cd "${sandboxDir}" && sudo -u ${VPS_CONFIG.user} npm run dev -- --port ${global.activeSandbox.port} &> /dev/null & echo $!`
        );
        
        const newPid = parseInt(pidOutput.trim());
        if (!isNaN(newPid)) {
          global.activeSandbox.pid = newPid;
          console.log(`[vps-utils] Dev server restarted with new PID: ${newPid}`);
        }
      } catch (error) {
        console.warn(`[vps-utils] Failed to restart dev server:`, error);
      }
    }

    return {
      success: true,
      packages,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      message: 'Packages installed successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      packages,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      message: 'Failed to install packages'
    };
  }
}

export async function restartViteVPS(sandboxDir: string) {
  console.log(`[vps-utils] Restarting Vite dev server...`);

  if (!global.activeSandbox || !global.activeSandbox.pid) {
    throw new Error('No active sandbox or PID found');
  }

  try {
    // Kill current process
    await execAsync(`sudo kill -9 ${global.activeSandbox.pid}`);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start new process
    const { stdout: pidOutput } = await execAsync(
      `cd "${sandboxDir}" && sudo -u ${VPS_CONFIG.user} npm run dev -- --port ${global.activeSandbox.port} &> /dev/null & echo $!`
    );
    
    const newPid = parseInt(pidOutput.trim());
    if (!isNaN(newPid)) {
      global.activeSandbox.pid = newPid;
      console.log(`[vps-utils] Vite restarted with new PID: ${newPid}`);
      
      return {
        success: true,
        pid: newPid,
        message: 'Vite dev server restarted successfully'
      };
    } else {
      throw new Error('Failed to get new process PID');
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      message: 'Failed to restart Vite dev server'
    };
  }
}

export async function detectAndInstallPackagesVPS(sandboxDir: string, files: Record<string, string>) {
  console.log('[vps-utils] Detecting packages from files:', Object.keys(files));

  // Extract all import statements from the files
  const imports = new Set<string>();
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*(?:from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    
    // Skip non-JS/JSX/TS/TSX files
    if (!filePath.match(/\.(jsx?|tsx?)$/)) continue;

    // Find ES6 imports
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    // Find CommonJS requires
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }

  console.log('[vps-utils] Found imports:', Array.from(imports));

  // Common package mappings
  const packageMap: Record<string, string> = {
    'react': 'react',
    'react-dom': 'react-dom',
    'react-router-dom': 'react-router-dom',
    '@heroicons/react': '@heroicons/react',
    'lucide-react': 'lucide-react',
    'framer-motion': 'framer-motion',
    'axios': 'axios',
    'lodash': 'lodash',
    'date-fns': 'date-fns',
    'uuid': 'uuid',
    'clsx': 'clsx',
    'tailwind-merge': 'tailwind-merge'
  };

  // Filter to actual packages (not relative imports)
  const packagesToInstall = Array.from(imports)
    .filter(imp => {
      // Skip relative imports
      if (imp.startsWith('.') || imp.startsWith('/')) return false;
      // Skip built-in Node.js modules
      if (['fs', 'path', 'url', 'crypto', 'os', 'util'].includes(imp)) return false;
      return true;
    })
    .map(imp => {
      // Handle scoped packages and sub-imports
      const parts = imp.split('/');
      if (imp.startsWith('@')) {
        return `${parts[0]}/${parts[1]}`;
      }
      return parts[0];
    })
    .filter((pkg, index, arr) => arr.indexOf(pkg) === index); // Remove duplicates

  console.log('[vps-utils] Packages to install:', packagesToInstall);

  if (packagesToInstall.length === 0) {
    return {
      success: true,
      packagesInstalled: [],
      packagesAlreadyInstalled: [],
      packagesFailed: [],
      message: 'No packages detected for installation'
    };
  }

  // Try to install packages
  try {
    const installResult = await installPackagesVPS(sandboxDir, packagesToInstall);
    
    if (installResult.success) {
      return {
        success: true,
        packagesInstalled: packagesToInstall,
        packagesAlreadyInstalled: [],
        packagesFailed: [],
        message: 'Packages detected and installed successfully'
      };
    } else {
      return {
        success: false,
        packagesInstalled: [],
        packagesAlreadyInstalled: [],
        packagesFailed: packagesToInstall,
        message: 'Package installation failed',
        error: installResult.error
      };
    }
  } catch (error: any) {
    return {
      success: false,
      packagesInstalled: [],
      packagesAlreadyInstalled: [],
      packagesFailed: packagesToInstall,
      message: 'Package detection and installation failed',
      error: error.message
    };
  }
}

export async function killSandboxVPS(sandboxId: string) {
  console.log(`[vps-utils] Killing sandbox: ${sandboxId}`);

  const sandboxDir = path.join(VPS_CONFIG.sandboxDir, sandboxId);

  try {
    // Check if sandbox exists
    await execAsync(`sudo test -d "${sandboxDir}"`);
  } catch (error) {
    return {
      success: true,
      killed: false,
      message: 'Sandbox directory does not exist'
    };
  }

  try {
    // Kill any running processes in the sandbox
    if (global.activeSandbox && global.activeSandbox.pid) {
      try {
        await execAsync(`sudo kill -9 ${global.activeSandbox.pid}`);
        console.log(`[vps-utils] Killed process PID: ${global.activeSandbox.pid}`);
      } catch (error) {
        console.warn(`[vps-utils] Failed to kill PID ${global.activeSandbox.pid}:`, error);
      }
    }

    // Remove the sandbox directory
    await execAsync(`sudo rm -rf "${sandboxDir}"`);
    console.log(`[vps-utils] Removed sandbox directory: ${sandboxDir}`);

    return {
      success: true,
      killed: true,
      message: 'Sandbox killed and cleaned up successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      killed: false,
      error: error.message,
      message: 'Failed to kill sandbox'
    };
  }
}

// Utility functions to replace other self-referencing fetch calls
export async function sanitizePromptVPS(prompt: string) {
  // We can't avoid the AI call here as it's external, but we can import the logic
  // For now, let's just return a simple sanitized version
  console.log(`[vps-utils] Sanitizing prompt (simplified version)`);

  // Basic sanitization
  const cleanText = (text: string): string => {
    return text
      .replace(/[""]/g, '"')  // Replace smart quotes
      .replace(/['']/g, "'")  // Replace smart apostrophes
      .replace(/[^\x00-\x7F]/g, "")  // Remove non-ASCII characters
      .replace(/[{}]/g, "")  // Remove potential CSS injection
      .trim();
  };

  const extractBusinessType = (prompt: string): string => {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('restaurant') || lowerPrompt.includes('cafe') || lowerPrompt.includes('food')) {
      return 'restaurant';
    } else if (lowerPrompt.includes('tech') || lowerPrompt.includes('education') || lowerPrompt.includes('course')) {
      return 'tech education';
    } else if (lowerPrompt.includes('consulting') || lowerPrompt.includes('service')) {
      return 'consulting';
    } else if (lowerPrompt.includes('shop') || lowerPrompt.includes('store') || lowerPrompt.includes('ecommerce')) {
      return 'ecommerce';
    } else if (lowerPrompt.includes('portfolio') || lowerPrompt.includes('personal')) {
      return 'portfolio';
    }
    
    return 'general';
  };

  const fallbackData = {
    businessType: extractBusinessType(prompt),
    businessName: 'Your Business',
    description: cleanText(prompt).substring(0, 200),
    industry: 'general',
    style: 'modern',
    colors: {
      primary: 'blue',
      secondary: 'white'
    },
    sections: ['hero', 'about', 'services', 'contact'],
    features: ['contact form', 'responsive design'],
    tone: 'professional',
    targetAudience: 'customers and clients',
    callToAction: 'Get Started',
    sanitizedPrompt: cleanText(prompt)
  };

  return {
    success: true,
    originalPrompt: prompt,
    sanitizedData: fallbackData,
    sanitizedPrompt: fallbackData.sanitizedPrompt
  };
}

export async function analyzeEditIntentVPS(originalCode: string, editedCode: string, files: Record<string, string>) {
  // Simplified edit intent analysis
  console.log(`[vps-utils] Analyzing edit intent (simplified version)`);

  // Basic diff analysis
  const changes = {
    added: editedCode.length > originalCode.length,
    removed: editedCode.length < originalCode.length,
    modified: editedCode !== originalCode
  };

  return {
    success: true,
    editType: changes.added ? 'addition' : changes.removed ? 'removal' : 'modification',
    confidence: 0.8,
    analysis: {
      summary: 'Code changes detected',
      changes: changes,
      recommendations: []
    }
  };
}

export async function getSandboxFilesVPS(sandboxId: string) {
  console.log(`[vps-utils] Getting sandbox files for: ${sandboxId}`);

  const sandboxDir = path.join(VPS_CONFIG.sandboxDir, sandboxId);

  try {
    // Check if sandbox exists
    await execAsync(`sudo test -d "${sandboxDir}"`);
  } catch (error) {
    throw new Error('Sandbox not found');
  }

  try {
    // Get file list
    const { stdout } = await execAsync(`find "${sandboxDir}" -type f -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.html" -o -name "*.json" | head -100`);
    
    const filePaths = stdout.trim().split('\n').filter(Boolean);
    const files: Record<string, string> = {};
    const fileList: Array<{ name: string; path: string; size: number }> = [];

    for (const fullPath of filePaths) {
      const relativePath = path.relative(sandboxDir, fullPath);
      
      try {
        const content = await readFileVPS(sandboxDir, relativePath);
        files[relativePath] = content.content;
        fileList.push({
          name: path.basename(relativePath),
          path: relativePath,
          size: content.size
        });
      } catch (error) {
        console.warn(`[vps-utils] Failed to read file ${relativePath}:`, error);
      }
    }

    return {
      success: true,
      files,
      fileList,
      sandboxId
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      files: {},
      fileList: [],
      sandboxId
    };
  }
}
