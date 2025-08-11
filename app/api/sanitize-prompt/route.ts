import { NextRequest, NextResponse } from 'next/server';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Prompt is required' 
      }, { status: 400 });
    }

    console.log('[sanitize-prompt] Original prompt:', prompt);

    // Use Gemini 2.5 Pro to convert user prompt to structured JSON
    const result = await generateText({
      model: google('gemini-2.0-flash-exp'),
      messages: [
        {
          role: 'system',
          content: `You are a prompt sanitizer that converts user requests into clean, structured JSON for website generation. Your job is to:

1. **Extract Key Information** from the user's natural language prompt
2. **Sanitize Text** - Remove any characters that could cause CSS/HTML parsing errors
3. **Structure Data** - Convert to clean JSON format
4. **Preserve Intent** - Keep the user's original request intent

**CRITICAL RULES:**
- NEVER include curly quotes, smart quotes, or special characters
- ALWAYS use straight quotes (' ")
- NEVER include raw CSS or HTML in the JSON
- ALWAYS escape apostrophes properly
- NEVER include emojis or special Unicode characters
- ALWAYS provide fallback values for missing information

**OUTPUT FORMAT - MUST BE VALID JSON:**
{
  "businessType": "string - type of business (e.g., tech education, restaurant, consulting)",
  "businessName": "string - extracted or generated business name",
  "description": "string - clean description without special characters",
  "industry": "string - industry category",
  "style": "string - modern, classic, minimal, bold, etc.",
  "colors": {
    "primary": "string - color preference or default",
    "secondary": "string - secondary color or default"
  },
  "sections": ["array of strings - required sections like hero, about, services, contact"],
  "features": ["array of strings - specific features requested"],
  "tone": "string - professional, friendly, technical, creative",
  "targetAudience": "string - who this website is for",
  "callToAction": "string - main action users should take",
  "sanitizedPrompt": "string - cleaned version of original prompt"
}

**EXAMPLES:**

Input: "Create a website for my tech education business"
Output: {
  "businessType": "tech education",
  "businessName": "TechEdu Solutions",
  "description": "Technology education and training company",
  "industry": "education",
  "style": "modern",
  "colors": {
    "primary": "blue",
    "secondary": "white"
  },
  "sections": ["hero", "about", "courses", "testimonials", "contact"],
  "features": ["course catalog", "student portal", "instructor profiles"],
  "tone": "professional",
  "targetAudience": "students and professionals seeking tech skills",
  "callToAction": "Start Learning Today",
  "sanitizedPrompt": "Create a modern website for a technology education business with course catalog and student portal"
}

Input: "I need a site for my café with online ordering"
Output: {
  "businessType": "cafe",
  "businessName": "Cozy Corner Cafe",
  "description": "Local cafe serving fresh coffee and pastries",
  "industry": "food and beverage",
  "style": "warm",
  "colors": {
    "primary": "brown",
    "secondary": "cream"
  },
  "sections": ["hero", "menu", "about", "location", "contact"],
  "features": ["online ordering", "menu display", "location map"],
  "tone": "friendly",
  "targetAudience": "coffee lovers and local community",
  "callToAction": "Order Online Now",
  "sanitizedPrompt": "Create a warm website for a cafe with online ordering and menu display"
}

**SANITIZATION RULES:**
- Replace all " " with " "
- Replace all ' ' with ' or escape as \'
- Remove all emojis and special Unicode
- Convert HTML entities to plain text
- Remove any potential CSS injection
- Keep text length reasonable (descriptions under 200 chars)

RESPOND ONLY WITH VALID JSON - NO MARKDOWN, NO EXPLANATIONS, JUST THE JSON OBJECT.`
        },
        {
          role: 'user',
          content: `Convert this user prompt to structured JSON: "${prompt}"`
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent output
    });

    console.log('[sanitize-prompt] Gemini response:', result.text);

    // Parse the JSON response
    let sanitizedData;
    try {
      // Clean the response in case Gemini adds markdown
      let jsonText = result.text.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      sanitizedData = JSON.parse(jsonText);
      
      // Validate required fields
      if (!sanitizedData.businessType || !sanitizedData.sanitizedPrompt) {
        throw new Error('Missing required fields in AI response');
      }
      
      console.log('[sanitize-prompt] Successfully parsed sanitized data:', sanitizedData);
      
    } catch (parseError) {
      console.error('[sanitize-prompt] Failed to parse AI response:', parseError);
      
      // Fallback sanitization if AI fails
      const fallbackData = {
        businessType: extractBusinessType(prompt),
        businessName: extractBusinessName(prompt) || 'Your Business',
        description: cleanText(prompt).substring(0, 200),
        industry: 'general',
        style: 'modern',
        colors: {
          primary: 'blue',
          secondary: 'white'
        },
        sections: ['hero', 'about', 'services', 'contact'],
        features: extractFeatures(prompt),
        tone: 'professional',
        targetAudience: 'customers and clients',
        callToAction: 'Get Started',
        sanitizedPrompt: cleanText(prompt)
      };
      
      console.log('[sanitize-prompt] Using fallback sanitization:', fallbackData);
      sanitizedData = fallbackData;
    }

    return NextResponse.json({
      success: true,
      originalPrompt: prompt,
      sanitizedData,
      sanitizedPrompt: sanitizedData.sanitizedPrompt
    });

  } catch (error) {
    console.error('[sanitize-prompt] Error:', error);
    
    // Ultimate fallback
    const ultimateFallback = {
      businessType: 'general',
      businessName: 'Your Business',
      description: 'A professional website for your business',
      industry: 'general',
      style: 'modern',
      colors: {
        primary: 'blue',
        secondary: 'white'
      },
      sections: ['hero', 'about', 'services', 'contact'],
      features: ['contact form', 'responsive design'],
      tone: 'professional',
      targetAudience: 'customers',
      callToAction: 'Contact Us',
      sanitizedPrompt: 'Create a professional website for a business'
    };

    return NextResponse.json({
      success: true,
      originalPrompt: request.body ? JSON.parse(await request.text()).prompt : 'unknown',
      sanitizedData: ultimateFallback,
      sanitizedPrompt: ultimateFallback.sanitizedPrompt,
      fallback: true
    });
  }
}

