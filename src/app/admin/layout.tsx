import { redirect } from "next/navigation"
import { createServerComponentClient } from "@/lib/supabase-server"
import { isPlatformAdminUser } from "@/lib/platform-admin"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth")
  }

  const allowed = await isPlatformAdminUser(user.id)
  if (!allowed) {
    redirect("/home")
  }

  return <>{children}</>
}
