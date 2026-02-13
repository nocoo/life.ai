import { auth } from "@/lib/auth";
import { DashboardLayout } from "@/components/DashboardLayout";

export default async function DashboardGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
        image: session.user.image ?? undefined,
      }
    : undefined;

  return <DashboardLayout user={user}>{children}</DashboardLayout>;
}
