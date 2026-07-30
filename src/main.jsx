import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { FeedbackProvider } from './context/FeedbackContext';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { FaseImplantacaoProvider } from './context/FaseImplantacaoContext';
import App from './App';
import './styles/global.css';

const isElectron = typeof window !== 'undefined' && typeof window.api?.login === 'function';
const Router = isElectron ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <FeedbackProvider>
        <AuthProvider>
          <OfflineProvider>
            <FaseImplantacaoProvider>
              <App />
            </FaseImplantacaoProvider>
          </OfflineProvider>
        </AuthProvider>
      </FeedbackProvider>
    </Router>
  </React.StrictMode>
);
