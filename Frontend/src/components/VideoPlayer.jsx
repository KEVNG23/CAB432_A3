import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import '../CSS/VideoPlayer.css'; // Import the CSS file

const API_URL = 'http://localhost:5000';

const VideoPlayer = () => {
  const { id } = useParams();
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Added to handle errors
  const token = localStorage.getItem('accessToken');

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        if (!token) {
          throw new Error('No access token found');
        }

        const response = await axios.get(`${API_URL}/videos/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 70000 // Set timeout to 70 seconds
        });

        setVideoUrl(response.data.url);
      } catch (err) {
        console.error('Error fetching video URL:', err);
        setError(err.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id, token]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;  // Error handling
  if (!videoUrl) return <div>Video not found</div>;

  return (
    <div className="video-player-container">
      <h2>Playing video</h2>
      <video width="600" controls>
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPlayer;
