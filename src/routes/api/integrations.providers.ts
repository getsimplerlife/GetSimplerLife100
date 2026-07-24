import { integrations } from "../../content/integrations";

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0");
  const limit = parseInt(url.searchParams.get("limit") || "180");
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const category = url.searchParams.get("category") || "";

  let filtered = integrations.map((p: any) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    category: p.category,
    description: p.description || "",
    capabilities: p.capabilities || [],
    industries: p.industries || [],
    relatedWorkflows: p.relatedWorkflows || [],
  }));

  if (search) {
    filtered = filtered.filter(
      (p: any) =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search) ||
        (p.description && p.description.toLowerCase().includes(search))
    );
  }
  if (category) {
    filtered = filtered.filter((p: any) => p.category === category);
  }

  const total = filtered.length;
  const start = page * limit;
  const paged = filtered.slice(start, start + limit);

  return new Response(JSON.stringify({ data: paged, total }), {
    headers: { "Content-Type": "application/json" },
  });
}
