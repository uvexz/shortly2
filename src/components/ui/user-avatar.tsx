import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'

const sizes = {
  xs: 'size-6 text-xs',
  sm: 'size-7 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-10 text-base',
}

export function UserAvatar({
  name,
  image,
  size = 'md',
  className,
}: {
  name: string
  image?: string | null
  size?: keyof typeof sizes
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-kumo-brand font-medium text-white',
        sizes[size],
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </span>
  )
}
