import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-4 shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="card-header"
      className={cn('grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4', className)}
      {...props}
    />
  )
}

const CardTitle = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

const CardDescription = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return <div data-slot="card-content" className={cn('px-4', className)} {...props} />
}

const CardFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-4', className)} {...props} />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
