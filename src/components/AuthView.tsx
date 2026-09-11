import {
  NeonAuthUIProvider,
  AuthView as NeonAuthView,
} from "@neondatabase/auth-ui";
import { authClient } from "../lib/auth/client";

const classNames = {
  base: "border-border/60 bg-surface-elevated/85 shadow-card rounded-3xl border backdrop-blur-xl",
  header: "space-y-2 px-6 pt-6 sm:px-8 sm:pt-8",
  title: "text-text-primary text-2xl font-black tracking-tight",
  description: "text-text-muted text-sm",
  content: "px-6 pb-6 sm:px-8 sm:pb-8",
  footer: "border-border/60 border-t px-6 py-4 sm:px-8",
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
