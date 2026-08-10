import { Link } from 'react-router-dom'; import Logo from '../components/Logo';
export default function NotFound(){return <div className="not-found"><Logo/><span>404</span><h1>This page wandered off.</h1><p>The work is probably somewhere else.</p><Link className="button primary" to="/">Return home</Link></div>}

