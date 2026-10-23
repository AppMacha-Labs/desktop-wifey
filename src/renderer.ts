import './index.css';
import { start } from './renderer/app';

start().catch((err) => console.error('[wifey] renderer failed to start', err));
