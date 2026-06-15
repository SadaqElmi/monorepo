export function bindingBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "bound") return "default";
  if (status === "revoked") return "destructive";
  return "secondary";
}
