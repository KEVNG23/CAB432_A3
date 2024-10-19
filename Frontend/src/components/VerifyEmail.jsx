// src/components/VerifyEmail.jsx
import React, { useState } from 'react';
import { verifyEmail } from '../api';
import { useNavigate, useLocation } from 'react-router-dom';
import '../CSS/EmailVerification.css'; // Import the CSS file

const VerifyEmail = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  
  // Access the username passed from the Signup component
  const username = location.state?.username || '';

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      await verifyEmail(username, code);
      navigate('/login'); // Redirect to login after successful verification
    } catch (err) {
      setError(err.message); // Display error message from API
    }
  };

  return (
    <div className="verification-container"> {/* Apply the container class */}
      <h2>Verify Email</h2>
      <form onSubmit={handleVerify}>
        <div>
          <label>Username</label>
          <input type="text" value={username} disabled required />
        </div>
        <div>
          <label>Confirmation Code</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        {error && <p>{error}</p>}
        <button className="button" type="submit">Verify</button> {/* Add button class */}
      </form>
    </div>
  );
};

export default VerifyEmail;
