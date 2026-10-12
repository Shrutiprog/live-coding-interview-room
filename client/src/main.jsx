import './monacoSetup.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<Room />} />
      <Route path="*" element={<Home />} />
    </Routes>
  </BrowserRouter>
);
