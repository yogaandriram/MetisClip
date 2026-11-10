import React from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

export type IconButtonVariant = 'surface' | 'ghost' | 'outline' | 'ink' | 'accent'
export type TooltipPlacement = 'top' | 'bottom' | 'right' | 'end'

interface IconButtonOwnProps {
  /** Accessible name; also shown as the tooltip */
  label: string
  icon: React.ReactNode
  variant?: IconButtonVariant
  size?: 'sm' | 'md' | 'lg'
  /** Tooltip position, or false to rely on a visible label nearby */
  tooltip?: TooltipPlacement | false
}

export function iconButtonClass(
  { variant = 'surface', size = 'md', tooltip = 'top' }: Pick<IconButtonOwnProps, 'variant' | 'size' | 'tooltip'>,
  className?: string,
) {
  return cx(
    'mc-icon-btn',
    variant !== 'surface' && `mc-icon-btn--${variant}`,
    size !== 'md' && `mc-icon-btn--${size}`,
    tooltip && 'mc-tip',
    tooltip && tooltip !== 'top' && `mc-tip--${tooltip}`,
    className,
  )
}

export interface IconButtonProps extends IconButtonOwnProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {}

/** Round icon-only button with an aria-label and a tooltip (DESIGN.md §8.1, §8.10). */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant, size, tooltip = 'top', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-tip={tooltip ? label : undefined}
      className={iconButtonClass({ variant, size, tooltip }, className)}
      {...props}
    >
      {icon}
    </button>
  )
})

interface IconLinkProps extends IconButtonOwnProps, Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  href: string
}

export function IconLink({ href, label, icon, variant, size, tooltip = 'top', className, ...props }: IconLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-tip={tooltip ? label : undefined}
      className={iconButtonClass({ variant, size, tooltip }, className)}
      {...props}
    >
      {icon}
    </Link>
  )
}

export default IconButton
