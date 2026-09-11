import { useEffect, useRef } from "react";
import {
  NeonAuthUIProvider,
  ChangeEmailCard,
  ChangePasswordCard,
  SessionsCard,
  UpdateAvatarCard,
  UpdateNameCard,
  type SettingsCardClassNames,
} from "@neondatabase/auth-ui";
import { authClient, syncCurrentProfile } from "../lib/auth/client";
import { notify, type NotificationKind } from "../lib/notifications";

// The vendor cards ship shadcn defaults; map their slots onto our design tokens
// so settings reads like the rest of the app.
const cardClassNames: SettingsCardClassNames = {
  // Vendor card headers need more breathing room, but horizontal padding must
  // stay on their child slots or the avatar can overflow on narrow screens.
  base: "border-border/60 bg-surface-elevated/70 shadow-card rounded-card border pt-8 backdrop-blur-xl [&_[data-slot=dropdown-menu-trigger]]:me-8",
  title: "text-text-primary text-base font-bold tracking-tight",
  description: "text-text-muted text-sm",
  footer: "border-border/60 bg-surface-muted/40 rounded-b-card text-text-muted",
  instructions: "text-text-muted text-xs",
  label: "text-text-primary text-sm font-semibold",
  input:
    "border-border/60 bg-surface text-text-primary placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-accent/30 rounded-xl",
  cell: "border-border/60 bg-surface/60 rounded-xl",
  // The footer action button renders without an explicit variant, so only the
  // `button` slot reaches it; `destructiveButton` is merged after it.
  button:
    "bg-accent text-accent-contrast hover:bg-accent-hover rounded-full px-5 font-semibold shadow-none",
  primaryButton:
    "bg-accent text-accent-contrast hover:bg-accent-hover rounded-full px-5 font-semibold shadow-none",
  destructiveButton:
    "bg-danger text-accent-contrast hover:bg-danger/90 rounded-full px-5 font-semibold",
  outlineButton:
    "border-border/60 text-text-primary hover:bg-surface-muted rounded-full bg-transparent",
  secondaryButton: "bg-surface-muted text-text-primary rounded-full",
  skeleton: "bg-surface-muted",
  avatar: {
    base: "ring-accent/25 ring-2 ring-inset",
    fallback:
      "from-brand-400 to-brand-600 text-accent-contrast bg-linear-to-br",
  },
  error: "text-danger text-sm",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-text-primary text-sm font-bold tracking-wide uppercase">
          {title}
        </h2>
        <p className="text-text-muted text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SettingsCards() {
  const { data: session, isPending } = authClient.useSession();
  const previousImage = useRef<string | null>(null);
  const hasImage = useRef(false);

  useEffect(() => {
    if (!isPending && !session) window.location.href = "/auth/sign-in";
  }, [isPending, session]);

  useEffect(() => {
    if (!session) return;
    const image = session.user.image ?? null;
    if (hasImage.current && image !== previousImage.current) {
      notify(image ? "Avatar uploaded successfully." : "Avatar removed.");
    }
    previousImage.current = image;
    hasImage.current = true;

    void syncCurrentProfile({ name: session.user.name, image });
  }, [session?.user.image, session?.user.name]);

  if (isPending || !session) {
    return (
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border-border/60 bg-surface-elevated/60 rounded-card h-40 animate-pulse border"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <Section title="Profile" description="How you show up across Next Watch.">
        <UpdateAvatarCard classNames={cardClassNames} />
        <UpdateNameCard classNames={cardClassNames} />
      </Section>

      <Section
        title="Security"
        description="Sign-in credentials and active devices."
      >
        <ChangeEmailCard classNames={cardClassNames} />
        <ChangePasswordCard classNames={cardClassNames} />
        <SessionsCard classNames={cardClassNames} />
      </Section>
    </div>
  );
}

export default function AccountSettings() {
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      avatar
      toast={({ variant = "info", message }) =>
        notify(
          message ?? "Account settings updated.",
          (variant === "error"
            ? "error"
            : variant === "success"
              ? "success"
              : "info") as NotificationKind,
        )
      }
    >
      <SettingsCards />
    </NeonAuthUIProvider>
  );
}
