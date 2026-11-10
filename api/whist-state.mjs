export default {
  async fetch(request) {
    const headers = {"Cache-Control":"no-store","Content-Type":"application/json"};
    if (!["GET","PUT"].includes(request.method)) return Response.json({error:"method"},{status:405,headers});
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({error:"unauthorized"},{status:401,headers});
    if (!process.env.SUPABASE_URL) return Response.json({error:"unavailable"},{status:503,headers});
    try {
      const response = await fetch(process.env.SUPABASE_URL + "/functions/v1/whist-state", {
        method:request.method,
        headers:{Authorization:authorization,"Content-Type":"application/json",
          "X-Whist-Environment":process.env.VERCEL_ENV === "production" ? "production" : "preview"},
        body:request.method === "PUT" ? await request.text() : undefined,
        signal:AbortSignal.timeout(10000),redirect:"error",
      });
      return new Response(response.body,{status:response.status,headers});
    } catch {
      console.error("Whist storage request failed");
      return Response.json({error:"unavailable"},{status:503,headers});
    }
  },
};
