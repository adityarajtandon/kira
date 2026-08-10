export default function Avatar({ name='', size='md' }) { const initials = name.split(' ').filter(Boolean).slice(0,2).map((part)=>part[0]).join('').toUpperCase() || '?'; return <span className={`avatar avatar-${size}`} title={name}>{initials}</span>; }

