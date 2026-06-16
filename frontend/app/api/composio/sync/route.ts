import { Composio } from "@composio/core";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { agentId, appName } = await req.json();

    if (!agentId || !appName) {
      return NextResponse.json({ error: "Missing agentId or appName" }, { status: 400 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "Missing COMPOSIO_API_KEY" }, { status: 500 });
    }

    const supabase = createRouteHandlerClient({ cookies });

    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    
    // Get the connected accounts for this entity
    const accountsResponse = await composio.connectedAccounts.list({
      userIds: [agentId]
    });

    const accounts = Array.isArray(accountsResponse) ? accountsResponse : ((accountsResponse as any).items || (accountsResponse as any).data || []);
    const searchName = appName.toLowerCase();
    
    const connection = accounts.find((acc: any) => {
      const accApp = (acc.appName || '').toLowerCase();
      const accSlug = (acc.toolkit?.slug || '').toLowerCase();
      const accUnique = (acc.appUniqueId || '').toLowerCase();
      
      return (accApp === searchName || accSlug === searchName || accUnique === searchName) && 
              acc.status === 'ACTIVE';
    });

    if (connection) {
      const platformStr = appName.toLowerCase(); // youtube, tiktok, instagram
      
      // Upsert into agent_social_connections
      // Note: Make sure there's a unique constraint on (agent_id, platform) in the DB
      // for this to work perfectly. Even without it, onConflict acts to resolve duplicates.
      const { error: upsertError } = await supabase
        .from('agent_social_connections')
        .upsert({
          agent_id: agentId,
          platform: platformStr,
          platform_account_id: connection.id,
          platform_account_name: 'Terhubung via Composio',
          updated_at: new Date().toISOString()
        }, { onConflict: 'agent_id,platform' });

      if (upsertError) {
         console.error("Upsert error in sync:", upsertError);
         // Fallback just in case onConflict fails due to missing constraint
         // We do a manual delete and insert
         await supabase.from('agent_social_connections').delete().eq('agent_id', agentId).eq('platform', platformStr);
         await supabase.from('agent_social_connections').insert({
            agent_id: agentId,
            platform: platformStr,
            platform_account_id: connection.id,
            platform_account_name: 'Terhubung via Composio',
         });
      }

      return NextResponse.json({ success: true, connection });
    } else {
      return NextResponse.json({ error: "Connection not found in Composio" }, { status: 404 });
    }

  } catch (error: any) {
    console.error("Composio Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
