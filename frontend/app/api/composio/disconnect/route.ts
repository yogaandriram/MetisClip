import { Composio } from "@composio/core";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { agentId, platform } = await req.json();

    if (!agentId || !platform) {
      return NextResponse.json({ error: "Missing agentId or platform" }, { status: 400 });
    }

    const platformStr = platform.toLowerCase();
    const supabase = createRouteHandlerClient({ cookies });

    // Try to remove from Composio if API key exists
    if (process.env.COMPOSIO_API_KEY) {
      try {
        const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
        const accountsResponse = await composio.connectedAccounts.list({ userIds: [agentId] });
        const accounts = Array.isArray(accountsResponse) ? accountsResponse : ((accountsResponse as any).items || (accountsResponse as any).data || []);
        
        const connection = accounts.find((acc: any) => {
          const accApp = (acc.appName || '').toLowerCase();
          const accSlug = (acc.toolkit?.slug || '').toLowerCase();
          const accUnique = (acc.appUniqueId || '').toLowerCase();
          return (accApp === platformStr || accSlug === platformStr || accUnique === platformStr) && acc.status === 'ACTIVE';
        });

        if (connection && connection.id) {
            // Attempt to remove the connection from Composio
            // The exact method may vary by SDK version (e.g. remove, delete, deleteConnection)
            if (typeof (composio.connectedAccounts as any).delete === 'function') {
                await (composio.connectedAccounts as any).delete(connection.id);
            } else if (typeof (composio.connectedAccounts as any).remove === 'function') {
                await (composio.connectedAccounts as any).remove(connection.id);
            }
        }
      } catch (err) {
        console.warn("Could not remove connection from Composio directly, proceeding with database cleanup:", err);
      }
    }

    // Always clean up our own database
    const { error: deleteError } = await supabase
      .from('agent_social_connections')
      .delete()
      .eq('agent_id', agentId)
      .eq('platform', platformStr);

    if (deleteError) {
      return NextResponse.json({ error: "Gagal menghapus koneksi dari database" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Composio Disconnect Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
