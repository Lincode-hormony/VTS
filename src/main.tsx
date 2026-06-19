import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToolWorkspace } from './components/ToolWorkspace';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ToolWorkspace />
  </React.StrictMode>
);
