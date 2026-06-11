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

    const accounts = Array.isArray(accountsResponse) ? accountsResponse : (accountsResponse.items || accountsResponse.data || []);
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
      const { error: upsertError } = await supabase
        .from('agent_social_connections')
        .upsert({
          agent_id: agentId,
          platform: platformStr,
          platform_account_id: connection.id,
          platform_account_name: 'Terhubung via Composio',
          updated_at: new Date().toISOString()
        }, { onConflict: 'agent_id,platform' }); // Assuming unique constraint or we just delete and insert

      // Let's do a safe approach: Check if exists, update or insert
      const { data: existing } = await supabase
        .from('agent_social_connections')
        .select('*')
        .eq('agent_id', agentId)
        .eq('platform', platformStr)
        .single();

      if (existing) {
        await supabase
          .from('agent_social_connections')
          .update({
            platform_account_id: connection.id,
            platform_account_name: 'Terhubung via Composio',
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('agent_social_connections')
          .insert({
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
