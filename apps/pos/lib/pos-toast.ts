import { toast } from "sonner";

const DEFAULT_DURATION = {
  error: 6500,
  warning: 6000,
  info: 5500,
  success: 4800,
} as const;

/** Consistent POS notifications — short titles, clear descriptions. */
export const posToast = {
  error(title: string, description?: string) {
    toast.error(title, {
      description: description?.trim() || undefined,
      duration: DEFAULT_DURATION.error,
    });
  },
  warning(title: string, description?: string) {
    toast.warning(title, {
      description: description?.trim() || undefined,
      duration: DEFAULT_DURATION.warning,
    });
  },
  info(title: string, description?: string) {
    toast.info(title, {
      description: description?.trim() || undefined,
      duration: DEFAULT_DURATION.info,
    });
  },
  success(title: string, description?: string) {
    toast.success(title, {
      description: description?.trim() || undefined,
      duration: DEFAULT_DURATION.success,
    });
  },
};
