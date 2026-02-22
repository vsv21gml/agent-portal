import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

async function proxy(request: NextRequest, method: string, path: string[]) {
  const targetUrl = `${BACKEND_URL}/${path.join("/")}${request.nextUrl.search}`;
  const authHeader = request.headers.get("authorization");
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  const response = await fetch(targetUrl, {
    method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body,
    cache: "no-store",
  });

  const responseText = await response.text();
  return new NextResponse(responseText, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, "GET", path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, "POST", path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, "PATCH", path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, "PUT", path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, "DELETE", path);
}
