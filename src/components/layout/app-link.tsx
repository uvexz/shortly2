import { forwardRef } from 'react'
import { Link } from '@tanstack/react-router'

type AppLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string
  to?: string
}

function isExternal(href: string) {
  return (
    /^https?:\/\//i.test(href) ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#') ||
    href.includes('?')
  )
}

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  ({ href, to, children, ...props }, ref) => {
    const target = href ?? to ?? '#'

    if (isExternal(target)) {
      return (
        <a ref={ref} href={target} {...props}>
          {children}
        </a>
      )
    }

    return (
      <Link ref={ref} to={target as never} {...props}>
        {children}
      </Link>
    )
  },
)

AppLink.displayName = 'AppLink'
