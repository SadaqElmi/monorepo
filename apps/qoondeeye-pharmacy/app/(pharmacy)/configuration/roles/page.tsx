import { redirect } from "next/navigation";

export default function ConfigurationRolesRedirectPage() {
  redirect("/users/roles");
}
