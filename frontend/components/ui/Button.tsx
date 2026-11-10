'use client'

import React from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonOwnProps {
  /** primary = confirm, accent = create something new (one per screen), danger = destructive (DESIGN.md §8.1) */
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  block?: boolean
}

export interface ButtonProps extends ButtonOwnProps, React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function buttonClass({ variant = 'primary', size = 'md', block }: ButtonOwnProps, className?: string) {
  return cx('mc-btn', `mc-btn--${variant}`, size !== 'md' && `mc-btn--${size}`, block && 'mc-btn--block', className)
}

function ButtonContent({ loading, icon, iconRight, children }: ButtonOwnProps & { children?: React.ReactNode }) {
  return (
    <>
      {loading ? <span className="mc-spinner mc-spinner--sm" aria-hidden="true" /> : icon}
      {children}
      {iconRight}
    </>
  )
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading = false, icon, iconRight, block, className, type = 'button', disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      <ButtonContent loading={loading} icon={icon} iconRight={iconRight}>
        {children}
      </ButtonContent>
    </button>
  )
})

interface ButtonLinkProps extends ButtonOwnProps, Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
}

/** A Next.js link that looks like a Button. */
export function ButtonLink({ href, variant, size, block, icon, iconRight, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass({ variant, size, block }, className)} {...props}>
      <ButtonContent icon={icon} iconRight={iconRight}>
        {children}
      </ButtonContent>
    </Link>
  )
}

export default Button
