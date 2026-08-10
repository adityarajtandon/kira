import { X } from 'lucide-react';
export default function Toast({ message, onClose }) { if (!message) return null; return <div className="toast" role="alert"><span>{message}</span><button onClick={onClose} aria-label="Dismiss"><X size={16}/></button></div>; }

