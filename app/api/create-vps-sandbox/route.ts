import { NextRequest, NextResponse } from 'next/server';

// Use VPS sandbox management
export async function POST(request: NextRequest) {
  try {
    console.log('[create-vps-sandbox] Creating VPS sandbox...');

    // Get user information from request
    const { userName } = await request.json();

    // Call the VPS sandbox management endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vps-sandbox/manage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        action: 'create',
        userName: userName || 'user' // Default to 'user' if no userName provided
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create VPS sandbox');
    }

    const data = await response.json();

    console.log('[create-vps-sandbox] VPS sandbox created successfully:', data.sandboxId);

    // Return in the same format as the old e2b endpoint for compatibility
    return NextResponse.json({
      success: true,
      sandboxId: data.sandboxId,
      url: data.url,
      subdomain: data.subdomain,
      userName: data.userName,
      port: data.port,
      directory: data.directory,
      message: 'VPS sandbox created and React app initialized',
      structure: `VPS Sandbox Structure for ${data.userName}:
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
