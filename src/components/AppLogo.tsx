import type { ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type AppLogoProps = ImgHTMLAttributes<HTMLImageElement>

export default function AppLogo({ alt = 'marko', className, ...props }: AppLogoProps) {
  return (
    <img
      src="/marko.svg"
      alt={alt}
      draggable={false}
      className={cn('block select-none', className)}
      {...props}
    />
  )
}
