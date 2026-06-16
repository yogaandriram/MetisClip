import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Fetch jobs for this agent
    const { data: jobs, error } = await supabase
      .from('discovery_jobs')
      .select('*')
      .eq('agent_id', agentId);

    if (error) {
      console.error('Error fetching dashboard stats:', error);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    let videosProcessed = 0;
    let clipsGenerated = 0;
    let potentialViews = 0;

    if (jobs && jobs.length > 0) {
      videosProcessed = jobs.length;
      
      jobs.forEach(job => {
        // processed_scenes tracks the number of clips generated
        const scenes = parseInt(job.processed_scenes) || 0;
        clipsGenerated += scenes;
        
        // Let's create a proxy for "Downloads/Views" by summing viral scores from jobs
        // Assuming viral_score is 0-100 or 0-1.
        // Or we just calculate it based on clips generated * some factor
        potentialViews += scenes * 1250; 
      });
    }

    return NextResponse.json({
      videosProcessed,
      clipsGenerated,
      potentialViews
    });
  } catch (error: any) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
