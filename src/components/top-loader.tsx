import { useNavigation } from "react-router"

// Thin bar while a navigation or revalidation is in flight. Replaces the
// Next top loader, which listened to the Next router.
const TopLoader = () => {
  const navigation = useNavigation()
  if (navigation.state === "idle") return null
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="fixed inset-x-0 top-0 z-50 h-0.5 bg-primary"
    />
  )
}
TopLoader.displayName = "TopLoader"

export { TopLoader }
