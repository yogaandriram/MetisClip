import { Composio } from "@composio/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { agentId, appName } = await req.json();

    if (!agentId || !appName) {
      return NextResponse.json({ error: "Missing agentId or appName" }, { status: 400 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "Missing COMPOSIO_API_KEY" }, { status: 500 });
    }

    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    
    // Create a session for this specific agentId
    // In Composio, this agentId acts as the entity/user ID
    const session = await composio.create(agentId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    // Initialize auth flow
    const connectionRequest = await session.authorize(appName, {
      callbackUrl: `${siteUrl}/settings?composio_connected=${appName}`,
    });

    return NextResponse.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (error: any) {
    console.error("Composio Connect Error:", error);
    // Return full error structure if possible for debugging
    const errorMsg = error.message || JSON.stringify(error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
