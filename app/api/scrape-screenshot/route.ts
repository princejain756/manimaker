import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url, fallbackUrl } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Try primary URL first, then fallback URL if provided
    const urlsToTry = [url];
    if (fallbackUrl) {
      urlsToTry.push(fallbackUrl);
    }

    let lastError = null;
    
    for (const tryUrl of urlsToTry) {
      try {
        console.log(`Attempting screenshot for: ${tryUrl}`);
        
        // Use Firecrawl API to capture screenshot
        const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: tryUrl,
            formats: ['screenshot'], // Regular viewport screenshot, not full page
            waitFor: 3000, // Wait for page to fully load
            timeout: 30000,
            blockAds: true,
            actions: [
              {
                type: 'wait',
                milliseconds: 2000 // Additional wait for dynamic content
              }
            ]
          })
        });

        if (!firecrawlResponse.ok) {
          const error = await firecrawlResponse.text();
          throw new Error(`Firecrawl API error: ${error}`);
        }

        const data = await firecrawlResponse.json();
        
        if (!data.success || !data.data?.screenshot) {
          throw new Error('Failed to capture screenshot');
        }

        return NextResponse.json({
          success: true,
          screenshot: data.data.screenshot,
          metadata: data.data.metadata,
          usedUrl: tryUrl // Include which URL worked
        });

      } catch (error: any) {
        console.error(`Screenshot failed for ${tryUrl}:`, error);
        lastError = error;
        continue; // Try next URL
      }
    }

    // If all URLs failed, return the last error
    throw lastError || new Error('All screenshot attempts failed');

  } catch (error: any) {
    console.error('Screenshot capture error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to capture screenshot' 
    }, { status: 500 });
  }
}