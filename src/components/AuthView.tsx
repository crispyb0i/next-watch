import {
  NeonAuthUIProvider,
  AuthView as NeonAuthView,
} from "@neondatabase/auth-ui";
import { authClient } from "../lib/auth/client";

const classNames = {
  base: "border-border/60 bg-surface-elevated/85 shadow-card w-full min-w-0 rounded-2xl border backdrop-blur-xl sm:rounded-3xl",
  header: "space-y-2 px-4 pt-5 sm:px-8 sm:pt-8",
  title: "text-text-primary text-xl font-black tracking-tight sm:text-2xl",
  description: "text-text-muted text-sm",
  content: "px-4 pb-5 sm:px-8 sm:pb-8",
  footer: "border-border/60 border-t px-4 py-4 text-center sm:px-8",
  footerLink: "text-accent hover:text-accent-hover font-semibold",
  separator: "bg-border",
  continueWith: "text-text-muted",
  form: {
    label: "text-text-primary font-semibold",
    input:
      "border-border bg-surface/70 text-text-primary placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-accent/30 h-11 rounded-xl",
    primaryButton:
      "bg-accent text-accent-contrast hover:bg-accent-hover h-11 rounded-xl font-bold shadow-lg shadow-brand-500/20",
    secondaryButton:
      "border-border bg-surface-muted text-text-primary hover:bg-surface h-11 rounded-xl",
    providerButton:
      "border-border bg-surface/70 text-text-primary hover:bg-surface-muted h-11 rounded-xl",
    forgotPasswordLink: "text-accent hover:text-accent-hover font-medium",
    error: "text-danger",
  },
};

export default function AuthView({ pathname }: { pathname: string }) {
  return (
    <NeonAuthUIProvider authClient={authClient} className="next-watch-auth">
      <NeonAuthView pathname={pathname} classNames={classNames} />
    </NeonAuthUIProvider>
  );
}
