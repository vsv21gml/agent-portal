import { redirect } from "next/navigation";

export default function AdminRedirectPage() {
  redirect(process.env.NEXT_PUBLIC_ADMIN_WEB_URL ?? "http://localhost:3100");
}
