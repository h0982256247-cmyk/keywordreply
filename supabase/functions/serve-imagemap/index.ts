import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Path format: /functions/v1/serve-imagemap/{docId}/{width}
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  // parts = ["functions", "v1", "serve-imagemap", "{docId}", "{width}"]
  const docId = parts[parts.length - 2];
  const widthStr = parts[parts.length - 1];

  if (!docId || !widthStr) {
    return new Response("Not found", { status: 404 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data, error } = await adminClient
    .from("docs")
    .select("content")
    .eq("id", docId)
    .single();

  if (error || !data) {
    return new Response("Doc not found", { status: 404 });
  }

  const imageUrl: string = data.content?.imageUrl;
  if (!imageUrl) {
    return new Response("No image URL", { status: 404 });
  }

  // Proxy the image (same image served for all LINE size variants)
  const imgRes = await fetch(imageUrl, {
    headers: { "User-Agent": "LineImagemapProxy/1.0" },
  });

  if (!imgRes.ok) {
    return new Response("Image fetch failed", { status: 502 });
  }

  const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
  const body = await imgRes.arrayBuffer();

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
