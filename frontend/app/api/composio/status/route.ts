import { Composio } from "@composio/core";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const appName = searchParams.get('appName');

    if (!agentId || !appName) {
      return NextResponse.json({ error: "Missing agentId or appName" }, { status: 400 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "Missing COMPOSIO_API_KEY" }, { status: 500 });
    }

    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    
    try {
      // Get the connected accounts for this entity
      const accountsResponse = await composio.connectedAccounts.list({
        userIds: [agentId]
      });

      // Response might be an array or an object with an items/data array depending on SDK version
      const accounts = Array.isArray(accountsResponse) ? accountsResponse : (accountsResponse.items || accountsResponse.data || []);

      const searchName = appName.toLowerCase();
      const connection = accounts.find((acc: any) => {
        const accApp = (acc.appName || '').toLowerCase();
        const accSlug = (acc.toolkit?.slug || '').toLowerCase();
        const accUnique = (acc.appUniqueId || '').toLowerCase();
        
        return (accApp === searchName || accSlug === searchName || accUnique === searchName) && 
               acc.status === 'ACTIVE';
      });

      return NextResponse.json({ 
        isConnected: !!connection, 
        connectedAccountId: connection ? connection.id : null 
      });
    } catch (e: any) {
      // Usually throws if not found
      return NextResponse.json({ isConnected: false });
    }
    
  } catch (error: any) {
    console.error("Composio Status Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
