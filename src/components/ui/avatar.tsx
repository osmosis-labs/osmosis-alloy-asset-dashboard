import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

// Which card colours a logo is hard to see on: light (white) and dark
// (osmoverse-900).
type LogoContrast = { lowOnLight: boolean; lowOnDark: boolean }

const CARD_LUMINANCE = { light: 1, dark: 0.0068 }

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

// A logo is low contrast on a card when much of it is transparent (more than
// a round logo's corners) and fewer than half of its drawn pixels reach 3:1
// against the card. FET's black logo fails on dark; a white-only logo fails
// on light. Logos that fill their circle carry their own background.
const measureLogo = async (src: string): Promise<LogoContrast> => {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.src = src
  await img.decode()
  const size = 32
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) throw new Error("no 2d context")
  context.drawImage(img, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)
  let drawn = 0
  let visibleOnLight = 0
  let visibleOnDark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    drawn++
    const luminance =
      0.2126 * channel(data[i]) +
      0.7152 * channel(data[i + 1]) +
      0.0722 * channel(data[i + 2])
    if (contrast(luminance, CARD_LUMINANCE.light) >= 3) visibleOnLight++
    if (contrast(luminance, CARD_LUMINANCE.dark) >= 3) visibleOnDark++
  }
  const transparent = 1 - drawn / (size * size)
  if (drawn === 0 || transparent <= 0.3) {
    return { lowOnLight: false, lowOnDark: false }
  }
  return {
    lowOnLight: visibleOnLight / drawn < 0.5,
    lowOnDark: visibleOnDark / drawn < 0.5,
  }
}

// One measurement per logo URL for the page's lifetime. A logo that cannot be
// read (no CORS, decode failure) gets no disc.
const logoContrastCache = new Map<string, Promise<LogoContrast>>()
const logoContrast = (src: string) => {
  let entry = logoContrastCache.get(src)
  if (!entry) {
    entry = measureLogo(src).catch(() => ({
      lowOnLight: false,
      lowOnDark: false,
    }))
    logoContrastCache.set(src, entry)
  }
  return entry
}

// The disc shows through the logo's transparent pixels, only in the theme
// the logo is hard to see in.
const discClass = ({ lowOnLight, lowOnDark }: LogoContrast) =>
  cn(
    lowOnLight && "bg-primary/85",
    lowOnDark
      ? "dark:bg-muted-foreground/85"
      : lowOnLight && "dark:bg-transparent"
  )

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  const [disc, setDisc] = React.useState<string>()
  React.useEffect(() => {
    setDisc(undefined)
    if (!src) return
    let current = true
    logoContrast(src).then((c) => {
      if (current) setDisc(discClass(c))
    })
    return () => {
      current = false
    }
  }, [src])
  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={src}
      className={cn("aspect-square h-full w-full", disc, className)}
      {...props}
    />
  )
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
