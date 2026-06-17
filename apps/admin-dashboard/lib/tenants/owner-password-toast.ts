import { toast } from "sonner";

type TemporaryOwnerPasswordToastOptions = {
  title?: string;
  tenantName?: string;
};

export function showTemporaryOwnerPasswordToast(
  password: string,
  options: TemporaryOwnerPasswordToastOptions = {},
): void {
  const title = options.title ?? "Temporary owner password";
  const tenantSuffix = options.tenantName ? ` · ${options.tenantName}` : "";

  toast.success(`${title}${tenantSuffix}`, {
    description: password,
    duration: 60_000,
    classNames: {
      description: "font-mono text-sm break-all",
    },
    action: {
      label: "Copy",
      onClick: () => {
        void navigator.clipboard.writeText(password).then(() => {
          toast.success("Password copied to clipboard");
        });
      },
    },
  });
}