// Helper functions for fallback sanitization
function cleanText(text: string): string {
  return text
    .replace(/[""]/g, '"')  // Replace smart quotes
    .replace(/['']/g, "'")  // Replace smart apostrophes
    .replace(/[^\x00-\x7F]/g, "")  // Remove non-ASCII characters
    .replace(/[{}]/g, "")  // Remove potential CSS injection
    .trim();
}

function extractBusinessType(prompt: string): string {
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
}

function extractBusinessName(prompt: string): string | null {
  // Simple extraction - look for common patterns
  const namePatterns = [
    /for\s+([A-Z][a-zA-Z\s]+)/,
    /called\s+([A-Z][a-zA-Z\s]+)/,
    /named\s+([A-Z][a-zA-Z\s]+)/
  ];
  
  for (const pattern of namePatterns) {
    const match = prompt.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}

function extractFeatures(prompt: string): string[] {
  const features: string[] = [];
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('contact') || lowerPrompt.includes('form')) {
    features.push('contact form');
  }
  if (lowerPrompt.includes('gallery') || lowerPrompt.includes('images')) {
    features.push('image gallery');
  }
  if (lowerPrompt.includes('blog') || lowerPrompt.includes('news')) {
    features.push('blog section');
  }
  if (lowerPrompt.includes('testimonial') || lowerPrompt.includes('review')) {
    features.push('testimonials');
  }
  if (lowerPrompt.includes('order') || lowerPrompt.includes('shop')) {
    features.push('online ordering');
  }
  
  return features.length > 0 ? features : ['responsive design'];
}
