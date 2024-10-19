import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/register';
import HomePage from './components/HomePage';
import VideoPlayer from './components/VideoPlayer';
import VerifyEmail from './components/VerifyEmail'; // Import VerifyEmail component
import './App.css';

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(''); // Store username for verification

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('token');
  };

  return (
    <Router>
      <div>
        <nav>
          <Link to="/">Home</Link> | 
          {!token && <Link to="/login">Login</Link>} | 
          {!token && <Link to="/signup">Signup</Link>} |
          {token && <button className='button' onClick={handleLogout}>Logout</button>}
        </nav>
        <Routes>
          {/* Home route */}
          <Route 
            path="/" 
            element={
              <div className="home-page-container"> 
                <HomePage token={token} />
              </div>
            } 
          />

          {/* Login route */}
          <Route 
            path="/login" 
            element={
              <div className='login-container'>
                <Login 
                  setToken={(newToken) => {
                    setToken(newToken);
                    localStorage.setItem('token', newToken);
                  }} 
                />
              </div>
            } 
          />

          {/* Signup route */}
          <Route 
            path="/signup" 
            element={
              <div className='signup-container'>
                <Signup 
                  setUsername={(name) => setUsername(name)} /> 
              </div>
            } 
          />

          {/* Email Verification route */}
          <Route 
            path="/confirm" 
            element={
              <div className='verification-container'>
                <VerifyEmail username={username} /> 
              </div>
              
            } 
          />

          {/* VideoPlayer route (protected) */}
          <Route 
            path="/video/:id" 
            element={token ? <VideoPlayer token={token} /> : <Login setToken={(newToken) => { setToken(newToken); localStorage.setItem('token', newToken); }} />}
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
