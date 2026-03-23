import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './styles.css';

// Apply saved theme before render to minimize flash
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </ErrorBoundary>
);
