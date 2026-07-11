import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { FeedbackProvider } from './context/FeedbackContext';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { FaseImplantacaoProvider } from './context/FaseImplantacaoContext';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <FeedbackProvider>
        <AuthProvider>
          <OfflineProvider>
            <FaseImplantacaoProvider>
              <App />
            </FaseImplantacaoProvider>
          </OfflineProvider>
        </AuthProvider>
      </FeedbackProvider>
    </HashRouter>
  </React.StrictMode>
);
