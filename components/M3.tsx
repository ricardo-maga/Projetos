import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
type Tone = 'filled' | 'tonal' | 'text';
export function M3Card({ className = '', children, ...props }: HTMLAttributes<HTMLElement>) { return <section className={`m3-card ${className}`} {...props}>{children}</section>; }
export function M3Button({ tone = 'filled', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode }) { return <button className={`m3-button m3-button--${tone} ${className}`} {...props}>{children}</button>; }
export function M3IconButton({ className = '', label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) { return <button className={`m3-icon-button inline-flex ${className}`} aria-label={label} title={label} {...props}>{children}</button>; }
export function M3SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) { return <div className="m3-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions ? <div className="m3-section-header__actions">{actions}</div> : null}</div>; }

