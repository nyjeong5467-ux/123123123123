import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  sm?: boolean
}
export function Button({ variant = 'ghost', sm, className = '', ...rest }: BtnProps) {
  return <button className={`btn btn-${variant}${sm ? ' btn-sm' : ''} ${className}`} {...rest} />
}

export function StatBlock({
  label, value, unit, delta, deltaTone, tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  deltaTone?: 'up' | 'down'
  tone?: 'accent' | 'danger'
}) {
  return (
    <div className={`stat${tone ? ' ' + tone : ''}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {delta && <div className={`delta${deltaTone ? ' ' + deltaTone : ''}`}>{delta}</div>}
    </div>
  )
}

type ChipTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted' | 'outline'
export function Chip({ tone = 'muted', pip, children }: { tone?: ChipTone; pip?: boolean; children: ReactNode }) {
  return (
    <span className={`chip chip-${tone}`}>
      {pip && <span className="pip" />}
      {children}
    </span>
  )
}

export function Progress({ value, tone }: { value: number; tone?: 'warn' | 'danger' }) {
  return (
    <div className="progress">
      <div className="track">
        <div className={`fill${tone ? ' ' + tone : ''}`} style={{ width: `${value}%` }} />
      </div>
      <span className="pct">{value}%</span>
    </div>
  )
}

export function Card({
  title, tag, tools, children,
}: {
  title?: ReactNode
  tag?: string
  tools?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {(title || tools) && (
        <div className="card-head">
          <h2>
            {title}
            {tag && <span className="card-tag">{tag}</span>}
          </h2>
          {tools && <div className="card-tools">{tools}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({
  crumb, title, sub, actions,
}: {
  crumb?: ReactNode
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <>
      {crumb && <div className="breadcrumb">{crumb}</div>}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  )
}
