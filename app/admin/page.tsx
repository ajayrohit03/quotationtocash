import { redirect } from "next/navigation";

// Host-relative: on admin.* the proxy rewrites /businesses -> /admin/businesses.
export default function AdminIndex() {
  redirect("/businesses");
}
