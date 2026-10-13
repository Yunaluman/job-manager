import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant, className = '', type = 'button', ...props }, ref) {
  const style = variant ?? (className.includes('app-primary') ? 'primary' : 'secondary')
  return <button ref={ref} type={type} className={`${style === 'primary' ? 'app-primary' : style === 'quiet' ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm hover:bg-subtle disabled:opacity-50' : 'app-button'} ${className}`} {...props} />
})
