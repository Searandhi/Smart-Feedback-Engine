import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to proxy requests to Judge0 API for code submissions
 * This avoids CORS issues when calling Judge0 directly from the browser
 */
export async function POST(request: NextRequest) {
  // Parse the request body
  const payload = await request.json();
  
  // Forward the request to Judge0
  const judge0Url = (process.env.JUDGE0_API_URL && process.env.JUDGE0_API_URL !== 'LINK_TO_JUDGE0_API')
    ? process.env.JUDGE0_API_URL 
    : 'http://localhost:2358';
  
  try {
    const response = await fetch(`${judge0Url}/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // If the response wasn't successful, throw an error
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Judge0 API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    // Get the JSON response
    const data = await response.json();

    // Return the data from Judge0
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Judge0 Submission Error:", error);
    const networkError = error?.code === 'ECONNREFUSED' || error?.message?.includes('fetch failed');
    if (networkError) {
      return NextResponse.json(
        {
          error: `Cannot reach Judge0 at ${judge0Url}. Please start a local Judge0 instance or set JUDGE0_API_URL in .env.local to a valid Judge0 endpoint.`,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Internal Server Error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }

} 