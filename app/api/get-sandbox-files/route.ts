import { NextResponse } from 'next/server';
import { parseJavaScriptFile, buildComponentTree } from '@/lib/file-parser';
import { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest';
import type { SandboxState } from '@/types/sandbox';

declare global {
  var activeSandbox: any;
}

export async function GET() {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 404 });
    }

    console.log('[get-sandbox-files] Fetching and analyzing file structure...');
    
    // Check if this is a VPS sandbox (has directory property)
    const isVpsSandbox = global.activeSandbox.directory && !global.activeSandbox.runCode;
    
    let parsedResult: any;
    
    if (isVpsSandbox) {
      // VPS Sandbox - use direct file system operations
      console.log('[get-sandbox-files] Using VPS sandbox file operations...');
      
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        const sandboxDir = global.activeSandbox.directory;
        
        // Get file list from VPS filesystem directly
        const { stdout: fileList } = await execAsync(`find ${sandboxDir} -type f -name "*.jsx" -o -name "*.js" -o -name "*.tsx" -o -name "*.ts" -o -name "*.css" -o -name "*.json" -o -name "*.html" | grep -v node_modules | grep -v .git | head -50`);
        
        const allFiles = fileList.trim().split('\n').filter(f => f.length > 0);
        
        console.log(`[get-sandbox-files] Found ${allFiles.length} relevant files`);
        
        // Read content of each relevant file
        const files: Record<string, string> = {};
        
        for (const filePath of allFiles) {
          try {
            const { stdout: content } = await execAsync(`cat "${filePath}" 2>/dev/null || echo ""`);
            // Only include files under 10KB to avoid huge responses
            if (content && content.length < 10000) {
              // Make relative path from sandbox directory
              const relativePath = filePath.replace(sandboxDir + '/', '');
              files[relativePath] = content;
            }
          } catch (error) {
            console.warn(`[get-sandbox-files] Failed to read file ${filePath}:`, error);
          }
        }
        
        // Build directory structure
        let structure = '';
        try {
          const { stdout: treeOutput } = await execAsync(`cd ${sandboxDir} && find . -type d -not -path "./node_modules*" -not -path "./.git*" | head -20 | sort`);
          const dirs = treeOutput.trim().split('\n');
          
          const { stdout: fileOutput } = await execAsync(`cd ${sandboxDir} && find . -type f -not -path "./node_modules*" -not -path "./.git*" | head -30 | sort`);
          const allFilesList = fileOutput.trim().split('\n');
          
          const structureLines = [];
          structureLines.push('VPS Sandbox Structure:');
          
          // Add directories
          dirs.forEach(dir => {
            if (dir !== '.') {
              const level = (dir.match(/\//g) || []).length - 1;
              const indent = '  '.repeat(level);
              const dirName = dir.split('/').pop();
              structureLines.push(`${indent}📁 ${dirName}/`);
            }
          });
          
          // Add files in root
          allFilesList.forEach(file => {
            if (file.includes('/')) {
              const parts = file.split('/');
              if (parts.length === 2) { // Root level files
                structureLines.push(`  📄 ${parts[1]}`);
              }
            } else if (file !== '.') {
              structureLines.push(`  📄 ${file}`);
            }
          });
          
          structure = structureLines.slice(0, 30).join('\n');
          
        } catch (error) {
          structure = 'Error reading directory structure';
        }
        
        parsedResult = {
          files,
          structure
        };
        
        console.log(`[get-sandbox-files] VPS sandbox: processed ${Object.keys(files).length} files`);
        
      } catch (error) {
        console.error('[get-sandbox-files] VPS sandbox error:', error);
        throw error;
      }
    } else {
      // E2B Sandbox - use Python code execution
      console.log('[get-sandbox-files] Using E2B sandbox Python operations...');
      
      const result = await global.activeSandbox.runCode(`
import os
import json

def get_files_content(directory='/home/user/app', extensions=['.jsx', '.js', '.tsx', '.ts', '.css', '.json']):
    files_content = {}
    
    for root, dirs, files in os.walk(directory):
        # Skip node_modules and other unwanted directories
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'dist', 'build']]
        
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, '/home/user/app')
                
                try:
                    with open(file_path, 'r') as f:
                        content = f.read()
                        # Only include files under 10KB to avoid huge responses
                        if len(content) < 10000:
                            files_content[relative_path] = content
                except:
                    pass
    
    return files_content

# Get the files
files = get_files_content()

# Also get the directory structure
structure = []
for root, dirs, files in os.walk('/home/user/app'):
    level = root.replace('/home/user/app', '').count(os.sep)
    indent = ' ' * 2 * level
    structure.append(f"{indent}{os.path.basename(root)}/")
    sub_indent = ' ' * 2 * (level + 1)
    for file in files:
        if not any(skip in root for skip in ['node_modules', '.git', 'dist', 'build']):
            structure.append(f"{sub_indent}{file}")

result = {
    'files': files,
    'structure': '\\n'.join(structure[:50])  # Limit structure to 50 lines
}

print(json.dumps(result))
      `);

      const output = result.logs.stdout.join('');
      parsedResult = JSON.parse(output);
    }
    
    // Build enhanced file manifest
    const fileManifest: FileManifest = {
      files: {},
      routes: [],
      componentTree: {},
      entryPoint: '',
      styleFiles: [],
      timestamp: Date.now(),
    };
    
    // Process each file
    for (const [relativePath, content] of Object.entries(parsedResult.files)) {
      const fullPath = `/home/user/app/${relativePath}`;
      
      // Create base file info
      const fileInfo: FileInfo = {
        content: content as string,
        type: 'utility',
        path: fullPath,
        relativePath,
        lastModified: Date.now(),
      };
      
      // Parse JavaScript/JSX files
      if (relativePath.match(/\.(jsx?|tsx?)$/)) {
        const parseResult = parseJavaScriptFile(content as string, fullPath);
        Object.assign(fileInfo, parseResult);
        
        // Identify entry point
        if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
          fileManifest.entryPoint = fullPath;
        }
        
        // Identify App.jsx
        if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
          fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
        }
      }
      
      // Track style files
      if (relativePath.endsWith('.css')) {
        fileManifest.styleFiles.push(fullPath);
        fileInfo.type = 'style';
      }
      
      fileManifest.files[fullPath] = fileInfo;
    }
    
    // Build component tree
    fileManifest.componentTree = buildComponentTree(fileManifest.files);
    
    // Extract routes (simplified - looks for Route components or page pattern)
    fileManifest.routes = extractRoutes(fileManifest.files);
    
    // Update global file cache with manifest
    if (global.sandboxState?.fileCache) {
      global.sandboxState.fileCache.manifest = fileManifest;
    }

    return NextResponse.json({
      success: true,
      files: parsedResult.files,
      structure: parsedResult.structure,
      fileCount: Object.keys(parsedResult.files).length,
      manifest: fileManifest,
    });

  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Look for React Router usage
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      // Extract route definitions (simplified)
      const routeMatches = fileInfo.content.matchAll(/path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g);
      
      for (const match of routeMatches) {
        const [, routePath, componentRef] = match;
        routes.push({
          path: routePath,
          component: path,
        });
      }
    }
    
    // Check for Next.js style pages
    if (fileInfo.relativePath.startsWith('pages/') || fileInfo.relativePath.startsWith('src/pages/')) {
      const routePath = '/' + fileInfo.relativePath
        .replace(/^(src\/)?pages\//, '')
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/index$/, '');
        
      routes.push({
        path: routePath,
        component: path,
      });
    }
  }
  
  return routes;
}