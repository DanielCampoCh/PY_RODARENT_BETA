import { NextResponse } from "next/server";
import { COOKIE_NAME, cookieOpts } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { ...cookieOpts, maxAge: 0 });
  return res;
}
