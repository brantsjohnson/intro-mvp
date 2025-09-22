import { UserProfile } from "@/components/profile/user-profile"

interface ProfilePageProps {
  params: Promise<{
    userId: string
  }>
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { userId } = await params
  return <UserProfile userId={userId} />
}
