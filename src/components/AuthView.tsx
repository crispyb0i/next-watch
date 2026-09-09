import {
  NeonAuthUIProvider,
  AuthView as NeonAuthView,
} from "@neondatabase/auth-ui";
import { authClient } from "../lib/auth/client";

export default function AuthView({ pathname }: { pathname: string }) {
  return (
    <NeonAuthUIProvider authClient={authClient}>
      <NeonAuthView pathname={pathname} />
    </NeonAuthUIProvider>
  );
}
