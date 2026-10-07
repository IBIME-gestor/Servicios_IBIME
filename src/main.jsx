import React from 'react'
import ReactDOM from 'react-dom/client'
import * as AppModule from './App.jsx'
import './styles/theme.css'

const App = AppModule.default || AppModule.App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
