import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Prevent accidental mouse wheel scroll changes on focused <input type="number"> elements app-wide
document.addEventListener("wheel", () => {
  if (
    document.activeElement &&
    document.activeElement.tagName === "INPUT" &&
    document.activeElement.type === "number"
  ) {
    document.activeElement.blur();
  }
}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)